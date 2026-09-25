'use client';

import { FileProtectOutlined, FileTextOutlined, TransactionOutlined } from '@ant-design/icons';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import type { AdminBookingDetail } from '../../types';
import styles from './BookingDetail.module.css';

/**
 * "Hồ sơ & giao dịch" — số giao dịch, phiếu thu/chi, hợp đồng của đơn + ai tạo, khi nào sửa.
 *
 * Các ô CHỈ là số liệu, không bấm được: phiếu thu/chi, giao dịch và hợp đồng đều nằm sau route
 * phạm vi GIAN HÀNG (`/manage/receipts`, `/manage/contracts/:id` — API chặn theo tenant), admin
 * nền tảng mở ra sẽ nhận 403. Không có chevron cũng vì thế: mũi tên là lời hứa có chỗ để đi.
 */
export function BookingDocuments({ booking }: { booking: AdminBookingDetail }) {
  const t = useTranslations('AdminBookings.documents');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const titleId = useId();

  const items = [
    {
      key: 'payments',
      icon: <TransactionOutlined />,
      label: t('payments', { count: booking.paymentCount }),
    },
    {
      key: 'receipts',
      icon: <FileTextOutlined />,
      label: t('receipts', { count: booking.receiptCount }),
    },
    // Một đơn có tối đa MỘT hợp đồng (quan hệ 1–1), nên đếm 0/1 là số thật.
    {
      key: 'contracts',
      icon: <FileProtectOutlined />,
      label: t('contracts', { count: booking.hasContract ? 1 : 0 }),
    },
  ];

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.sectionTitle}>
        {t('title')}
      </h3>
      <ul className={styles.docs}>
        {items.map((item) => (
          <li key={item.key} className={styles.doc}>
            <span className={styles.docIcon} aria-hidden="true">
              {item.icon}
            </span>
            <span>{item.label}</span>
          </li>
        ))}
      </ul>
      <div className={styles.audit}>
        <span>
          {t('createdBy', { name: booking.createdByName ?? tCommon('labels.emptyValue') })}
        </span>
        <span>{t('updatedAt', { dateTime: fmt.dateTime(booking.updatedAt) })}</span>
      </div>
    </section>
  );
}
