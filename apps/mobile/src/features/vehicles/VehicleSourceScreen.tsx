import { useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  STATUS_COLOR,
  VEHICLE_FINANCE_INTEREST_METHOD_VALUES,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_SOURCE_TYPE_VALUES,
  type VehicleSourceType,
} from '@xeprime/types';
import { vehicleSourceFormSchema, type VehicleSourceFormValues } from '@xeprime/validators';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { VehicleEditTabs } from './components/VehicleEditTabs';
import { Button } from '@/components/ui/Button';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { RadioField } from '@/components/ui/RadioField';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFormRefresh } from '@/hooks/use-form-refresh';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { goBackOr } from '@/navigation/go-back-or';
import { useLeaveGuard } from '@/hooks/use-leave-guard';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_EDIT_TAB } from '@/navigation/vehicle-edit-tab';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { DateField } from './components/DateField';
import { SourceContractFiles } from './components/SourceContractFiles';
import { emptySourceFormValues, sourceDetailToFormValues, sourceFormValuesToInput } from './source-mappers';
import { useSaveVehicleSource, useVehicle, useVehicleSource } from './hooks/use-vehicle';
import type { VehicleDetail, VehicleSource } from './api';

/** Đường kính viên hình ở dải trạng thái đầu màn. */
const BANNER_ICON = 40;

/** Cùng bộ hình với web (`HomeOutlined`/`BankOutlined`/`KeyOutlined`/`TeamOutlined`). */
const SOURCE_ICON: Record<VehicleSourceType, React.ComponentProps<typeof Ionicons>['name']> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: 'home-outline',
  [VEHICLE_SOURCE_TYPE.FINANCED]: 'business-outline',
  [VEHICLE_SOURCE_TYPE.RENTED]: 'key-outline',
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: 'people-outline',
};

/**
 * Tab "Nguồn xe & tài chính" (VEH-11).
 *
 * Quyền — khớp guard backend, FE chỉ phản chiếu:
 *  - thiếu `finance.view` → màn không có quyền, **KHÔNG gọi API** (gọi để nhận 403 là trải
 *    nghiệm tệ hơn một màn từ chối chủ động);
 *  - có `finance.view`, thiếu `vehicles.update` → chỉ xem (ô khoá, không có nút lưu);
 *  - đủ cả hai → chỉnh sửa đầy đủ.
 */
export function VehicleSourceScreen({ vehicleId }: { vehicleId: string }) {
  const t = useTranslations('Vehicles.source');
  const tEdit = useTranslations('Vehicles.edit');
  const router = useRouter();
  const { has, isLoading: permissionsLoading } = usePermissions();

  const canView = has(PERMISSION.FINANCE_VIEW);
  const canEdit = canView && has(PERMISSION.VEHICLE_UPDATE);

  const back = () => goBackOr(router, ROUTES.manage.vehicleEdit(vehicleId));
  const vehicle = useVehicle(vehicleId, canView);
  const source = useVehicleSource(vehicleId, canView);

  const title = tEdit('tabs.source');

  if (!permissionsLoading && !canView) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={title}
            description={t('noPermission')}
          />
        </Screen>
      </>
    );
  }

  if (vehicle.isPending || source.isPending) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']}>
          <SkeletonText lines={10} />
        </Screen>
      </>
    );
  }

  if (vehicle.isError || source.isError) {
    return (
      <>
        <AppHeader title={title} onBack={back} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={source.error ?? vehicle.error}
            title={t('loadError')}
            onRetry={() => {
              void vehicle.refetch();
              void source.refetch();
            }}
          />
        </Screen>
      </>
    );
  }

  return (
    <SourceForm
      vehicle={vehicle.data}
      source={source.data}
      canEdit={canEdit}
      title={title}
      onBack={back}
      refreshing={vehicle.isRefetching || source.isRefetching}
      onRefetch={() => {
        void vehicle.refetch();
        void source.refetch();
      }}
    />
  );
}

