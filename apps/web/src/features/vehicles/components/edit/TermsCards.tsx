'use client';

import { App, Form } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useId, useMemo } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import { yupResolver } from '@hookform/resolvers/yup';
import {
  CUSTOMER_DOCUMENT_TYPE,
  IDENTITY_VERIFY_METHOD_VALUES,
  RENTAL_TERMS_MAX_LENGTH,
  SERVICE_TYPE,
  isVehicleServiceTypeAllowed,
  type ServiceType,
} from '@xeprime/types';

import { RadioGroupField } from '@/components/form/RadioGroupField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { RENTAL_TERMS_ANCHOR, ROUTES } from '@/constants/routes';
import { PolicyInfoTip } from '@/features/rental-policies/components/PolicyInfoTip';
import { useAvailableHref } from '@/features/tenant-support/support-session';
import {
  usePatchVehicleServiceSetting,
  useVehicleServiceSettings,
} from '@/features/vehicle-manage/hooks';
import type { VehicleServiceSetting } from '@/features/vehicle-manage/types';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

import type { VehicleDetail } from '../../types';
import { EditCard } from './EditCard';
import { useEditForm } from './edit-actions';
import styles from './EditPanes.module.css';

/** Hai bộ giấy tờ chủ xe chọn — giá trị là MÃ giấy tờ định danh; GPLX của tự lái luôn được cộng. */
const DOC_PRESET = {
  CITIZEN: CUSTOMER_DOCUMENT_TYPE.CITIZEN_ID,
  PASSPORT: CUSTOMER_DOCUMENT_TYPE.PASSPORT,
} as const;

const schema = yup.object({
  identityDocument: yup.string().oneOf([DOC_PRESET.CITIZEN, DOC_PRESET.PASSPORT]).defined(),
  identityVerifyMethod: yup
    .string()
    .oneOf([...IDENTITY_VERIFY_METHOD_VALUES])
    .defined(),
  requireTermsAcceptance: yup.boolean().defined(),
  termsText: yup.string().max(RENTAL_TERMS_MAX_LENGTH).defined().default(''),
});
type FormValues = yup.InferType<typeof schema>;

/** Neo của khối điều khoản từng dịch vụ — link cũ `?tab=*-terms` cuộn tới đúng khối. */
export function termsAnchorOf(service: ServiceType): string {
  return service === SERVICE_TYPE.WITH_DRIVER
    ? `${RENTAL_TERMS_ANCHOR}-${SERVICE_TYPE.WITH_DRIVER}`
    : RENTAL_TERMS_ANCHOR;
}

/**
 * Giấy tờ & điều khoản của mục "Chính sách thuê" (design "Điều kiện" `23721:30416`): giấy tờ khách
 * phải xuất trình · cách đối chiếu · bắt khách đồng ý điều khoản · nội dung điều khoản — một khối cho
 * "Tự lái & Dài hạn" (thiết lập của tự lái), một khối cho "Có tài xế". Mỗi khối ghi thiết lập dịch
 * vụ của nó (`PATCH /vehicles/:id/service-settings/:service`); cả hai lưu bằng nút ở cột phải.
 *
 * Điều khoản không có bản của gian hàng, nên công tắc "Áp dụng chính sách của gian hàng" ở đầu mục
 * KHÔNG áp cho hai khối này (sổ cái §3.6 E14).
 */
export function TermsCards({
  vehicle,
  canEdit,
  scrollTo,
}: {
  vehicle: VehicleDetail;
  canEdit: boolean;
  /** Dịch vụ cần cuộn tới khi mở từ một link cũ tới "Thủ tục cho thuê" của dịch vụ đó. */
  scrollTo: ServiceType | null;
}) {
  const t = useTranslations('VehicleManage');
  const tCommon = useTranslations('Common');
  const settings = useVehicleServiceSettings(vehicle.id);

  useEffect(() => {
    if (!scrollTo || !settings.data) return;
    document.getElementById(termsAnchorOf(scrollTo))?.scrollIntoView({ block: 'start' });
  }, [scrollTo, settings.data]);

  if (settings.isLoading) return <LoadingState variant="inline" />;
  if (settings.isError || !settings.data) {
    return (
      <EmptyState
        variant="error"
        title={t('common.loadError')}
        description={tCommon('states.errorHint')}
        onRetry={() => void settings.refetch()}
      />
    );
  }

  // Có tài xế chỉ có ở loại xe cho phép nó (xe máy thì không) — không dựng khối cho dịch vụ không thể bật.
  const families = [SERVICE_TYPE.SELF_DRIVE, SERVICE_TYPE.WITH_DRIVER].filter(
    (service) =>
      service === SERVICE_TYPE.SELF_DRIVE ||
      isVehicleServiceTypeAllowed(vehicle.vehicleType, service),
  );

  return (
    <div className={styles.stack}>
      {families.map((service) => {
        const setting = settings.data.find((item) => item.serviceType === service);
        return setting ? (
          <TermsCard
            key={`${service}:${setting.updatedAt ?? 'new'}`}
            setting={setting}
            service={service}
            vehicleId={vehicle.id}
            canEdit={canEdit}
          />
        ) : null;
      })}
    </div>
  );
}

