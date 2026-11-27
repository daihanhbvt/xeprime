import { useCallback, useMemo, useRef, useState } from 'react';
import { ScrollView, type LayoutChangeEvent } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useHideTabBar } from '@/components/layout/tab-bar-visibility';
import { goBackOr } from '@/navigation/go-back-or';
import { useForm, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import * as yup from 'yup';
import { useLocale, useTranslations } from 'use-intl';
import {
  INSURANCE_MODE,
  PERMISSION,
  RENTAL_TERMS_GROUP,
  RENTAL_TERMS_GROUP_VALUES,
  RENTAL_TERMS_MAX_LENGTH,
  type RentalTermsGroup,
  TURNAROUND_BUFFER_MAX_MINUTES,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  type VehicleType,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Chip } from '@/components/ui/Chip';
import { InfoCard } from '@/components/ui/InfoCard';
import { SegmentedTabs } from '@/components/ui/SegmentedTabs';
import { SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { DepositSettingsSection } from '@/features/shop/components/DepositSettingsSection';
import { VatInvoiceSection } from '@/features/shop/components/VatInvoiceSection';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { POLICY_ANCHOR, PolicySections, type PolicyAnchor } from './components/PolicySections';
import { TurnaroundBufferField } from './components/TurnaroundBufferField';
import {
  RentalConditionsCard,
  type RentalTermsFormGroup,
  type RentalTermsFormValues,
} from './components/RentalConditionsCard';
import { InsuranceModeBlock } from './components/InsuranceModeBlock';
import { formToSaveInput, policyToForm } from './form';
import { policyFormSchema, type PolicyFormValues } from './schema';
import {
  useSaveShopOperationDefaults,
  useSaveShopPolicy,
  useSaveShopRentalTerms,
  useShopInsuranceImpact,
  useShopOperationDefaults,
  useShopPolicy,
  useShopRentalTerms,
} from './hooks/use-shop-policy';
import type {
  RentalPolicyValues,
  SaveRentalPolicyInput,
  SaveTenantRentalTermsInput,
  ShopOperationDefaults,
  ShopRentalPolicy,
  TenantRentalTerms,
} from './api';

/**
 * Chính sách thuê MẶC ĐỊNH của gian hàng (SHP-04) — bản native của `/manage/shop/policies`.
 *
 * Mỗi LOẠI XE một bộ chính sách riêng, đúng như web: dải chip trên đầu đổi loại xe, và mỗi loại
 * có query, mutation và form RIÊNG (`key={vehicleType}` ép remount cả workspace) — dùng chung một
 * form là giá trị của ô tô lọt sang xe máy ở nhịp render đầu tiên.
 *
 * Chính sách ở đây áp cho mọi xe cùng loại CHƯA ghi đè riêng, tính từ các lượt đặt MỚI: đơn đã
 * chốt giữ nguyên bản chụp của nó ở backend. Đó là lý do có bước xác nhận nêu rõ phạm vi.
 *
 * Quyền: xem cần `tenant.view`, lưu cần `tenant.update` — cùng cặp mà
 * `ShopPoliciesController` gác. Thiếu quyền sửa thì form vẫn hiện nhưng KHÔNG nhập được, vì đọc
 * được chính sách của gian hàng mình là quyền cơ bản.
 */
export function ShopPolicyScreen() {
  const t = useTranslations('Shop.policies');
  const tShop = useTranslations('Shop');
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();

  const canView = permissions.has(PERMISSION.TENANT_VIEW);
  const canEdit = permissions.has(PERMISSION.TENANT_UPDATE);

  // Web `ShopPoliciesPage`: `?type=motorbike` mở sẵn tab xe máy (mặc định ô tô).
  const { type: typeParam } = useLocalSearchParams<{ type?: string }>();
  const [vehicleType, setVehicleType] = useState<VehicleType>(
    typeParam === VEHICLE_TYPE.MOTORBIKE ? VEHICLE_TYPE.MOTORBIKE : VEHICLE_TYPE.CAR,
  );

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManagePageHeader title={t('workspace.title')} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbidden.title')}
            description={t('forbidden.description')}
            actionLabel={tShop('page.forbidden.backHome')}
            onAction={() => navigateOnce(ROUTES.manage.home())}
          />
        </Screen>
      </>
    );
  }

  return (
    <PolicyWorkspace
      /* `key` ép remount: đổi loại xe là dựng lại form với đúng bộ giá trị của loại đó. */
      key={vehicleType}
      vehicleType={vehicleType}
      onSelectVehicleType={setVehicleType}
      canView={canView}
      canEdit={canEdit}
    />
  );
}

