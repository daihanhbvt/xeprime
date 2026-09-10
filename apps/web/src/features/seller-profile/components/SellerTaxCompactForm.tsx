'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Alert, App, Button, Form, Skeleton } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import Link from 'next/link';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import {
  PERMISSION,
  SELLER_ENTITY_TYPE,
  SELLER_ENTITY_TYPE_VALUES,
  SELLER_PROFILE_STATUS,
  SELLER_PROFILE_STATUS_META,
  type SellerProfileStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { PermissionState } from '@/components/feedback/PermissionState';
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { ROUTES } from '@/constants/routes';
import { AccountPageHeader } from '@/features/account/components/AccountPageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useSaveSellerProfile, useSellerProfile } from '../hooks/use-seller-profile';
import { profileToSaveInput } from '../mappers';
import { buildSellerProfileSchema, type SellerProfileFormValues } from '../schema';
import type { SellerProfile } from '../types';
import styles from './SellerTaxCompactForm.module.css';

/** Bốn trường màn này sửa — phần còn lại của hồ sơ đi qua `profileToSaveInput`. */
type TaxFormValues = Pick<SellerProfileFormValues, 'entityType' | 'legalName' | 'taxId' | 'idNumber'>;

const FIELDS: readonly (keyof TaxFormValues)[] = ['entityType', 'legalName', 'taxId', 'idNumber'];

function toValues(profile: SellerProfile): TaxFormValues {
  return {
    entityType: profile.entityType as TaxFormValues['entityType'],
    legalName: profile.legalName ?? '',
    taxId: profile.taxId ?? '',
    idNumber: profile.idNumber ?? '',
  };
}

/**
 * "Thông tin khai thuế" — bản COMPACT của hồ sơ người bán cho chủ xe ở khu tài khoản.
 *
 * Cùng query, cùng mutation, cùng schema (`.pick` bốn trường) và cùng quyền với
 * `SellerProfileWorkspace` ở `/manage/shop/seller-profile`; chỉ hiện những gì model THẬT có:
 * loại chủ thể, tên pháp lý, và CCCD (cá nhân) hoặc mã số thuế (hộ kinh doanh / doanh nghiệp).
 *
 * Hai điều cố ý:
 *  - `PUT /seller-profile` là ghi toàn phần — trường không gửi thành `null`. Payload vì thế bắt
 *    đầu từ `profileToSaveInput(profile)` rồi mới ghi đè bốn trường ở đây, để lưu tên không xoá
 *    tài khoản ngân hàng đã khai ở màn đầy đủ.
 *  - KHÔNG có ô "loại hình cư trú" và KHÔNG có tỷ lệ thuế nào: model chưa có trường cư trú, và
 *    phân loại/tỷ lệ production còn chờ tư vấn thuế (ADR 0028 điều 4). Chỉ có một đoạn giải
 *    thích không tương tác.
 */
