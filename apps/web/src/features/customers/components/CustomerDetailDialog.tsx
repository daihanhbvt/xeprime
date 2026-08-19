'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { customerPath } from '@/constants/routes';
import { CustomerDetailView } from './CustomerDetailView';
import styles from './CustomerDetailDialog.module.css';

/**
 * Hồ sơ khách dưới dạng MODAL — cùng `CustomerDetailView` (và do đó cùng query, cùng quyền,
 * cùng các tab lịch sử/ghi chú/giấy tờ) với trang `/manage/customers/[id]`.
 *
 * Mở từ hộp thư yêu cầu thuê: xem nhanh "khách này là ai, từng thuê mấy lần, có ghi chú gì"
 * rồi đóng lại và duyệt tiếp — không rời khỏi danh sách đang lọc.
 */
export function CustomerDetailDialog({
  customerId,
  customerName,
  open,
  onClose,
}: {
  customerId: string;
  /** Tên đã có sẵn ở nơi gọi — hiện ngay trên tiêu đề thay vì chờ query xong. */
  customerName?: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Customers');

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      size="xl"
      mobileMode="fullscreen"
      footer={null}
      title={
        <span className={styles.titleRow}>
          <span>{customerName ?? t('detail.title')}</span>
          <Link href={customerPath.detail(customerId)} className={styles.pageLink}>
            {t('detail.openPage')}
          </Link>
        </span>
      }
    >
      <CustomerDetailView customerId={customerId} embedded />
    </ResponsiveDialog>
  );
}