function SourceForm({
  vehicle,
  source,
  canEdit,
  title,
  onBack,
  refreshing,
  onRefetch,
}: {
  vehicle: VehicleDetail;
  source: VehicleSource;
  canEdit: boolean;
  title: string;
  onBack: () => void;
  refreshing: boolean;
  onRefetch: () => void;
}) {
  const t = useTranslations('Vehicles.source');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const domainLabel = useDomainLabel();
  const save = useSaveVehicleSource(vehicle.id);

  const initialValues = useMemo(
    () =>
      source.detail
        ? sourceDetailToFormValues(source.detail)
        : emptySourceFormValues(source.sourceType),
    [source],
  );

  const [confirmValues, setConfirmValues] = useState<VehicleSourceFormValues | null>(null);
  const resolver = useValidationResolver<VehicleSourceFormValues>(
    vehicleSourceFormSchema,
    'Vehicles.source.validation',
  );

  const {
    control,
    handleSubmit,
    reset,
    formState: { isDirty, errors },
  } = useForm<VehicleSourceFormValues>({
    resolver,
    /*
     * `values` + `keepDirtyValues`: form TỰ ĐỒNG BỘ khi dữ liệu server đổi, nhưng KHÔNG đè lên
     * ô người dùng đang gõ dở. Xem `VehicleEditFormScreen` cho lý do đầy đủ.
     */
    values: initialValues,
    resetOptions: { keepDirtyValues: true },
  });

  const leave = useLeaveGuard(isDirty);
  const refresh = useFormRefresh(isDirty, refreshing, onRefetch);

  const sourceType = useWatch({ control, name: 'sourceType' }) as VehicleSourceType;
  const savedType = (source.detail?.sourceType ?? source.sourceType) as VehicleSourceType;
  const errorCount = Object.keys(errors).length;

  function persist(values: VehicleSourceFormValues) {
    save.mutate(sourceFormValuesToInput(values), {
      onSuccess: (data) => {
        reset(
          data.detail
            ? sourceDetailToFormValues(data.detail)
            : emptySourceFormValues(data.sourceType),
        );
        setConfirmValues(null);
        toast.showSuccess(t('saved'));
      },
      // Giữ nguyên form để sửa/thử lại — giá trị đã nhập không được mất vì một lần lưu hỏng.
      onError: (error) => toast.showError(errorMessage(error)),
    });
  }

  function submit() {
    void handleSubmit((values) => {
      /*
       * Đổi hình thức là thao tác nhạy cảm: hồ sơ của biến thể cũ bị THAY THẾ. Hỏi ở mốc LƯU chứ
       * không ở mốc chạm radio — đúng web, và vì hỏi lúc chạm thì người dùng phải quyết định
       * trước khi nhìn thấy bộ trường mới, còn bấm Huỷ vẫn đã mất chỗ đứng cũ.
       */
      if (source.detail && values.sourceType !== savedType) {
        setConfirmValues(values);
        return;
      }
      persist(values);
    })();
  }

  const contractFileLabel =
    sourceType === VEHICLE_SOURCE_TYPE.FINANCED
      ? t('contract.fileFinanced')
      : sourceType === VEHICLE_SOURCE_TYPE.RENTED
        ? t('contract.fileRented')
        : sourceType === VEHICLE_SOURCE_TYPE.PARTNERSHIP
          ? t('contract.filePartnership')
          : t('contract.fileOwned');

  return (
    <>
      <AppHeader
        title={title}
        subtitle={[vehicle.name, vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
        onBack={() => leave.guard(onBack)}
      />
      <VehicleEditTabs
        vehicleId={vehicle.id}
        active={VEHICLE_EDIT_TAB.SOURCE}
        guard={leave.guard}
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        {...refresh}
        footer={
          canEdit ? (
            <Button
              label={tActions('saveChanges')}
              loading={save.isPending}
              disabled={!isDirty}
              onPress={submit}
            />
          ) : undefined
        }
      >
        <YStack gap={layout.section}>
          {/* Dải trạng thái đầu tab — nói ngay xe đang ở hình thức nào (đúng bố cục web). */}
          <XStack
            ai="center"
            gap={space.sm}
            p={space.md}
            br={radius.md}
            bw={1}
            bg={colors.surface}
            bc={colors.border}
          >
            {/*
              Nền màu thương hiệu ĐẶC, hình trắng. Vàng nhạt trên một thẻ trắng viền nhạt gần như
              không tách ra — ô hình mất luôn vai trò nhận diện nguồn xe.
            */}
            <YStack
              width={BANNER_ICON}
              height={BANNER_ICON}
              ai="center"
              jc="center"
              br={radius.pill}
              bg={colors.primary}
            >
              <Ionicons
                name={SOURCE_ICON[savedType]}
                size={iconSize.lg}
                color={colors.onPrimary}
              />
            </YStack>
            <YStack f={1} gap={space.xs}>
              <XStack ai="center" gap={space.xs} flexWrap="wrap">
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t('banner.kind', { label: domainLabel('vehicleSourceType', savedType) })}
                </Text>
                <StatusBadge
                  label={t(bannerKey(savedType))}
                  color={STATUS_COLOR.WAITING}
                  size="sm"
                />
              </XStack>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t(cardHintKey(savedType))}
              </Text>
            </YStack>
          </XStack>

          {!canEdit ? <Callout>{t('readOnly')}</Callout> : null}

          {errorCount > 0 ? (
            <Callout tone="danger">{t('errors', { count: errorCount })}</Callout>
          ) : null}

          {!source.detail ? (
            <Callout tone="warning" title={t('noDetailTitle')}>
              {t('noDetailBody')}
            </Callout>
          ) : null}

          <SectionCard title={t('typeCard')}>
            <RadioField
              control={control}
              name="sourceType"
              disabled={!canEdit}
              options={VEHICLE_SOURCE_TYPE_VALUES.map((value) => ({
                value,
                label: domainLabel('vehicleSourceType', value),
                hint: t(cardHintKey(value)),
                /*
                  Cùng bảng hình với dải đầu trang — chọn "Trả góp" ở đây rồi thấy đúng hình đó
                  trên banner là một mạch liên tục; hai hình khác nhau cho cùng một thứ thì người
                  dùng phải học hai lần.
                */
                icon: SOURCE_ICON[value],
              }))}
            />
          </SectionCard>

          {sourceType === VEHICLE_SOURCE_TYPE.OWNED ? (
            <OwnedSection control={control} canEdit={canEdit} />
          ) : null}
          {sourceType === VEHICLE_SOURCE_TYPE.FINANCED ? (
            <FinancedSection control={control} canEdit={canEdit} />
          ) : null}
          {sourceType === VEHICLE_SOURCE_TYPE.RENTED ? (
            <RentedSection control={control} canEdit={canEdit} />
          ) : null}
          {sourceType === VEHICLE_SOURCE_TYPE.PARTNERSHIP ? (
            <PartnershipSection control={control} canEdit={canEdit} />
          ) : null}

          {/* Xe của mình mà chỉ xem thì hồ sơ rỗng không đáng chiếm một thẻ — đúng điều kiện web. */}
          {sourceType !== VEHICLE_SOURCE_TYPE.OWNED || canEdit ? (
            <SectionCard
              title={
                sourceType === VEHICLE_SOURCE_TYPE.OWNED
                  ? t('contract.titleOptional')
                  : t('contract.title')
              }
            >
              <SourceContractFiles
                control={control}
                name="contractFiles"
                vehicleId={vehicle.id}
                label={contractFileLabel}
                canEdit={canEdit}
              />
              <TextField
                control={control}
                name="notes"
                label={t('contract.notes')}
                placeholder={t('contract.notesPlaceholder')}
                multiline
                rows={4}
                maxLength={4000}
                editable={canEdit}
              />
            </SectionCard>
          ) : null}
        </YStack>
      </Screen>

      <AlertDialog
        open={confirmValues !== null}
        title={t('confirmType.title')}
        /*
         * `confirmType.body` mang thẻ rich `<b>` — bắt buộc đi qua `t.rich`. Gọi `t()` trần thì
         * use-intl không dựng nổi và in ra NGUYÊN KHOÁ (đúng lỗi đã thấy ở màn hồ sơ 360).
         */
        message={
          <>
            {t.rich('confirmType.body', {
              from: domainLabel('vehicleSourceType', savedType),
              to: confirmValues ? domainLabel('vehicleSourceType', confirmValues.sourceType) : '',
              b: (chunks) => (
                <Text col={colors.text} fow={fontWeight.semibold}>
                  {chunks}
                </Text>
              ),
            })}
            {`\n${t('confirmType.note')}`}
          </>
        }
        confirmLabel={t('confirmType.ok')}
        cancelLabel={tActions('cancel')}
        destructive
        loading={save.isPending}
        onConfirm={() => confirmValues && persist(confirmValues)}
        onCancel={() => setConfirmValues(null)}
      />
    </>
  );
}

