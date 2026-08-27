'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { TENANT_STATUS, TENANT_STATUS_SUBMITTABLE, type TenantStatus } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { shopStatusNotice } from '../status-notice';
import type { MyShop } from '../types';
import styles from './ShopStatusBanner.module.css';

interface ShopStatusBannerProps {
  shop: MyShop;
  /** Quyền `tenant.submit_review`. Nút gửi duyệt là hành động ĐỔI TRẠNG THÁI, không phải "lưu". */
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}

/**
 * Một dải trạng thái duy nhất thay cho thẻ "trạng thái + nhãn + alert" cũ.
 *
 * Nhãn trạng thái đã nằm cạnh tên gian hàng ở tiêu đề trang, nên lặp lại nó ở đây chỉ tốn chỗ.
 * Thứ dải này phải nói là điều người dùng chưa biết: hồ sơ đang ở đâu trong quy trình duyệt, lý
 * do bị trả về, và bước tiếp theo bấm vào đâu.
 *
 * Nội dung lấy từ `shopStatusNotice` — cùng bảng mà dải ở khung quản lý dùng. Trước đây hai chỗ
 * tự dựng câu chữ riêng và đã nói ngược nhau ngay trên cùng một màn hình.
 */
export function ShopStatusBanner({ shop, canSubmit, submitting, onSubmit }: ShopStatusBannerProps) {
  const t = useTranslations('Shop');
  const fmt = useAppFormat();

  const status = shop.status as TenantStatus;
  const notice = shopStatusNotice(shop.status);
  const approval = shop.latestApproval;
  const submittable = TENANT_STATUS_SUBMITTABLE.includes(status);

  /**
   * Phần mô tả ghép từ hai nguồn: câu hướng dẫn cố định của trạng thái, cộng thêm thông tin CHỈ
   * lần gửi này mới có — thời điểm đã gửi, hoặc nguyên văn lý do đội duyệt viết. Lý do là thứ
   * quan trọng nhất trên màn hình khi hồ sơ bị trả về, nên nó không bao giờ bị nuốt mất.
   */
  const extra =
    status === TENANT_STATUS.PENDING_REVIEW && approval
      ? t('status.pending.submittedAt', { at: fmt.dateTime(approval.submittedAt) })
      : (status === TENANT_STATUS.NEEDS_REVISION || status === TENANT_STATUS.REJECTED) &&
          approval?.reason
        ? t('status.reason', { reason: approval.reason })
        : null;

  return (
    <Alert
      className={styles.banner}
      type={notice.tone}
      showIcon
      title={t(`status.${notice.key}.title`)}
      description={
        <>
          <span>{t(`status.${notice.key}.body`)}</span>
          {extra ? <span className={styles.extra}>{extra}</span> : null}
        </>
      }
      action={
        submittable && canSubmit ? (
          <Button type="primary" loading={submitting} onClick={onSubmit}>
            {status === TENANT_STATUS.DRAFT ? t('status.submit') : t('status.resubmit')}
          </Button>
        ) : status === TENANT_STATUS.PENDING_REVIEW ? (
          /*
           * Chờ duyệt là lúc DUY NHẤT dải này có việc hữu ích để đề nghị: xe khai báo được ngay
           * từ bây giờ (chỉ không lên marketplace), nên hồ sơ duyệt xong là bán được luôn thay
           * vì mới bắt đầu nhập xe.
           */
          <Link href={ROUTES.MANAGE.VEHICLE_NEW}>
            <Button icon={<PlusOutlined />}>{t('status.action.addVehicle')}</Button>
          </Link>
        ) : null
      }
    />
  );
}
