import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  CUSTOMER_DOCUMENT_TYPE,
  COLLATERAL_MODE,
  IDENTITY_VERIFY_METHOD_VALUES,
  POLICY_SOURCE,
  RENTAL_TERMS_MAX_LENGTH,
  SERVICE_TYPE,
  requiredIdentityDocuments,
  type ServiceType,
} from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/CardTitle';
import { InlineAction } from '@/components/ui/InlineAction';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { RadioField } from '@/components/ui/RadioField';
import { TextField } from '@/components/ui/TextField';
import {
  CollateralPolicySection,
  MileagePolicySection,
  ToggleRow,
} from '@/features/rental-policies/components/PolicySections';
import { formToSaveInput, policyToForm } from '@/features/rental-policies/form';
import { policyFormSchema, type PolicyFormValues } from '@/features/rental-policies/schema';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/vehicle-pricing/hooks/use-vehicle-pricing';
import type { VehiclePricing } from '@/features/vehicle-pricing/api';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { Controller } from 'react-hook-form';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { VehicleServiceSetting } from './api';
import {
  usePatchVehicleServiceSetting,
  useVehicleServiceSettings,
} from './hooks/use-vehicle-settings';

/** Hai bộ giấy tờ chủ xe chọn — giá trị là MÃ giấy tờ định danh; GPLX của tự lái luôn được cộng. */
const DOC_PRESET = {
  CITIZEN: CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
  PASSPORT: CUSTOMER_DOCUMENT_TYPE.PASSPORT,
} as const;

const settingSchema = yup.object({
  identityDocument: yup.string().oneOf([DOC_PRESET.CITIZEN, DOC_PRESET.PASSPORT]).defined(),
  identityVerifyMethod: yup
    .string()
    .oneOf([...IDENTITY_VERIFY_METHOD_VALUES])
    .defined(),
  requireTermsAcceptance: yup.boolean().defined(),
  termsText: yup.string().max(RENTAL_TERMS_MAX_LENGTH).defined().default(''),
});
/*
 * Schema ghép chính sách + thủ tục. Message là MÃ (`@xeprime/validators`) nên resolver đi qua
 * `useValidationResolver` - vừa dịch mã lỗi, vừa nhận đúng kiểu `FormValues` (như `ShopPolicyScreen`).
 */
const termsFormSchema = policyFormSchema.concat(settingSchema);
type SettingValues = yup.InferType<typeof settingSchema>;
type FormValues = PolicyFormValues & SettingValues;

/**
 * Thân "Thủ tục cho thuê" — MỘT khối, hai dịch vụ, hai khu. Bản native của web `TermsSection`.
 *
 *  - TỰ LÁI: hình thức bảo đảm = `RentalPolicy.collateralMode`; giấy tờ xuất trình; cách đối
 *    chiếu; điều khoản + bắt khách đồng ý.
 *  - CÓ TÀI XẾ: chỉ giấy tờ, cách đối chiếu và điều khoản. KHÔNG có ô cọc giữ chuyến (web gỡ
 *    29/10/2026): tiền giữ chỗ do nền tảng đặt và thu cho mọi đơn (ADR 0033 · 0066).
 *
 * `isManage` = đang ở cổng quản lý (web `useWorkspace().isManage`). Khu tài khoản: chủ xe không
 * có trang chính sách gian hàng, nên khối bảo đảm sửa thẳng, không banner kế thừa/nút mở khoá.
 */
export function TermsBody({
  vehicleId,
  serviceType,
  canEdit,
  isManage = true,
  showRules = true,
}: {
  vehicleId: string;
  serviceType: ServiceType;
  canEdit: boolean;
  /** Cổng quản lý (mặc định) hay khu tài khoản — xem docblock trên. */
  isManage?: boolean;
  /**
   * Khối cọc · hạn mức km của tự lái. `false` khi nơi gọi đã vẽ hai khối đó ở chính sách của xe
   * (mục "Chính sách thuê" — web `TermsCards` chỉ còn giấy tờ & điều khoản).
   */
  showRules?: boolean;
}) {
  const t = useTranslations('VehicleManage');
  const settings = useVehicleServiceSettings(vehicleId);
  const pricing = useVehiclePricing(vehicleId);
  const setting = settings.data?.find((s) => s.serviceType === serviceType);

  if (settings.isLoading || pricing.isLoading) return <MiniRowsSkeleton rows={7} />;
  if (settings.isError || !setting || pricing.isError || !pricing.data) {
    return (
      <ScreenError
        error={settings.error ?? pricing.error}
        title={t('common.loadError')}
        onRetry={() => {
          void settings.refetch();
          void pricing.refetch();
        }}
      />
    );
  }

  return (
    <TermsForm
      key={`${setting.updatedAt ?? 'new'}:${pricing.data.source}`}
      setting={setting}
      pricing={pricing.data}
      serviceType={serviceType}
      vehicleId={vehicleId}
      canEdit={canEdit}
      isManage={isManage}
      showRules={showRules}
    />
  );
}

