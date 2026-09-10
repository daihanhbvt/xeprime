'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Form, Radio } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import {
  CUSTOMER_DOCUMENT_TYPE,
  DRIVER_DEPOSIT_MODE_VALUES,
  IDENTITY_VERIFY_METHOD_VALUES,
  POLICY_SOURCE,
  RENTAL_TERMS_MAX_LENGTH,
  SERVICE_TYPE,
  isDriverDepositModeSupported,
  requiredIdentityDocuments,
  type ServiceType,
} from '@xeprime/types';

import { RadioGroupField } from '@/components/form/RadioGroupField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ROUTES } from '@/constants/routes';
import { CollateralPolicySection } from '@/features/rental-policies/components/PolicySections';
import { formToSaveInput, policyToForm } from '@/features/rental-policies/form';
import {
  useSaveVehiclePricing,
  useVehiclePricing,
} from '@/features/rental-policies/hooks/use-vehicle-pricing';
import { policyFormSchema, type PolicyFormValues } from '@/features/rental-policies/schema';
import type { VehiclePricing } from '@/features/rental-policies/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

import { usePatchVehicleServiceSetting, useVehicleServiceSettings } from '../../hooks';
import type { VehicleServiceSetting } from '../../types';
import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import styles from './TermsSection.module.css';

/** Hai bộ giấy tờ chủ xe chọn — giá trị là MÃ giấy tờ định danh; GPLX của tự lái luôn được cộng. */
const DOC_PRESET = {
  CITIZEN: CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
  PASSPORT: CUSTOMER_DOCUMENT_TYPE.PASSPORT,
} as const;

const settingSchema = yup.object({
  identityDocument: yup.string().oneOf([DOC_PRESET.CITIZEN, DOC_PRESET.PASSPORT]).defined(),
  identityVerifyMethod: yup.string().oneOf([...IDENTITY_VERIFY_METHOD_VALUES]).defined(),
  requireTermsAcceptance: yup.boolean().defined(),
  termsText: yup.string().max(RENTAL_TERMS_MAX_LENGTH).defined().default(''),
  depositMode: yup.string().oneOf([...DRIVER_DEPOSIT_MODE_VALUES]).defined(),
});
type SettingValues = yup.InferType<typeof settingSchema>;
type FormValues = PolicyFormValues & SettingValues;

/**
 * Mục "Thủ tục cho thuê" (mockup 10 tự lái, 14 có tài xế) — MỘT component, hai dịch vụ:
 *
 *  - TỰ LÁI: hình thức bảo đảm = `RentalPolicy.collateralMode` (khối `CollateralPolicySection`
 *    dùng chung với chính sách gian hàng); giấy tờ xuất trình (CCCD hoặc hộ chiếu — GPLX luôn
 *    bắt buộc theo luật); cách đối chiếu (thủ công, kể cả "VNeID" = soi app của khách);
 *    điều khoản + bắt khách đồng ý.
 *  - CÓ TÀI XẾ: cọc giữ chuyến là `depositMode` RIÊNG (không mượn `depositAmount` của tự lái);
 *    30%/50% hiện disabled với lý do vì hệ thống chưa thu được — không lưu một % không được dùng.
 *
 * Mọi thứ khách thấy đều được server công bố ở trang xe và đóng băng vào yêu cầu/đơn.
 */
