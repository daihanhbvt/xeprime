import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  CUSTOMER_DOCUMENT_TYPE,
  COLLATERAL_MODE,
  DRIVER_DEPOSIT_MODE_VALUES,
  IDENTITY_VERIFY_METHOD_VALUES,
  POLICY_SOURCE,
  RENTAL_TERMS_MAX_LENGTH,
  SERVICE_TYPE,
  isDriverDepositModeSupported,
  requiredIdentityDocuments,
  type ServiceType,
} from '@xeprime/types';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
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
import {
  VEHICLE_MANAGE_SECTION,
  type VehicleManageSection,
} from '@/navigation/vehicle-manage-section';
import { Controller } from 'react-hook-form';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { VehicleManageShell } from './components/VehicleManageShell';
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
  depositMode: yup
    .string()
    .oneOf([...DRIVER_DEPOSIT_MODE_VALUES])
    .defined(),
});
type SettingValues = yup.InferType<typeof settingSchema>;
type FormValues = PolicyFormValues & SettingValues;

/**
 * Mục "Thủ tục cho thuê" — MỘT màn, hai dịch vụ. Bản native của `TermsSection`.
 *
 *  - TỰ LÁI: hình thức bảo đảm = `RentalPolicy.collateralMode` (khối dùng chung với chính sách
 *    gian hàng); giấy tờ xuất trình (CCCD hoặc hộ chiếu — GPLX luôn bắt buộc theo luật); cách đối
 *    chiếu; điều khoản + bắt khách đồng ý.
 *  - CÓ TÀI XẾ: cọc giữ chuyến là `depositMode` RIÊNG (không mượn cọc thế chấp của tự lái); mức
 *    hệ thống chưa thu được thì khoá kèm lý do — không lưu một % không có luồng thu.
 *
 * Mọi thứ khách thấy đều được server công bố ở trang xe và đóng băng vào yêu cầu/đơn.
 */
export function VehicleTermsScreen({
  vehicleId,
  serviceType,
}: {
  vehicleId: string;
  serviceType: ServiceType;
}) {
  const t = useTranslations('VehicleManage.terms');
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const section: VehicleManageSection = withDriver
    ? VEHICLE_MANAGE_SECTION.WITH_DRIVER_TERMS
    : VEHICLE_MANAGE_SECTION.SELF_DRIVE_TERMS;

  return (
    <VehicleManageShell
      vehicleId={vehicleId}
      section={section}
      title={t(withDriver ? 'withDriverTitle' : 'selfDriveTitle')}
      subtitle={t(withDriver ? 'withDriverSubtitle' : 'selfDriveSubtitle')}
    >
      {({ canEdit }) => (
        <TermsBody vehicleId={vehicleId} serviceType={serviceType} canEdit={canEdit} />
      )}
    </VehicleManageShell>
  );
}

function TermsBody({
  vehicleId,
  serviceType,
  canEdit,
}: {
  vehicleId: string;
  serviceType: ServiceType;
  canEdit: boolean;
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
    />
  );
}

function TermsForm({
  setting,
  pricing,
  serviceType,
  vehicleId,
  canEdit,
}: {
  setting: VehicleServiceSetting;
  pricing: VehiclePricing;
  serviceType: ServiceType;
  vehicleId: string;
  canEdit: boolean;
}) {
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
  const [editingCollateral, setEditingCollateral] = useState(overriding);
  const collateralEditable = !withDriver && editingCollateral;

  const values = useMemo<FormValues>(
    () => ({
      ...policyToForm(pricing.policy ?? pricing.shopPolicy),
      identityDocument: setting.requiredDocuments.includes(CUSTOMER_DOCUMENT_TYPE.PASSPORT)
        ? DOC_PRESET.PASSPORT
        : DOC_PRESET.CITIZEN,
      identityVerifyMethod: setting.identityVerifyMethod,
      requireTermsAcceptance: setting.requireTermsAcceptance,
      termsText: setting.termsText ?? '',
      depositMode: setting.depositMode,
    }),
    [pricing.policy, pricing.shopPolicy, setting],
  );
  const { control, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: yupResolver(policyFormSchema.concat(settingSchema)),
    context: { policyEditable: collateralEditable },
    values,
  });
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
        /*
         * Chỉ gửi chế độ cọc mà hệ thống THU được (`DRIVER_DEPOSIT_MODE_SUPPORTED`). Mức khác là
         * lựa chọn khoá ở giao diện; lọt tới đây thì bỏ qua thay vì ghi một % không có luồng thu —
         * server cũng từ chối.
         */
        ...(withDriver && isDriverDepositModeSupported(next.depositMode)
          ? { depositMode: next.depositMode }
          : {}),
      });

      /*
       * Bảo đảm là CHÍNH SÁCH — chỉ ghi khi chủ xe thật sự đổi nó; đổi thì phải ghi đè cả bộ
       * (server nhận nguyên khối, không merge từng trường).
       */
      const policyTouched =
        collateralEditable &&
        (formState.dirtyFields.collateralMode ||
          formState.dirtyFields.depositAmount ||
          formState.dirtyFields.collateralAssetTypes ||
          formState.dirtyFields.mileageLimitEnabled ||
          formState.dirtyFields.includedDistanceKmPerDay ||
          formState.dirtyFields.excessDistanceFeePerKm);
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
  const depositOptions = DRIVER_DEPOSIT_MODE_VALUES.map((mode) => ({
    value: mode,
    label: domainLabel('driverDepositMode', mode),
    /* Mức hệ thống chưa THU được thì khoá kèm lý do ngay dưới nhãn — không lưu một % chết. */
    ...(isDriverDepositModeSupported(mode)
      ? {}
      : { hint: t('depositUnsupported'), disabled: true }),
  }));

  const saving = patch.isPending || savePricing.isPending;

  return (
    <YStack gap={space.md}>
      {withDriver ? (
        <Card>
          <YStack gap={space.sm}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('depositTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('depositNote')}
            </Text>
            <RadioField
              control={control}
              name="depositMode"
              options={depositOptions}
              disabled={!canEdit}
            />
          </YStack>
        </Card>
      ) : (
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
            <MileagePolicySection control={control} disabled={!canEdit || !editingCollateral} />
          </YStack>
        </Card>
      )}

      <Card>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {t('documentsTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {withDriver ? t('documentsSubtitleDriver') : t('documentsSubtitle')}
          </Text>
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
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {withDriver ? t('termsTitleDriver') : t('termsTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('termsSubtitle')}
          </Text>
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