/**
 * Form của màn = chính sách theo loại xe + thời gian chết + điều khoản thuê của gian hàng (ba API,
 * một nút Lưu - web `ShopPolicyFormValues`, ADR 0112 điều 3).
 */
type ShopPolicyFormValues = PolicyFormValues & {
  turnaroundBufferMinutes: number;
  terms: RentalTermsFormValues;
};

const shopPolicySchema = policyFormSchema.concat(
  yup.object({
    turnaroundBufferMinutes: yup
      .number()
      .integer('minutesInteger')
      .min(0, 'minutesNegative')
      .max(TURNAROUND_BUFFER_MAX_MINUTES, 'minutesMax')
      .required('minutesInteger'),
    terms: yup.object(
      Object.fromEntries(
        RENTAL_TERMS_GROUP_VALUES.map((group) => [
          group,
          yup.object({
            termsText: yup.string().defined().max(RENTAL_TERMS_MAX_LENGTH, 'termsTooLong'),
            requireTermsAcceptance: yup.boolean().defined(),
          }),
        ]),
      ),
    ),
  }),
);

function termsToForm(terms: TenantRentalTerms | undefined): RentalTermsFormValues {
  const of = (group: RentalTermsGroup): RentalTermsFormGroup => {
    const item = terms?.items.find((entry) => entry.serviceType === group);
    return {
      termsText: item?.termsText ?? '',
      requireTermsAcceptance: item?.requireTermsAcceptance ?? false,
    };
  };
  return {
    [RENTAL_TERMS_GROUP.SELF_DRIVE]: of(RENTAL_TERMS_GROUP.SELF_DRIVE),
    [RENTAL_TERMS_GROUP.WITH_DRIVER]: of(RENTAL_TERMS_GROUP.WITH_DRIVER),
  };
}

function toTermsInput(terms: RentalTermsFormValues): SaveTenantRentalTermsInput {
  return {
    items: RENTAL_TERMS_GROUP_VALUES.map((group) => {
      const text = terms[group].termsText.trim();
      return {
        serviceType: group,
        termsText: text ? text : null,
        requireTermsAcceptance: terms[group].requireTermsAcceptance,
      };
    }),
  };
}

function toFormValues(
  policy: RentalPolicyValues | null | undefined,
  defaults: ShopOperationDefaults | undefined,
  terms: TenantRentalTerms | undefined,
): ShopPolicyFormValues {
  return {
    // `policyToForm` suy luôn công tắc quá giờ từ dữ liệu (web, ADR 0112).
    ...policyToForm(policy),
    turnaroundBufferMinutes: defaults?.turnaroundBufferMinutes ?? 0,
    terms: termsToForm(terms),
  };
}

/** Không còn công tắc ưu đãi trên màn này — có mốc là đang bật (web `toPolicyInput`). */
function toPolicyInput(values: ShopPolicyFormValues): SaveRentalPolicyInput {
  return { ...formToSaveInput(values), discountEnabled: (values.discountTiers ?? []).length > 0 };
}

/**
 * Thân màn: dải chip loại xe, phạm vi áp dụng, form — và thanh hành động DÍNH ĐÁY.
 *
 * Form nằm cùng component với `<Screen>` (không tách ra làm con) vì thanh hành động là `footer`
 * của chính `Screen`: nó phải đọc được `formState.isDirty` và `handleSubmit` của form. Tách ra
 * thì hai thứ đó nằm dưới một tầng và nút Lưu lại phải trôi theo nội dung — đúng thứ khiến người
 * dùng cuộn hết một màn dài mới bấm được nó.
 *
 * Hai API, một nút Lưu (web `ShopPolicyForm`, PR #280): chính sách (`PUT /shop/rental-policies`)
 * chỉ gửi khi PAYLOAD của nó đổi, thời gian chết (`PUT /shop/operation-defaults`) cũng vậy.
 */
