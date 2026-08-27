'use client';

import Link from 'next/link';
import { PERMISSION } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { customerPath } from '@/constants/routes';
import { CustomerDocumentsPanel } from '@/features/customers/components/CustomerDocumentsPanel';
import { usePermissions } from '@/hooks/use-permissions';
import styles from './BookingCustomerDocumentsDialog.module.css';

/**
 * Bổ sung & đối chiếu giấy tờ của khách NGAY trên màn đơn thuê.
 *
 * Dùng lại nguyên `CustomerDocumentsPanel` của sổ khách (props thuần, không dính router) nên
 * quyền, upload R2 riêng tư, hạn giấy tờ và audit đều là MỘT đường — không có bản sao thứ hai
 * của luồng giấy tờ để lệch nhau về sau.
 *
 * Quyền KHÔNG mượn từ đơn: `bookings.update` không đủ để mở kho giấy tờ tuỳ thân của người thứ
 * ba. Gác đúng hai quyền riêng, đối xứng với trang hồ sơ khách.
 */
export function BookingCustomerDocumentsDialog({
  customerId,
  customerName,
  open,
  onClose,
}: {
  customerId: string;
  customerName: string;
  open: boolean;
  onClose: () => void;
}) {
  const { has } = usePermissions();

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      size="lg"
      mobileMode="fullscreen"
      footer={null}
      title={
        <span className={styles.titleRow}>
          <span>Giấy tờ của {customerName}</span>
          <Link href={customerPath.detail(customerId)} className={styles.pageLink}>
            Mở hồ sơ khách
          </Link>
        </span>
      }
    >
      <CustomerDocumentsPanel
        customerId={customerId}
        canManage={has(PERMISSION.CUSTOMER_DOCUMENT_MANAGE)}
        canViewFiles={has(PERMISSION.CUSTOMER_DOCUMENT_FILE_VIEW)}
      />
    </ResponsiveDialog>
  );
}
