'use client';

import { SaveOutlined, SendOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Skeleton } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  SELLER_ENTITY_TYPE_VALUES,
  SELLER_PROFILE_STATUS,
  SELLER_PROFILE_STATUS_META,
  type SellerProfileStatus,
} from '@xeprime/types';
import { DateTimeField } from '@/components/form/DateTimeField';
import { TextField } from '@/components/form/TextField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useSaveSellerProfile,
  useSellerProfile,
  useSubmitSellerProfile,
} from '../hooks/use-seller-profile';
import { buildSellerProfileSchema, type SellerProfileFormValues } from '../schema';
import type { SellerProfile } from '../types';
import styles from './SellerProfileWorkspace.module.css';

/**
 * Nhãn của một trường còn thiếu. Khoá của `t()` phải TĨNH (next-intl kiểm lúc biên dịch), nên
 * mã từ server đi qua bảng tra này chứ không ghép chuỗi — mã lạ hiện lại chính nó thay vì nổ.
 */
function missingFieldLabel(
  t: ReturnType<typeof useTranslations<'SellerProfile'>>,
  field: string,
): string {
  switch (field) {
    case 'legalName':
      return t('form.missingField.legalName');
    case 'bankCode':
      return t('form.missingField.bankCode');
    case 'bankAccountNumber':
      return t('form.missingField.bankAccountNumber');
    case 'bankAccountName':
      return t('form.missingField.bankAccountName');
    case 'idNumber':
      return t('form.missingField.idNumber');
    case 'taxId':
      return t('form.missingField.taxId');
    default:
      return field;
  }
}

function toValues(profile: SellerProfile): SellerProfileFormValues {
  return {
    entityType: profile.entityType as SellerProfileFormValues['entityType'],
    legalName: profile.legalName ?? '',
    taxId: profile.taxId ?? '',
    idNumber: profile.idNumber ?? '',
    idIssuedAt: profile.idIssuedAt ?? null,
    idIssuedBy: profile.idIssuedBy ?? '',
    bankCode: profile.bankCode ?? '',
    bankAccountNumber: profile.bankAccountNumber ?? '',
    bankAccountName: profile.bankAccountName ?? '',
  };
}

/**
 * Hồ sơ người bán của gian hàng — ADR 0028 release gate 1 (R3).
 *
 * Bộ CƠ BẢN (ADR 0027 điều 1): không `@RequiresFeature` ở backend, và trang này không kiểm tra
 * gói — mọi tenant, kể cả tuyến hoa hồng chưa mua gì, đều khai được danh tính và tài khoản nhận
 * tiền. "Đủ để gửi xác minh" là quy tắc SERVER trả về (`missingFields`), form chỉ hiển thị lại
 * chứ không tự đoán — cùng lý do `PriceBreakdown` không tự cộng phí ở client.
 */