export function TermsSection({ serviceType }: { serviceType: ServiceType }) {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common');
  const settings = useVehicleServiceSettings(vehicle.id);
  const pricing = useVehiclePricing(vehicle.id);
  const setting = settings.data?.find((s) => s.serviceType === serviceType);

  if (settings.isLoading || pricing.isLoading) return <LoadingState variant="page" />;
  if (settings.isError || !setting || pricing.isError || !pricing.data) {
    return (
      <EmptyState
        variant="error"
        title={t('common.loadError')}
        description={tCommon('states.errorHint')}
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
      vehicleId={vehicle.id}
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
  const { message } = App.useApp();
  const patch = usePatchVehicleServiceSetting(vehicleId, serviceType);
  const savePricing = useSaveVehiclePricing(vehicleId);
  const withDriver = serviceType === SERVICE_TYPE.WITH_DRIVER;
  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  /*
   * Bảo đảm là CHÍNH SÁCH của gian hàng, xe chỉ kế thừa. Mở khoá tường minh mới sửa được —
   * cùng mẫu với tab "Giá & chính sách".
   *
   * Đây cũng là lý do ràng buộc của khối này chỉ bật khi đang ghi đè: gian hàng CHƯA cấu hình
   * chính sách sẽ có `collateralMode = cash` với tiền cọc rỗng, và nếu luôn validate thì họ
   * không bao giờ lưu nổi một dòng điều khoản — form đòi số tiền cọc trên một ô họ không định sửa.
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
    // Ràng buộc khối bảo đảm chỉ bật khi chủ xe thật sự mở nó ra sửa (xem chú thích trên).
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
         * Chỉ gửi chế độ cọc mà hệ thống THU được (`DRIVER_DEPOSIT_MODE_SUPPORTED`). 30%/50%
         * hiện là lựa chọn khoá ở giao diện; nếu lọt tới đây thì bỏ qua thay vì ghi một %
         * không có luồng thu — server cũng từ chối.
         */
        ...(withDriver && isDriverDepositModeSupported(next.depositMode)
          ? { depositMode: next.depositMode }
          : {}),
      });
      /*
       * Bảo đảm là CHÍNH SÁCH — chỉ ghi khi chủ xe thật sự đổi nó; đổi thì phải ghi đè cả bộ
       * (server nhận nguyên khối, không merge từng trường — quyết định C-04).
       */
      const policyTouched =
        collateralEditable &&
        (formState.dirtyFields.collateralMode ||
          formState.dirtyFields.depositAmount ||
          formState.dirtyFields.collateralAssetTypes);
      if (policyTouched) {
        await savePricing.mutateAsync({ source: POLICY_SOURCE.VEHICLE, policy: formToSaveInput(next) });
      }
      message.success(t('saved'));
    } catch (err) {
      message.error(errorMessage(err));
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

  return (
    <Form component={false} layout="vertical" colon={false}>
      <form noValidate onSubmit={submit} className={styles.form}>
        <SectionCard
          headingLevel={1}
          title={withDriver ? t('withDriverTitle') : t('selfDriveTitle')}
          subtitle={withDriver ? t('withDriverSubtitle') : t('selfDriveSubtitle')}
        >
          {withDriver ? (
            <fieldset className={styles.fieldset}>
              <legend className={styles.legend}>{t('depositTitle')}</legend>
              <p className={styles.hint}>{t('depositNote')}</p>
              <DepositModeField
                control={control}
                canEdit={canEdit}
                unsupportedLabel={t('depositUnsupported')}
              />
            </fieldset>
          ) : (
            <>
              {!editingCollateral ? (
                <Alert
                  type="info"
                  showIcon
                  message={t('collateralInherited')}
                  action={
                    canEdit ? (
                      <Button size="small" onClick={() => setEditingCollateral(true)}>
                        {t('collateralCustomize')}
                      </Button>
                    ) : undefined
                  }
                />
              ) : null}
              <CollateralPolicySection
                control={control}
                title={t('collateralTitle')}
                disabled={!canEdit || !editingCollateral}
                optionDescriptions={{ none: t('collateralNoneHint') }}
              />
            </>
          )}

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{t('documentsTitle')}</legend>
            <p className={styles.hint}>{withDriver ? t('documentsSubtitleDriver') : t('documentsSubtitle')}</p>
            <RadioGroupField
              control={control}
              name="identityDocument"
              options={docOptions}
              vertical
              disabled={!canEdit}
            />
            <p className={styles.effective}>{effectiveDocs.join(' · ')}</p>
            <RadioGroupField
              control={control}
              name="identityVerifyMethod"
              label={t('verifyTitle')}
              options={verifyOptions}
              disabled={!canEdit}
              help={t('verifyHint')}
            />
            <SwitchField
              control={control}
              name="requireTermsAcceptance"
              label={withDriver ? t('requireAcceptanceDriver') : t('requireAcceptance')}
              description={t('requireAcceptanceHint')}
              disabled={!canEdit}
            />
            {withDriver ? (
              <p className={styles.hint}>
                <Link href={ROUTES.ACCOUNT.CONTRACTS_DOCUMENTS}>{t('contractTemplate')}</Link>
              </p>
            ) : null}
          </fieldset>

          <fieldset className={styles.fieldset}>
            <legend className={styles.legend}>{withDriver ? t('termsTitleDriver') : t('termsTitle')}</legend>
            <p className={styles.hint}>{t('termsSubtitle')}</p>
            <TextAreaField
              control={control}
              name="termsText"
              label={t('termsTitle')}
              placeholder={t('termsPlaceholder')}
              maxLength={RENTAL_TERMS_MAX_LENGTH}
              rows={6}
              help={t('termsHint')}
            />
          </fieldset>
        </SectionCard>

        <StickyFormActions
          submitLabel={tActions('saveChanges')}
          cancelLabel={tActions('cancel')}
          onCancel={formState.isDirty ? () => reset(values) : undefined}
          submitting={patch.isPending || savePricing.isPending}
          disabled={!canEdit || !formState.isDirty}
        />
      </form>
    </Form>
  );
}

/**
 * Cọc giữ chuyến có tài xế — radio ba mức; mức hệ thống chưa THU được thì disabled kèm lý do
 * ngay dưới nhãn. Không lưu một phần trăm không được dùng (server cũng từ chối).
 */
function DepositModeField({
  control,
  canEdit,
  unsupportedLabel,
}: {
  control: ReturnType<typeof useForm<FormValues>>['control'];
  canEdit: boolean;
  unsupportedLabel: string;
}) {
  const domainLabel = useDomainLabel();
  const value = useWatch({ control, name: 'depositMode' });
  return (
    <Radio.Group value={value} disabled={!canEdit} className={styles.radioStack}>
      {DRIVER_DEPOSIT_MODE_VALUES.map((mode) => {
        const supported = isDriverDepositModeSupported(mode);
        return (
          <Radio key={mode} value={mode} disabled={!supported} className={styles.radio}>
            <span className={styles.radioLabel}>{domainLabel('driverDepositMode', mode)}</span>
            {!supported ? <span className={styles.radioNote}>{unsupportedLabel}</span> : null}
          </Radio>
        );
      })}
    </Radio.Group>
  );
}