function PolicyWorkspace({
  vehicleType,
  onSelectVehicleType,
  canView,
  canEdit,
}: {
  vehicleType: VehicleType;
  onSelectVehicleType: (next: VehicleType) => void;
  canView: boolean;
  canEdit: boolean;
}) {
  // `<Screen>` dựng cột giữa màn trên iPad, nên nội dung bên trong giữ lề điện thoại.
  const gutter = layout.screenX;
  const colors = useColors();
  // Màn sửa form có thanh Hủy/Lưu dính đáy: ẩn thanh menu nổi để nó không che nút (như màn chi tiết).
  useHideTabBar();
  const router = useRouter();
  const t = useTranslations('Shop.policies');
  // Hạ chữ theo NGÔN NGỮ app, không theo máy (web `toLocaleLowerCase(locale)`).
  const locale = useLocale();
  const tWorkspace = useTranslations('Shop.policies.workspace');
  const tTurnaround = useTranslations('Shop.policies.workspace.turnaround');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();

  const query = useShopPolicy(vehicleType, canView);
  /*
   * Cả hai loại để ĐẾM xe trên tab (web `SegmentedTabs` + `count`) — cùng key với `query`, nên loại
   * đang mở không tải hai lần và đổi tab không tải lại.
   */
  const carPolicy = useShopPolicy(VEHICLE_TYPE.CAR, canView);
  const motorbikePolicy = useShopPolicy(VEHICLE_TYPE.MOTORBIKE, canView);
  const vehicleCount = (policy: ShopRentalPolicy | undefined) =>
    policy ? policy.inheritingVehicles + policy.overriddenVehicles : undefined;

  /*
   * Mục lục (web `PoliciesLayout`, P2): ở màn hẹp cột phải lên ĐẦU — một dải chip, chạm là cuộn tới
   * khối. Toạ độ khối tương đối với khung `PolicySections`, khung đó lại nằm trong cột nội dung.
   */
  const scrollRef = useRef<ScrollView | null>(null);
  const columnY = useRef(0);
  const sectionsY = useRef(0);
  const anchorY = useRef<Partial<Record<PolicyAnchor, number>>>({});
  const scrollToAnchor = (anchor: PolicyAnchor) => {
    const y = anchorY.current[anchor];
    if (y === undefined) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, columnY.current + sectionsY.current + y - space.md),
      animated: true,
    });
  };
  const defaultsQuery = useShopOperationDefaults(vehicleType, canView);
  const save = useSaveShopPolicy(vehicleType);
  /*
   * Bảo hiểm vật chất xe chỉ bán cho Ô TÔ và chỉ khi nền tảng đang bán theo bậc (ADR 0091 điều 1) -
   * `applies` của cảnh báo nói đúng điều đó (web `ShopPolicyForm`).
   */
  const insuranceImpact = useShopInsuranceImpact(vehicleType, canView && vehicleType === VEHICLE_TYPE.CAR);
  const insuranceApplies = vehicleType === VEHICLE_TYPE.CAR && insuranceImpact.data?.applies === true;
  const saveDefaults = useSaveShopOperationDefaults(vehicleType);
  const termsQuery = useShopRentalTerms(canView);
  const saveTerms = useSaveShopRentalTerms();
  const submitting = save.isPending || saveDefaults.isPending || saveTerms.isPending;
  const [confirming, setConfirming] = useState<ShopPolicyFormValues | null>(null);
  /** Loại xe người dùng muốn chuyển sang khi form còn thay đổi chưa lưu — chờ xác nhận bỏ. */
  const [pendingType, setPendingType] = useState<VehicleType | null>(null);

  const resolver = useValidationResolver<ShopPolicyFormValues>(
    shopPolicySchema,
    'Vehicles.pricing.validation',
  );
  const values = useMemo(
    () => toFormValues(query.data?.policy, defaultsQuery.data, termsQuery.data),
    [query.data?.policy, defaultsQuery.data, termsQuery.data],
  );
  const { control, handleSubmit, reset, formState } = useForm<ShopPolicyFormValues>({
    resolver,
    values,
    // Một nửa lưu được, nửa kia lỗi: cache đổi theo nửa đã lưu, ô đang sửa thì giữ nguyên (như web).
    resetOptions: { keepDirtyValues: true },
  });
  const dirty = formState.isDirty && canEdit;

  /*
   * Xác nhận TRƯỚC khi gửi, sau khi đã validate: giá trị mới áp ngay cho mọi lượt đặt mới của
   * các xe đang kế thừa. Hỏi "chắc chưa?" rồi mới báo "thiếu 2 mục" là bắt người dùng đi qua
   * một hộp thoại vô ích.
   */
  const askConfirm = handleSubmit((next) => setConfirming(next));

  const submit = useCallback(async () => {
    const next = confirming;
    if (!next || submitting) return;
    const policyBody = toPolicyInput(next);
    const policyChanged = JSON.stringify(policyBody) !== JSON.stringify(toPolicyInput(values));
    const turnaroundChanged = next.turnaroundBufferMinutes !== values.turnaroundBufferMinutes;
    const termsBody = toTermsInput(next.terms);
    const termsChanged = JSON.stringify(termsBody) !== JSON.stringify(toTermsInput(values.terms));
    try {
      const policy = policyChanged ? await save.mutateAsync(policyBody) : query.data;
      const savedDefaults = turnaroundChanged
        ? await saveDefaults.mutateAsync({ turnaroundBufferMinutes: next.turnaroundBufferMinutes })
        : defaultsQuery.data;
      const savedTerms = termsChanged ? await saveTerms.mutateAsync(termsBody) : termsQuery.data;
      reset(toFormValues(policy?.policy, savedDefaults, savedTerms));
      setConfirming(null);
      toast.showSuccess(t('saved', { vehicle: domainLabel('vehicleType', vehicleType) }));
    } catch (err) {
      setConfirming(null);
      toast.showError(errorMessage(err));
    }
  }, [
    confirming,
    submitting,
    values,
    save,
    saveDefaults,
    saveTerms,
    query.data,
    defaultsQuery.data,
    termsQuery.data,
    reset,
    toast,
    t,
    domainLabel,
    vehicleType,
    errorMessage,
  ]);

  const requestType = (next: VehicleType) => {
    if (next === vehicleType) return;
    if (dirty) setPendingType(next);
    else onSelectVehicleType(next);
  };

  const data = query.data;
  const defaults = defaultsQuery.data;
  const terms = termsQuery.data;
  const ready = Boolean(data && defaults && terms);
  const failed =
    (query.isError && !data) ||
    (defaultsQuery.isError && !defaults) ||
    (termsQuery.isError && !terms);
  const typeLabel = (type: VehicleType) => domainLabel('vehicleType', type);

  return (
    <>
      <ManagePageHeader
        title={tWorkspace('title')}
        onBack={() => goBackOr(router, ROUTES.manage.shop())}
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        scrollRef={scrollRef}
        footer={
          canEdit && ready ? (
            /*
              "Hủy · Lưu thay đổi" DÍNH ĐÁY — cặp nút của web (P15): cả hai luôn ở đó, chỉ SÁNG khi có
              thay đổi (thay cho thanh "thay đổi chưa lưu" của bản cũ).
            */
            <XStack gap={space.sm}>
              <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
                <Button
                  label={tActions('cancel')}
                  variant="neutral"
                  disabled={!formState.isDirty || submitting}
                  onPress={() => reset()}
                />
              </YStack>
              <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
                <Button
                  label={tActions('saveChanges')}
                  icon="save-outline"
                  variant="gradient"
                  loading={submitting}
                  disabled={!formState.isDirty}
                  onPress={() => void askConfirm()}
                />
              </YStack>
            </XStack>
          ) : undefined
        }
      >
        <YStack px={gutter} pt={space.md} pb={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.body}>
            {tWorkspace('subtitle')}
          </Text>
        </YStack>

        <YStack
          px={gutter}
          gap={layout.section}
          pb={layout.section}
          onLayout={(event: LayoutChangeEvent) => {
            columnY.current = event.nativeEvent.layout.y;
          }}
        >
          {/*
            Tab Ô tô · Xe máy kèm SỐ XE của loại (P1) — đầu trang như `ManagePageHeader extra` web.
            Đổi loại khi còn thay đổi chưa lưu ⇒ hỏi bỏ thay đổi trước.
          */}
          <SegmentedTabs
            fit
            variant="neutral"
            items={VEHICLE_TYPE_VALUES.map((value) => {
              const count = vehicleCount(
                value === VEHICLE_TYPE.CAR ? carPolicy.data : motorbikePolicy.data,
              );
              return {
                key: value,
                label: typeLabel(value),
                ...(count !== undefined ? { count } : {}),
              };
            })}
            value={vehicleType}
            onChange={requestType}
          />

          {/* Mục lục (P2) — màn hẹp: lên đầu, chạm là cuộn tới khối. */}
          {ready ? (
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              accessibilityLabel={tWorkspace('nav.label')}
            >
              <XStack gap={space.xs}>
              {(
                [
                  [POLICY_ANCHOR.RULES, tWorkspace('nav.rules')],
                  [POLICY_ANCHOR.DELIVERY, tWorkspace('nav.delivery')],
                  [POLICY_ANCHOR.LONG_TERM, tWorkspace('nav.longTerm')],
                ] as const
              ).map(([anchor, label]) => (
                <Chip key={anchor} label={label} onPress={() => scrollToAnchor(anchor)} />
              ))}
              </XStack>
            </ScrollView>
          ) : null}
          {/*
            "Thanh toán & hóa đơn" — hai thiết lập cho MỌI xe của gian hàng, lưu ngay khi bấm, không
            thuộc form theo loại xe bên dưới (web `ShopPaymentCard`). Thu giữ chỗ tự ẩn khi thiếu
            quyền `seller_profile.view` hoặc khi nền tảng khoá theo giai đoạn.
          */}
          {/* "Thanh toán & hóa đơn" — MỘT thẻ, hai hàng lưu ngay (web `ShopPaymentCard`, P3). */}
          <InfoCard title={tWorkspace('payment.title')} hint={tWorkspace('payment.subtitle')}>
            <DepositSettingsSection showHead={false} />
            <VatInvoiceSection canEdit={canEdit} renderHead={() => null} variant="row" />
          </InfoCard>

          {data ? <AppliedSummary data={data} vehicleType={vehicleType} /> : null}

          {failed ? (
            <ScreenError
              error={query.error ?? defaultsQuery.error ?? termsQuery.error}
              title={t('loadError')}
              onRetry={() => {
                if (query.isError) void query.refetch();
                if (defaultsQuery.isError) void defaultsQuery.refetch();
                if (termsQuery.isError) void termsQuery.refetch();
              }}
            />
          ) : null}

          {!ready && !failed ? <SkeletonText lines={12} /> : null}

          {data && defaults && terms ? (
            <YStack gap={layout.section}>
              {data.policy === null ? (
                <Callout tone="info" title={t('emptyTitle')}>
                  {t('emptyBody')}
                </Callout>
              ) : null}

              {!canEdit ? <Callout tone="info">{t('readOnly')}</Callout> : null}

              <YStack
                onLayout={(event: LayoutChangeEvent) => {
                  sectionsY.current = event.nativeEvent.layout.y;
                }}
              >
              <PolicySections
                onAnchorLayout={(anchor, y) => {
                  anchorY.current[anchor] = y;
                }}
                control={control}
                disabled={!canEdit || submitting}
                shopWorkspace={{ vehicleType }}
                {...(data.inheritingVehicles > 0
                  ? { depositHint: t('depositHint', { count: data.inheritingVehicles }) }
                  : {})}
                {...(insuranceApplies
                  ? {
                      afterRules: (
                        <InsuranceModeBlock
                          control={control}
                          disabled={!canEdit || submitting}
                          impact={insuranceImpact.data}
                        />
                      ),
                    }
                  : {})}
                {...(data.policy?.legacyDiscountTiers?.length
                  ? { legacyDiscountTiers: data.policy.legacyDiscountTiers }
                  : {})}
                afterDelivery={
                  /* Nằm trong thẻ "Giao nhận xe" cùng khối giao xe - web `TurnaroundBlock` sau vạch chia. */
                  <YStack>
                    <YStack gap={space.sm}>
                      <BlockHead
                        title={tTurnaround('title')}
                        hint={tTurnaround('hint')}
                        {...(defaults.inheritingVehicles > 0
                          ? { note: tTurnaround('applies', { count: defaults.inheritingVehicles }) }
                          : {})}
                      />
                      <TurnaroundBufferField
                        control={control}
                        name="turnaroundBufferMinutes"
                        label={tTurnaround('title')}
                        disabled={!canEdit || submitting}
                      />
                    </YStack>
                  </YStack>
                }
              />
              </YStack>
              {/* Điều kiện cho thuê (ADR 0112 điều 3): luật chuẩn nền tảng + điều khoản gian hàng. */}
              <RentalConditionsCard
                control={control as unknown as Control<{ terms: RentalTermsFormValues }>}
                disabled={!canEdit || submitting}
                onOpenContracts={() => navigateOnce(ROUTES.manage.contractsDocuments())}
              />
            </YStack>
          ) : null}
        </YStack>
      </Screen>

      <AlertDialog
        open={confirming !== null}
        title={t('confirm.title')}
        message={[
          data && data.inheritingVehicles > 0
            ? t('confirm.bodyInheriting', { count: data.inheritingVehicles })
            : t('confirm.body'),
          // Chuyển sang Bắt buộc mà có xe kế thừa thiếu dữ liệu ⇒ nói rõ số xe sẽ ngừng nhận tự lái (web).
          ...(insuranceApplies &&
          confirming?.insuranceMode === INSURANCE_MODE.REQUIRED &&
          values.insuranceMode !== INSURANCE_MODE.REQUIRED &&
          (insuranceImpact.data?.total ?? 0) > 0
            ? [t('confirm.insuranceRequired', { count: insuranceImpact.data?.total ?? 0 })]
            : []),
        ].join(ALERT_LINE_BREAK)}
        confirmLabel={t('confirm.ok')}
        cancelLabel={tActions('cancel')}
        loading={submitting}
        onConfirm={() => void submit()}
        onCancel={() => setConfirming(null)}
      />

      <AlertDialog
        open={pendingType !== null}
        title={tWorkspace('switchType.title')}
        message={
          pendingType
            ? tWorkspace('switchType.body', {
                vehicle: typeLabel(vehicleType).toLocaleLowerCase(locale),
                next: typeLabel(pendingType).toLocaleLowerCase(locale),
              })
            : ''
        }
        confirmLabel={tWorkspace('switchType.ok')}
        cancelLabel={tActions('cancel')}
        destructive
        onConfirm={() => {
          const next = pendingType;
          setPendingType(null);
          if (next) onSelectVehicleType(next);
        }}
        onCancel={() => setPendingType(null)}
      />
    </>
  );
}

