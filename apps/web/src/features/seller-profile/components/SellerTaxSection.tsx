'use client';

import { Alert, App, Button, Skeleton } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
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
import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { SectionCard } from '@/components/layout/SectionCard';
import { usePermissions } from '@/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

import { useSaveSellerProfile, useSellerProfile } from '../hooks/use-seller-profile';
import { profileToSaveInput } from '../mappers';
import { buildSellerProfileSchema, type SellerProfileFormValues } from '../schema';
import type { SellerProfile } from '../types';
import styles from './SellerTaxSection.module.css';

/** Bốn trường màn này sửa — phần còn lại của hồ sơ đi qua `profileToSaveInput`. */
type TaxFormValues = Pick<
  SellerProfileFormValues,
  'entityType' | 'legalName' | 'taxId' | 'idNumber'
>;

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
 * "Thông tin khai thuế" — MỘT section, dựng ở trang hồ sơ của CẢ hai tuyến (07/10/2026): "Hồ sơ chủ
 * xe" (tuyến hoa hồng, trước là trang `/tax`) và trang Cửa hàng (tuyến gói, thay ô MST cũ ở "Địa chỉ
 * & pháp lý" — ô đó ghi vào một bản sao mà không phép tính thuế nào đọc, nay đã gỡ).
 *
 * Đây là nơi DUY NHẤT khai mã số thuế: `seller_profiles.tax_id` là thứ hợp đồng, màn quản trị và báo
 * cáo thuế đọc. Thuế ĐÃ khấu trừ theo kỳ là chuyện tiền, nên nó ở trang "Số dư & rút tiền".
 *
 * Cùng query, cùng mutation, cùng schema (`.pick` bốn trường) và cùng quyền với hồ sơ người bán đầy
 * đủ; chỉ hiện những gì model THẬT có: loại chủ thể, tên pháp lý, và CCCD (cá nhân) hoặc mã số thuế
 * (hộ kinh doanh / doanh nghiệp).
 *
 * Hai điều cố ý:
 *  - `PUT /seller-profile` là ghi toàn phần — trường không gửi thành `null`. Payload vì thế bắt
 *    đầu từ `profileToSaveInput(profile)` rồi mới ghi đè bốn trường ở đây, để lưu tên không xoá
 *    phần hồ sơ màn này không hiện.
 *  - KHÔNG có gì về "loại hình cư trú" và KHÔNG có tỷ lệ thuế nào: model chưa có trường cư trú,
 *    và phân loại/tỷ lệ production còn chờ tư vấn thuế (ADR 0028 điều 4). Đoạn giải thích cư trú
 *    cũng đã bỏ (07/10/2026): một khối chữ nói về thứ chưa tồn tại chỉ làm form dài thêm.
 *
 * Trang gọi CHỈ dựng section này khi có `seller_profile.view` — thiếu quyền thì section vắng khỏi
 * cả trang lẫn mục lục, thay vì một khối "không có quyền" giữa một trang hồ sơ.
 *
 * Một nút lưu RIÊNG ở đáy khối, giống "Thông tin chủ xe": nó nằm trong đúng vùng mà nó lưu.
 */
export function SellerTaxSection({ id }: { id: string }) {
  const t = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();

  const canManage = has(PERMISSION.SELLER_PROFILE_MANAGE);

  const profileQuery = useSellerProfile();
  const save = useSaveSellerProfile();

  const schema = useMemo(
    () =>
      buildSellerProfileSchema({
        taxId: tSeller('form.validation.taxId'),
        idNumber: tSeller('form.validation.idNumber'),
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

  if (profileQuery.isLoading) {
    return (
      <SectionCard id={id} title={t('title')} hint={t('subtitle')}>
        <Skeleton active paragraph={{ rows: 4 }} />
      </SectionCard>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <SectionCard id={id} title={t('title')} hint={t('subtitle')}>
        <Alert
          type="error"
          showIcon
          title={t('loadError')}
          action={
            <Button size="small" onClick={() => void profileQuery.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      </SectionCard>
    );
  }

  const readOnly = !profile.editable || !canManage;
  const dirty = formState.isDirty && !readOnly;

  const onSave = handleSubmit((values) => {
    // Enter vẫn submit form khi nút Lưu đang quay — chặn lượt thứ hai ở đây.
    if (save.isPending) return;
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
        // Câu lỗi tra từ MÃ (ADR 0012), không hiện `message` tiếng Việt của backend.
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <SectionCard
      id={id}
      title={t('title')}
      hint={t('subtitle')}
      extra={
        <StatusTag
          value={profile.status as SellerProfileStatus}
          meta={SELLER_PROFILE_STATUS_META}
          group="sellerProfileStatus"
        />
      }
    >
      {profile.status === SELLER_PROFILE_STATUS.CHANGES_REQUESTED && profile.reviewNote ? (
        <Alert
          type="warning"
          showIcon
          className={styles.alert}
          title={tSeller('page.changesRequested')}
          description={profile.reviewNote}
        />
      ) : null}
      {profile.status === SELLER_PROFILE_STATUS.REJECTED && profile.reviewNote ? (
        <Alert
          type="error"
          showIcon
          className={styles.alert}
          title={tSeller('page.rejected')}
          description={profile.reviewNote}
        />
      ) : null}
      {profile.status === SELLER_PROFILE_STATUS.SUBMITTED ? (
        <Alert
          type="info"
          showIcon
          className={styles.alert}
          title={tSeller('page.pendingReview')}
        />
      ) : null}
      {profile.status === SELLER_PROFILE_STATUS.VERIFIED ? (
        <Alert type="success" showIcon className={styles.alert} title={tSeller('page.verified')} />
      ) : null}
      {!profile.editable ? (
        <Alert type="info" showIcon className={styles.alert} title={tSeller('page.readOnly')} />
      ) : !canManage ? (
        <Alert type="info" showIcon className={styles.alert} title={t('viewOnly')} />
      ) : null}

      <form onSubmit={onSave} noValidate>
        <fieldset disabled={readOnly || save.isPending} className={styles.fieldset}>
          {/*
            `fieldset[disabled]` khoá ô NATIVE; ô CHỌN của AntD dựng bằng div nên phải nhận `disabled`
            tường minh — không thì hồ sơ đã khoá vẫn đổi được loại chủ thể (và đổi luôn ô CCCD ↔ MST).
          */}
          <SelectField
            control={control}
            name="entityType"
            label={t('entityType')}
            disabled={readOnly || save.isPending}
            required
            options={SELLER_ENTITY_TYPE_VALUES.map((value) => ({
              value,
              label: domainLabel('sellerEntityType', value),
            }))}
            help={t('entityHint')}
          />

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

        {!readOnly ? (
          <div className={styles.actions}>
            {/* Chưa sửa gì thì không có gì để huỷ — nút không tồn tại, chứ không phải mờ đi. */}
            {dirty ? (
              <Button onClick={() => reset()} disabled={save.isPending}>
                {tCommon('actions.cancel')}
              </Button>
            ) : null}
            <Button type="primary" htmlType="submit" loading={save.isPending} disabled={!dirty}>
              {t('save')}
            </Button>
          </div>
        ) : null}
      </form>
    </SectionCard>
  );
}