export function SellerProfileWorkspace() {
  const t = useTranslations('SellerProfile');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const profileQuery = useSellerProfile();
  const save = useSaveSellerProfile();
  const submit = useSubmitSellerProfile();

  const schema = useMemo(
    () =>
      buildSellerProfileSchema({
        taxId: t('form.validation.taxId'),
        idNumber: t('form.validation.idNumber'),
        bankCode: t('form.validation.bankCode'),
        bankAccountNumber: t('form.validation.bankAccountNumber'),
      }),
    [t],
  );
  const profile = profileQuery.data;

  const { control, handleSubmit, formState, reset } = useForm<SellerProfileFormValues>({
    resolver: yupResolver(schema),
    values: profile ? toValues(profile) : undefined,
  });

  if (profileQuery.isLoading) {
    return (
      <div>
        <ManagePageHeader title={t('page.title')} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div>
        <ManagePageHeader title={t('page.title')} />
        <Alert
          type="error"
          showIcon
          message={t('page.loadError')}
          action={
            <Button size="small" onClick={() => void profileQuery.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const readOnly = !profile.editable;
  const dirty = formState.isDirty && !readOnly;
  const canSubmit = profile.missingFields.length === 0 && !readOnly;

  const onSave = handleSubmit((values) => {
    save.mutate(
      {
        entityType: values.entityType,
        legalName: values.legalName || null,
        taxId: values.taxId || null,
        idNumber: values.idNumber || null,
        idIssuedAt: values.idIssuedAt || null,
        idIssuedBy: values.idIssuedBy || null,
        bankCode: values.bankCode || null,
        bankAccountNumber: values.bankAccountNumber || null,
        bankAccountName: values.bankAccountName || null,
      },
      {
        onSuccess: () => message.success(t('form.saved')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  function onSubmitReview() {
    submit.mutate(undefined, {
      onSuccess: () => message.success(t('form.submitted')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <Form component={false} layout="vertical" size="large" colon={false} requiredMark={trailingRequiredMark}>
      <form onSubmit={onSave} noValidate className={styles.form}>
        <ManagePageHeader
          title={
            <span className={styles.titleRow}>
              {t('page.title')}
              <StatusTag
                value={profile.status as SellerProfileStatus}
                meta={SELLER_PROFILE_STATUS_META}
                group="sellerProfileStatus"
              />
            </span>
          }
          subtitle={t('page.subtitle')}
          extra={
            <>
              {dirty ? (
                <Button onClick={() => reset()} disabled={save.isPending}>
                  {t('form.reset')}
                </Button>
              ) : null}
              <Button type="primary" icon={<SaveOutlined />} htmlType="submit" loading={save.isPending} disabled={!dirty}>
                {tCommon('actions.save')}
              </Button>
            </>
          }
        />

        {profile.status === SELLER_PROFILE_STATUS.CHANGES_REQUESTED && profile.reviewNote ? (
          <Alert
            type="warning"
            showIcon
            className={styles.alert}
            message={t('page.changesRequested')}
            description={profile.reviewNote}
          />
        ) : null}
        {profile.status === SELLER_PROFILE_STATUS.REJECTED && profile.reviewNote ? (
          <Alert
            type="error"
            showIcon
            className={styles.alert}
            message={t('page.rejected')}
            description={profile.reviewNote}
          />
        ) : null}
        {profile.status === SELLER_PROFILE_STATUS.SUBMITTED ? (
          <Alert type="info" showIcon className={styles.alert} message={t('page.pendingReview')} />
        ) : null}
        {profile.status === SELLER_PROFILE_STATUS.VERIFIED ? (
          <Alert type="success" showIcon className={styles.alert} message={t('page.verified')} />
        ) : null}

        {readOnly ? (
          <Alert type="info" showIcon className={styles.alert} message={t('page.readOnly')} />
        ) : null}

        <fieldset disabled={readOnly || save.isPending} className={styles.fieldset}>
          <RadioGroupField
            control={control}
            name="entityType"
            label={t('form.entityType')}
            required
            options={SELLER_ENTITY_TYPE_VALUES.map((value) => ({
              value,
              label: domainLabel('sellerEntityType', value),
            }))}
          />
          <TextField control={control} name="legalName" label={t('form.legalName')} />
          <TextField control={control} name="taxId" label={t('form.taxId')} help={t('form.taxIdHint')} />
          <TextField control={control} name="idNumber" label={t('form.idNumber')} />
          <DateTimeField control={control} name="idIssuedAt" dateOnly label={t('form.idIssuedAt')} />
          <TextField control={control} name="idIssuedBy" label={t('form.idIssuedBy')} />
          <TextField
            control={control}
            name="bankCode"
            label={t('form.bankCode')}
            help={t('form.bankCodeHint')}
          />
          <TextField control={control} name="bankAccountNumber" label={t('form.bankAccountNumber')} />
          <TextField control={control} name="bankAccountName" label={t('form.bankAccountName')} />
        </fieldset>

        {!readOnly && profile.missingFields.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            className={styles.alert}
            message={t('form.missingFields', { count: profile.missingFields.length })}
            description={profile.missingFields.map((field) => missingFieldLabel(t, field)).join(' · ')}
          />
        ) : null}

        {!readOnly ? (
          <div className={styles.submitRow}>
            <Button
              type="default"
              icon={<SendOutlined />}
              loading={submit.isPending}
              disabled={!canSubmit || dirty}
              onClick={onSubmitReview}
            >
              {t('form.submitForReview')}
            </Button>
            {dirty ? <span className={styles.hint}>{t('form.saveBeforeSubmit')}</span> : null}
          </div>
        ) : null}
      </form>
    </Form>
  );
}
