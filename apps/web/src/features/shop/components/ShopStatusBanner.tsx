'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Alert, Button } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SHOP_VERIFICATION, TENANT_STATUS, type TenantStatus } from '@xeprime/types';
import { useWorkspace } from '@/hooks/use-workspace';
import { useAppFormat } from '@/i18n/use-app-format';
import { shopStatusNotice, shopVerificationNotice } from '../status-notice';
import type { MyShop } from '../types';
import styles from './ShopStatusBanner.module.css';

interface ShopStatusBannerProps {
  shop: MyShop;
  /** Quyền `tenant.submit_review`. Nút gửi xác minh là hành động ĐỔI TRẠNG THÁI, không phải "lưu". */
  canSubmit: boolean;
  submitting: boolean;
  onSubmit: () => void;
}

/**
 * Một dải trạng thái duy nhất thay cho thẻ "trạng thái + nhãn + alert" cũ.
 *
 * Nhãn trạng thái đã nằm cạnh tên gian hàng ở tiêu đề trang, nên lặp lại nó ở đây chỉ tốn chỗ.
 * Thứ dải này phải nói là điều người dùng chưa biết: hồ sơ đang ở đâu, lý do bị trả về, và bước
 * tiếp theo bấm vào đâu.
 *
 * ## Hai trục, và trục nào thắng (ADR 0036)
 *
 * Gian hàng bị KHOÁ hoặc hết hạn là tin quan trọng hơn mọi thứ khác — xe đang biến mất khỏi chợ
 * ngay lúc này — nên `tenants.status` được nói trước. Khi gian hàng đang hoạt động bình thường
 * (trường hợp của gần như tất cả mọi người), dải chuyển sang nói về XÁC MINH: thứ duy nhất còn
 * chưa xong trên màn hình này, và là điều kiện để mua gói thuê bao.
 *
 * Điều dải này tuyệt đối KHÔNG được nói nữa: "xe chỉ lên chợ sau khi hồ sơ được duyệt". Câu đó
 * đúng trước ADR 0036 và sai sau nó — tuyến hoa hồng đăng xe thẳng qua cổng duyệt XE.
 */
export function ShopStatusBanner({ shop, canSubmit, submitting, onSubmit }: ShopStatusBannerProps) {
  const t = useTranslations('Shop');
  const fmt = useAppFormat();
  const { paths } = useWorkspace();

  const status = shop.status as TenantStatus;
  const approval = shop.latestApproval;

  /*
   * Gian hàng không ở trạng thái vận hành bình thường: nói CHUYỆN ĐÓ. Nhánh này còn bắt cả dữ
   * liệu cũ (`draft`/`pending_review` chưa qua backfill) — với chúng, câu chữ theo trạng thái vẫn
   * là câu đúng.
   */
  if (status !== TENANT_STATUS.ACTIVE) {
    const notice = shopStatusNotice(shop.status);
    return (
      <Alert
        className={styles.banner}
        type={notice.tone}
        showIcon
        title={t(`status.${notice.key}.title`)}
        description={t(`status.${notice.key}.body`)}
      />
    );
  }

  const notice = shopVerificationNotice(shop.verification);

  /**
   * Phần mô tả ghép từ hai nguồn: câu hướng dẫn cố định của trạng thái, cộng thêm thông tin CHỈ
   * lần gửi này mới có — thời điểm đã gửi, hoặc nguyên văn lý do đội duyệt viết. Lý do là thứ
   * quan trọng nhất trên màn hình khi hồ sơ bị trả về, nên nó không bao giờ bị nuốt mất.
   */
  const extra =
    notice.key === 'pending' && approval
      ? t('verification.pending.submittedAt', { at: fmt.dateTime(approval.submittedAt) })
      : notice.useReason && approval?.reason
        ? t('status.reason', { reason: approval.reason })
        : null;

  return (
    <Alert
      className={styles.banner}
      type={notice.tone}
      showIcon
      title={t(`verification.${notice.key}.title`)}
      description={
        <>
          <span>{t(`verification.${notice.key}.body`)}</span>
          {extra ? <span className={styles.extra}>{extra}</span> : null}
        </>
      }
      action={
        notice.canSubmit && canSubmit ? (
          <Button type="primary" loading={submitting} onClick={onSubmit}>
            {shop.verification === SHOP_VERIFICATION.UNVERIFIED
              ? t('verification.submit')
              : t('verification.resubmit')}
          </Button>
        ) : (
          /*
           * Không có gì để gửi ở đây thì việc hữu ích duy nhất là đăng xe — và đó cũng là vòng
           * duyệt DUY NHẤT của tuyến hoa hồng, nên nút này không phải một lối rẽ phụ.
           */
          <Link href={paths.vehicleNew}>
            <Button icon={<PlusOutlined />}>{t('status.action.addVehicle')}</Button>
          </Link>
        )
      }
    />
  );
}