function TermsCard({
  setting,
  service,
  vehicleId,
  canEdit,
}: {
  setting: VehicleServiceSetting;
  service: ServiceType;
  vehicleId: string;
  canEdit: boolean;
}) {
  const t = useTranslations('VehicleManage.terms');
  const tEditor = useTranslations('Vehicles.editor.conditions');
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const available = useAvailableHref();
  const contractsHref = available(ROUTES.MANAGE.CONTRACTS_DOCUMENTS);
  const patch = usePatchVehicleServiceSetting(vehicleId, service);
  const withDriver = service === SERVICE_TYPE.WITH_DRIVER;

  const values = useMemo<FormValues>(
    () => ({
      identityDocument: setting.requiredDocuments.includes(CUSTOMER_DOCUMENT_TYPE.PASSPORT)
        ? DOC_PRESET.PASSPORT
        : DOC_PRESET.CITIZEN,
      identityVerifyMethod: setting.identityVerifyMethod,
      requireTermsAcceptance: setting.requireTermsAcceptance,
      termsText: setting.termsText ?? '',
    }),
    [setting],
  );
  const { control, handleSubmit, reset, formState } = useForm<FormValues>({
    resolver: yupResolver(schema),
    values,
  });

  function submit(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void handleSubmit(
        async (next) => {
          try {
            await patch.mutateAsync({
              requiredDocuments:
                next.identityDocument === DOC_PRESET.PASSPORT
                  ? [CUSTOMER_DOCUMENT_TYPE.PASSPORT]
                  : [],
              identityVerifyMethod: next.identityVerifyMethod,
              requireTermsAcceptance: next.requireTermsAcceptance,
              termsText: next.termsText.trim() || null,
            });
            message.success(t('saved'));
            resolve(true);
          } catch (err) {
            message.error(errorMessage(err));
            resolve(false);
          }
        },
        () => resolve(false),
      )();
    });
  }

  useEditForm(`terms:${service}`, {
    dirty: formState.isDirty,
    submitting: patch.isPending,
    submit,
    reset: () => reset(values),
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
  const docsHeadingId = useId();
  const verifyHeadingId = useId();
  const verifyOptions = IDENTITY_VERIFY_METHOD_VALUES.map((value) => ({
    value,
    label: domainLabel('identityVerifyMethod', value),
  }));

  return (
    <Form component={false} layout="vertical" colon={false} disabled={!canEdit}>
      <EditCard
        id={termsAnchorOf(service)}
        title={withDriver ? tEditor('withDriverTitle') : tEditor('selfDriveTitle')}
      >
        {/*
          Bố cục design: giấy tờ + cách đối chiếu là MỘT nhóm (tiêu đề đậm, lựa chọn xếp dọc), rồi
          hàng "khách phải đồng ý", rồi điều khoản — cách nhau bằng vạch kẻ. Lời giải thích của nhóm
          giấy tờ nằm trong icon ⓘ; nhãn từng lựa chọn đã kể đủ giấy tờ nên không lặp dòng liệt kê.
        */}
        <div className={styles.policyRows}>
          <div className={styles.termsGroup}>
            <div>
              <h3 id={docsHeadingId} className={`${styles.subheading} ${styles.titleWithTip}`}>
                {t('documentsTitle')}
                <PolicyInfoTip label={t('documentsTitle')}>
                  {withDriver ? t('documentsSubtitleDriver') : t('documentsSubtitle')}
                </PolicyInfoTip>
              </h3>
              <RadioGroupField
                control={control}
                name="identityDocument"
                options={docOptions}
                labelledBy={docsHeadingId}
              />
            </div>
            <div>
              <h3 id={verifyHeadingId} className={styles.subheading}>
                {t('verifyTitle')}
              </h3>
              <RadioGroupField
                control={control}
                name="identityVerifyMethod"
                options={verifyOptions}
                labelledBy={verifyHeadingId}
                help={<em>{t('verifyHint')}</em>}
              />
            </div>
          </div>
          <SwitchField
            control={control}
            name="requireTermsAcceptance"
            label={withDriver ? t('requireAcceptanceDriver') : t('requireAcceptance')}
            description={t('requireAcceptanceHint')}
          />
          <div>
            <h3 className={styles.subheading}>
              {withDriver ? t('termsTitleDriver') : t('termsTitle')}
            </h3>
            <p className={styles.toggleHint}>{t('termsHint')}</p>
            <TextAreaField
              control={control}
              name="termsText"
              label={withDriver ? t('termsTitleDriver') : t('termsTitle')}
              hideLabel
              placeholder={t('termsPlaceholder')}
              maxLength={RENTAL_TERMS_MAX_LENGTH}
              rows={5}
            />
            {withDriver && contractsHref ? (
              <p className={styles.toggleHint}>
                <Link href={contractsHref}>{t('contractTemplate')}</Link>
              </p>
            ) : null}
          </div>
        </div>
      </EditCard>
    </Form>
  );
}