function TermsForm({
  setting,
  pricing,
  serviceType,
  vehicleId,
  canEdit,
  isManage,
  showRules,
}: {
  isManage: boolean;
  showRules: boolean;
  setting: VehicleServiceSetting;
  pricing: VehiclePricing;
  serviceType: ServiceType;
  vehicleId: string;
  canEdit: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('VehicleManage.terms');
  const tActions = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const navigateOnce = useNavigateOnce();
  const patch = usePatchVehicleServiceSetting(vehicleId, serviceType);
  const savePricing = useSaveVehiclePricing(vehicleId);
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;

  /*
   * Bảo đảm là CHÍNH SÁCH của gian hàng, xe chỉ kế thừa. Mở khoá tường minh mới sửa được.
   *
   * Đây cũng là lý do ràng buộc của khối này chỉ bật khi đang ghi đè: gian hàng CHƯA cấu hình
   * chính sách sẽ có `collateralMode = cash` với tiền cọc rỗng, và nếu luôn validate thì họ không
   * bao giờ lưu nổi một dòng điều khoản — form đòi số tiền cọc trên một ô họ không định sửa.
   */
  /*
   * KHU TÀI KHOẢN (web 30/09/2026): không banner kế thừa, không nút mở khoá — hai khối sửa thẳng.
   * Luật ghi GIỮ NGUYÊN: chỉ khi một ô chính sách thật sự đổi mới ghi bộ chính sách riêng, và
   * ràng buộc của khối cũng chỉ bật lúc đó.
   */
  const [editingCollateral, setEditingCollateral] = useState(overriding || !isManage);
  const collateralEditable = !withDriver && showRules && editingCollateral;
  /** Ô chính sách đã đổi chưa — ref vì RHF đọc `context` lúc validate, ngoài render. */
  const policyTouchedRef = useRef(false);

  const values = useMemo<FormValues>(
    () => ({
      ...policyToForm(pricing.policy ?? pricing.shopPolicy),
      identityDocument: setting.requiredDocuments.includes(CUSTOMER_DOCUMENT_TYPE.PASSPORT)
        ? DOC_PRESET.PASSPORT
        : DOC_PRESET.CITIZEN,
      identityVerifyMethod: setting.identityVerifyMethod,
      requireTermsAcceptance: setting.requireTermsAcceptance,
      termsText: setting.termsText ?? '',
    }),
    [pricing.policy, pricing.shopPolicy, setting],
  );
  const resolver = useValidationResolver<FormValues>(termsFormSchema, 'Vehicles.pricing.validation');
  const { control, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver,
    // Ràng buộc khối bảo đảm chỉ bật khi chủ xe thật sự mở nó ra sửa (đúng getter của web).
    context: {
      get policyEditable() {
        return collateralEditable && (isManage || policyTouchedRef.current);
      },
    },
    values,
  });
  const policyDirty = Boolean(
    formState.dirtyFields.collateralMode ||
    formState.dirtyFields.depositAmount ||
    formState.dirtyFields.collateralAssetTypes ||
    formState.dirtyFields.mileageLimitEnabled ||
    formState.dirtyFields.includedDistanceKmPerDay ||
    formState.dirtyFields.excessDistanceFeePerKm,
  );
  useEffect(() => {
    policyTouchedRef.current = policyDirty;
  }, [policyDirty]);
  const identityDocument = useWatch({ control, name: 'identityDocument' });

  const legalDocs = requiredIdentityDocuments(serviceType);
  const effectiveDocs = (
    identityDocument === DOC_PRESET.PASSPORT
      ? [DOC_PRESET.PASSPORT, ...legalDocs.filter((d) => d !== CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID)]
      : legalDocs
  ).map((d) => domainLabel('customerDocumentType', d));

  const submit = handleSubmit(async (next) => {
    try {
      await patch.mutateAsync({
        requiredDocuments:
          next.identityDocument === DOC_PRESET.PASSPORT ? [CUSTOMER_DOCUMENT_TYPE.PASSPORT] : [],
        identityVerifyMethod: next.identityVerifyMethod,
        requireTermsAcceptance: next.requireTermsAcceptance,
        termsText: next.termsText.trim() || null,
      });

      /*
       * Bảo đảm là CHÍNH SÁCH — chỉ ghi khi chủ xe thật sự đổi nó; đổi thì phải ghi đè cả bộ
       * (server nhận nguyên khối, không merge từng trường).
       */
      const policyTouched = collateralEditable && policyDirty;
      if (policyTouched) {
        await savePricing.mutateAsync({
          source: POLICY_SOURCE.VEHICLE,
          policy: formToSaveInput(next),
        });
      }
      toast.showSuccess(t('saved'));
    } catch (err) {
      toast.showError(errorMessage(err));
    }
  });

  const docOptions = [
    {
      value: DOC_PRESET.CITIZEN,
      label: withDriver ? t('docPresetDriver.citizen') : t('docPreset.citizen'),
    },
    {
      value: DOC_PRESET.PASSPORT,
      label: withDriver ? t('docPresetDriver.passport') : t('docPreset.passport'),
    },
  ];
  const verifyOptions = IDENTITY_VERIFY_METHOD_VALUES.map((value) => ({
    value,
    label: domainLabel('identityVerifyMethod', value),
  }));

  const saving = patch.isPending || savePricing.isPending;

  return (
    <YStack gap={space.md}>
      {withDriver || !showRules ? null : (
        <Card>
          <YStack gap={space.sm}>
            {!editingCollateral ? (
              <>
                <Callout tone="info">{t('collateralInherited')}</Callout>
                {canEdit ? (
                  <InlineAction
                    label={t('collateralCustomize')}
                    onPress={() => setEditingCollateral(true)}
                  />
                ) : null}
              </>
            ) : null}
            <CollateralPolicySection
              control={control}
              disabled={!canEdit || !editingCollateral}
              title={t('collateralTitle')}
              /*
                "Miễn thế chấp" ở màn CỦA MỘT XE nói một câu khác với màn chính sách gian hàng:
                đây là lời mời bỏ rào cản để xe dễ được đặt, không phải mô tả một chế độ thu tiền.
              */
              optionDescriptions={{ [COLLATERAL_MODE.NONE]: t('collateralNoneHint') }}
            />
            <MileagePolicySection
              control={control}
              title={t('mileageTitle')}
              disabled={!canEdit || !editingCollateral}
            />
          </YStack>
        </Card>
      )}

      <Card>
        <YStack gap={space.sm}>
          <SectionHeader
            icon="id-card-outline"
            lead={withDriver ? t('documentsSubtitleDriver') : t('documentsSubtitle')}
          >
            {t('documentsTitle')}
          </SectionHeader>
          <RadioField
            control={control}
            name="identityDocument"
            options={docOptions}
            disabled={!canEdit}
          />
          <Text col={colors.placeholder} fos={fontSize.label}>
            {effectiveDocs.join(LIST_SEPARATOR)}
          </Text>

          <RadioField
            control={control}
            name="identityVerifyMethod"
            label={t('verifyTitle')}
            options={verifyOptions}
            hint={t('verifyHint')}
            disabled={!canEdit}
          />

          <Controller
            control={control}
            name="requireTermsAcceptance"
            render={({ field }) => (
              <ToggleRow
                label={withDriver ? t('requireAcceptanceDriver') : t('requireAcceptance')}
                hint={t('requireAcceptanceHint')}
                checked={field.value}
                disabled={!canEdit}
                onToggle={() => field.onChange(!field.value)}
              />
            )}
          />

          {withDriver ? (
            <InlineAction
              label={t('contractTemplate')}
              onPress={() => navigateOnce(ROUTES.account.contractsDocuments())}
            />
          ) : null}
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.sm}>
          <SectionHeader lead={t('termsSubtitle')}>
            {withDriver ? t('termsTitleDriver') : t('termsTitle')}
          </SectionHeader>
          <TextField
            control={control}
            name="termsText"
            label={t('termsTitle')}
            placeholder={t('termsPlaceholder')}
            hint={t('termsHint')}
            maxLength={RENTAL_TERMS_MAX_LENGTH}
            multiline
            rows={6}
            editable={canEdit && !saving}
          />
        </YStack>
      </Card>

      {canEdit ? (
        <XStack gap={space.sm}>
          {formState.isDirty ? (
            <YStack flexShrink={0}>
              <Button
                label={tActions('cancel')}
                variant="ghost"
                disabled={saving}
                onPress={() => reset(values)}
              />
            </YStack>
          ) : null}
          <YStack f={1}>
            <Button
              label={tActions('saveChanges')}
              icon="checkmark-outline"
              loading={saving}
              disabled={!formState.isDirty}
              onPress={() => void submit()}
            />
          </YStack>
        </XStack>
      ) : null}
    </YStack>
  );
}