export function SellerTaxCompactForm() {
  const t = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const canView = has(PERMISSION.SELLER_PROFILE_VIEW);
  const canManage = has(PERMISSION.SELLER_PROFILE_MANAGE);

  const profileQuery = useSellerProfile();
  const save = useSaveSellerProfile();

  const schema = useMemo(
    () =>
      buildSellerProfileSchema({
        taxId: tSeller('form.validation.taxId'),
        idNumber: tSeller('form.validation.idNumber'),
        bankCode: tSeller('form.validation.bankCode'),
        bankAccountNumber: tSeller('form.validation.bankAccountNumber'),
      }).pick(FIELDS),
    [tSeller],
  );
  const profile = profileQuery.data;

  const { control, handleSubmit, formState, reset } = useForm<TaxFormValues>({
    resolver: yupResolver(schema),
    values: profile ? toValues(profile) : undefined,
  });
  const entityType = useWatch({ control, name: 'entityType' });
  const isIndividual = entityType === SELLER_ENTITY_TYPE.INDIVIDUAL;

  if (!canView) {
    return (
      <PermissionState
        kind="forbidden"
        title={tSeller('page.noPermissionTitle')}
        description={tSeller('page.noPermission')}
        missingPermissions={[PERMISSION.SELLER_PROFILE_VIEW]}
        action={
          <Link href={ROUTES.ACCOUNT.ROOT}>
            <Button type="primary">{tSeller('page.backHome')}</Button>
          </Link>
        }
      />
    );
  }

  if (profileQuery.isLoading) {
    return (
      <div className={styles.page}>
        <AccountPageHeader title={t('title')} subtitle={t('subtitle')} />
        <div className={styles.card}>
          <Skeleton active paragraph={{ rows: 6 }} />
        </div>
      </div>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <div className={styles.page}>
        <AccountPageHeader title={t('title')} subtitle={t('subtitle')} />
        <Alert
          type="error"
          showIcon
          message={t('loadError')}
          action={
            <Button size="small" onClick={() => void profileQuery.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      </div>
    );
  }

  const readOnly = !profile.editable || !canManage;
  const dirty = formState.isDirty && !readOnly;

  const onSave = handleSubmit((values) => {
    save.mutate(
      {
        // Bản đầy đủ trước, bốn trường của màn này sau — không xoá phần màn này không hiện.
        ...profileToSaveInput(profile),
        entityType: values.entityType,
        legalName: values.legalName || null,
        taxId: values.taxId || null,
        idNumber: values.idNumber || null,
      },
      {
        onSuccess: () => message.success(t('saved')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <div className={styles.page}>
      <AccountPageHeader
        title={
          <span className={styles.titleRow}>
            {t('title')}
            <StatusTag
              value={profile.status as SellerProfileStatus}
              meta={SELLER_PROFILE_STATUS_META}
              group="sellerProfileStatus"
            />
          </span>
        }
        subtitle={t('subtitle')}
      />

      {profile.status === SELLER_PROFILE_STATUS.CHANGES_REQUESTED && profile.reviewNote ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          message={tSeller('page.changesRequested')}
          description={profile.reviewNote}
        />
      ) : null}
      {profile.status === SELLER_PROFILE_STATUS.REJECTED && profile.reviewNote ? (
        <Alert
          type="error"
          showIcon
          className={styles.alert}
          message={tSeller('page.rejected')}
          description={profile.reviewNote}
        />
      ) : null}
      {profile.status === SELLER_PROFILE_STATUS.SUBMITTED ? (
        <Alert type="info" showIcon className={styles.alert} message={tSeller('page.pendingReview')} />
      ) : null}
      {profile.status === SELLER_PROFILE_STATUS.VERIFIED ? (
        <Alert type="success" showIcon className={styles.alert} message={tSeller('page.verified')} />
      ) : null}
      {!profile.editable ? (
        <Alert type="info" showIcon className={styles.alert} message={tSeller('page.readOnly')} />
      ) : !canManage ? (
        <Alert type="info" showIcon className={styles.alert} message={t('viewOnly')} />
      ) : null}

      <Form
        component={false}
        layout="vertical"
        size="large"
        colon={false}
        requiredMark={trailingRequiredMark}
      >
        <form onSubmit={onSave} noValidate className={styles.card}>
          <fieldset disabled={readOnly || save.isPending} className={styles.fieldset}>
            <SelectField
              control={control}
              name="entityType"
              label={t('entityType')}
              required
              options={SELLER_ENTITY_TYPE_VALUES.map((value) => ({
                value,
                label: domainLabel('sellerEntityType', value),
              }))}
              help={t('entityHint')}
            />

            {/* Thông tin giải thích, KHÔNG phải ô nhập: model chưa có trường cư trú. */}
            <div className={styles.infoBlock}>
              <span className={styles.infoTitle}>
                <InfoCircleOutlined aria-hidden="true" />
                {t('residencyTitle')}
              </span>
              <p className={styles.infoBody}>{t('residencyBody')}</p>
            </div>

            <TextField
              control={control}
              name="legalName"
              label={isIndividual ? t('legalName') : t('legalNameBusiness')}
              autoComplete="name"
            />

            {isIndividual ? (
              <TextField
                control={control}
                name="idNumber"
                label={t('idNumber')}
                help={t('idNumberHint')}
              />
            ) : (
              <TextField
                control={control}
                name="taxId"
                label={t('taxId')}
                help={tSeller('form.taxIdHint')}
              />
            )}
          </fieldset>

          <p className={styles.fullProfile}>
            {t('fullProfile')}{' '}
            <Link href={ROUTES.MANAGE.SELLER_PROFILE}>{t('openFullProfile')}</Link>
          </p>

          {!readOnly ? (
            <div className={styles.actions}>
              {dirty ? (
                <Button onClick={() => reset()} disabled={save.isPending}>
                  {tSeller('form.reset')}
                </Button>
              ) : null}
              <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!dirty}>
                {t('save')}
              </Button>
            </div>
          ) : null}
        </form>
      </Form>
    </div>
  );
}