/** Liệt kê tường minh — khoá i18n ghép động lọt qua typecheck của `use-intl`. */
function bannerKey(value: VehicleSourceType) {
  if (value === VEHICLE_SOURCE_TYPE.FINANCED) return 'banner.financed' as const;
  if (value === VEHICLE_SOURCE_TYPE.RENTED) return 'banner.rented' as const;
  if (value === VEHICLE_SOURCE_TYPE.PARTNERSHIP) return 'banner.partnership' as const;
  return 'banner.owned' as const;
}

function cardHintKey(value: VehicleSourceType) {
  if (value === VEHICLE_SOURCE_TYPE.FINANCED) return 'cardHint.financed' as const;
  if (value === VEHICLE_SOURCE_TYPE.RENTED) return 'cardHint.rented' as const;
  if (value === VEHICLE_SOURCE_TYPE.PARTNERSHIP) return 'cardHint.partnership' as const;
  return 'cardHint.owned' as const;
}

type SectionProps = {
  control: ReturnType<typeof useForm<VehicleSourceFormValues>>['control'];
  canEdit: boolean;
};

function SectionCard({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <Card>
      <YStack gap={space.sm}>
        <BlockTitle>{title}</BlockTitle>
        {children}
      </YStack>
    </Card>
  );
}

function OwnedSection({ control, canEdit }: SectionProps) {
  const t = useTranslations('Vehicles.source.owned');

  return (
    <SectionCard title={t('title')}>
      <DateField
        control={control}
        name="purchaseDate"
        label={t('purchaseDate')}
        disabled={!canEdit}
      />
      <MoneyField
        control={control}
        name="purchasePrice"
        label={t('purchasePrice')}
        placeholder={t('purchasePricePlaceholder')}
        editable={canEdit}
      />
      <TextField
        control={control}
        name="purchasePlace"
        label={t('purchasePlace')}
        placeholder={t('purchasePlacePlaceholder')}
        editable={canEdit}
      />
    </SectionCard>
  );
}