/** Tiêu đề + mô tả + (tuỳ chọn) dòng phạm vi của một khối tự dựng trên màn này. */
function BlockHead({ title, hint, note }: { title: string; hint: string; note?: string }) {
  const colors = useColors();
  return (
    <YStack gap={2}>
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
        {title}
      </Text>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {hint}
      </Text>
      {note ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {note}
        </Text>
      ) : null}
    </YStack>
  );
}

/**
 * "Đã áp dụng cho N ô tô" + chú thích về xe đang ghi đè riêng.
 *
 * Con số đến từ SERVER (`inheritingVehicles`/`overriddenVehicles`) — không đếm ở client, vì
 * client chỉ nhìn thấy trang xe đang mở.
 */
function AppliedSummary({
  data,
  vehicleType,
}: {
  data: ShopRentalPolicy;
  vehicleType: VehicleType;
}) {
  const t = useTranslations('Shop.policies');
  const domainLabel = useDomainLabel();
  const locale = useLocale();
  const label = domainLabel('vehicleType', vehicleType).toLocaleLowerCase(locale);

  return (
    <Callout tone="info" title={t('applied', { count: data.inheritingVehicles, vehicle: label })}>
      {data.overriddenVehicles > 0
        ? t('overridden', { count: data.overriddenVehicles })
        : undefined}
    </Callout>
  );
}

/** Ngắt dòng trong thân `AlertDialog` (thân là chuỗi). */
const ALERT_LINE_BREAK = String.fromCharCode(10);
