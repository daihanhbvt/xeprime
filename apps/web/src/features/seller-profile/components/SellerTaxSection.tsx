'use client';

import { Alert, Button, Skeleton } from 'antd';
import { useTranslations } from 'next-intl';
import {
  SELLER_PROFILE_STATUS,
  SELLER_PROFILE_STATUS_META,
  type SellerProfileStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { SectionCard } from '@/components/layout/SectionCard';

import { useSellerProfile } from '../hooks/use-seller-profile';
import { useSellerTaxForm } from '../hooks/use-seller-tax-form';
import { SellerTaxFields } from './SellerTaxFields';
import styles from './SellerTaxSection.module.css';

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

  const profileQuery = useSellerProfile();
  const profile = profileQuery.data;
  const { form, isIndividual, readOnly, dirty, saving, submit } = useSellerTaxForm(profile);

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

  const onSave = submit();

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
      ) : readOnly ? (
        <Alert type="info" showIcon className={styles.alert} title={t('viewOnly')} />
      ) : null}

      <form onSubmit={onSave} noValidate>
        <fieldset disabled={readOnly || saving} className={styles.fieldset}>
          <SellerTaxFields
            control={form.control}
            isIndividual={isIndividual}
            disabled={readOnly || saving}
          />
        </fieldset>

        {!readOnly ? (
          <div className={styles.actions}>
            {/* Chưa sửa gì thì không có gì để huỷ — nút không tồn tại, chứ không phải mờ đi. */}
            {dirty ? (
              <Button onClick={() => form.reset()} disabled={saving}>
                {tCommon('actions.cancel')}
              </Button>
            ) : null}
            <Button type="primary" htmlType="submit" loading={saving} disabled={!dirty}>
              {t('save')}
            </Button>
          </div>
        ) : null}
      </form>
    </SectionCard>
  );
}