/** Trần thời hạn vay — khớp `optionalPositiveInt('Thời hạn vay', 600)` của schema. */
const MAX_TERM_MONTHS = 600;
/** Ngày trong tháng: 1–31, đúng `optionalPositiveInt('Ngày đến hạn', 31)`. */
const MAX_PAYMENT_DAY = 31;
/** Lãi suất/tỷ lệ chia: 0–100%. */
const MAX_PERCENT = 100;

function FinancedSection({ control, canEdit }: SectionProps) {
  const t = useTranslations('Vehicles.source.financed');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const monthlyPrincipal = useWatch({ control, name: 'monthlyPrincipal' });
  const monthlyInterest = useWatch({ control, name: 'monthlyInterest' });

  // Tổng phải đóng mỗi tháng = gốc + lãi — xem trước bằng đúng công thức backend, không lưu.
  const monthlyTotal =
    monthlyPrincipal != null || monthlyInterest != null
      ? (monthlyPrincipal ?? 0) + (monthlyInterest ?? 0)
      : null;

  return (
    <SectionCard title={t('title')}>
      <TextField
        control={control}
        name="bankName"
        label={t('bankName')}
        placeholder={t('bankPlaceholder')}
        required
        editable={canEdit}
      />
      <TextField
        control={control}
        name="contractNumber"
        label={t('contractNumber')}
        placeholder={t('contractNumberPlaceholder')}
        editable={canEdit}
      />
      <MoneyField
        control={control}
        name="originalPrincipal"
        label={t('originalPrincipal')}
        placeholder={t('originalPrincipalPlaceholder')}
        editable={canEdit}
      />
      <DateField control={control} name="startDate" label={t('startDate')} disabled={!canEdit} />
      <NumberField
        control={control}
        name="termMonths"
        integer
        min={1}
        max={MAX_TERM_MONTHS}
        label={t('termMonths')}
        placeholder={t('termMonthsPlaceholder')}
        editable={canEdit}
      />
      <NumberField
        control={control}
        name="interestRatePercent"
        label={t('interestRate')}
        placeholder={t('interestRatePlaceholder')}
        percent
        precision={2}
        editable={canEdit}
      />
      <NumberField
        control={control}
        name="paymentDay"
        integer
        min={1}
        max={MAX_PAYMENT_DAY}
        label={t('paymentDay')}
        placeholder={t('paymentDayPlaceholder')}
        editable={canEdit}
      />
      <MoneyField
        control={control}
        name="monthlyPrincipal"
        label={t('monthlyPrincipal')}
        placeholder={t('monthlyPrincipalPlaceholder')}
        editable={canEdit}
      />
      <MoneyField
        control={control}
        name="monthlyInterest"
        label={t('monthlyInterest')}
        placeholder={t('monthlyInterestPlaceholder')}
        editable={canEdit}
      />
      <DateField control={control} name="endDate" label={t('endDate')} disabled={!canEdit} />

      {/* Hai lựa chọn ⇒ bày hết bằng radio, đúng `<Radio.Group>` bên web (không phải menu). */}
      <RadioField
        control={control}
        name="interestMethod"
        label={t('interestMethod')}
        disabled={!canEdit}
        options={VEHICLE_FINANCE_INTEREST_METHOD_VALUES.map((value) => ({
          value,
          label: domainLabel('vehicleFinanceInterestMethod', value),
        }))}
      />

      {monthlyTotal != null ? (
        <Callout>{t('monthlyTotal', { amount: fmt.money(String(monthlyTotal)) })}</Callout>
      ) : null}
    </SectionCard>
  );
}

function RentedSection({ control, canEdit }: SectionProps) {
  const t = useTranslations('Vehicles.source.rented');

  return (
    <>
      <SectionCard title={t('ownerTitle')}>
        <TextField
          control={control}
          name="ownerName"
          label={t('ownerName')}
          placeholder={t('ownerNamePlaceholder')}
          required
          editable={canEdit}
        />
        <TextField
          control={control}
          name="ownerPhone"
          label={t('ownerPhone')}
          placeholder={t('ownerPhonePlaceholder')}
          keyboardType="phone-pad"
          editable={canEdit}
        />
        <TextField
          control={control}
          name="ownerEmail"
          label={t('ownerEmail')}
          placeholder={t('ownerEmailPlaceholder')}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={canEdit}
        />
      </SectionCard>

      <SectionCard title={t('contractTitle')}>
        <MoneyField
          control={control}
          name="monthlyRent"
          label={t('monthlyRent')}
          placeholder={t('monthlyRentPlaceholder')}
          hint={t('monthlyRentHelp')}
          required
          editable={canEdit}
        />
        <NumberField
          control={control}
          name="paymentDay"
          integer
          min={1}
          max={MAX_PAYMENT_DAY}
          label={t('paymentDay')}
          placeholder={t('paymentDayPlaceholder')}
          editable={canEdit}
        />
        <DateField control={control} name="startDate" label={t('startDate')} disabled={!canEdit} />
        <DateField control={control} name="endDate" label={t('endDate')} disabled={!canEdit} />
      </SectionCard>
    </>
  );
}

function PartnershipSection({ control, canEdit }: SectionProps) {
  const t = useTranslations('Vehicles.source.partnership');
  const tLabels = useTranslations('Common.labels');

  const commissionPercent = useWatch({ control, name: 'commissionPercent' });

  return (
    <>
      <SectionCard title={t('ownerTitle')}>
        <TextField
          control={control}
          name="ownerName"
          label={t('ownerName')}
          placeholder={t('ownerNamePlaceholder')}
          required
          editable={canEdit}
        />
        <TextField
          control={control}
          name="ownerPhone"
          label={t('ownerPhone')}
          placeholder={t('ownerPhonePlaceholder')}
          keyboardType="phone-pad"
          editable={canEdit}
        />
        <TextField
          control={control}
          name="ownerEmail"
          label={t('ownerEmail')}
          placeholder={t('ownerEmailPlaceholder')}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={canEdit}
        />
      </SectionCard>

      <SectionCard title={t('termsTitle')}>
        <NumberField
          control={control}
          name="commissionPercent"
          percent
          label={t('commission')}
          placeholder={t('commissionPlaceholder')}
          required
          editable={canEdit}
        />

        {/* Phần còn lại của gian hàng — suy từ tỷ lệ đang nhập, không phải một ô nhập thứ hai. */}
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t.rich('shopShare', {
            percent:
              commissionPercent == null
                ? tLabels('emptyValue')
                : `${MAX_PERCENT - commissionPercent}%`,
            b: (chunks) => (
              <Text col={colors.text} fow={fontWeight.semibold}>
                {chunks}
              </Text>
            ),
          })}
        </Text>

        <DateField control={control} name="startDate" label={t('startDate')} disabled={!canEdit} />
        <DateField control={control} name="endDate" label={t('endDate')} disabled={!canEdit} />

        {/*
          Cơ sở chia doanh thu (chốt ở wave 4): CHỈ tiền thuê sau giảm giá. Cọc hoàn lại, phí giao
          nhận, phí quá giờ, phạt/bồi thường đều đứng ngoài — khớp quy tắc giảm giá chỉ áp lên
          tiền thuê cơ bản của `rental_policies`.
        */}
        <Callout>{t('formula')}</Callout>
      </SectionCard>
    </>
  );
}
