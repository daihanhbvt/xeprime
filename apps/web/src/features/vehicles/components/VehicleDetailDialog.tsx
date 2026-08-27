'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { vehiclePath } from '@/constants/routes';
import { VehicleDetailContent } from './VehicleDetailContent';
import styles from './VehicleDetailDialog.module.css';

/**
 * Hồ sơ xe dưới dạng MODAL — cùng `VehicleDetailContent` (và do đó cùng query, cùng quyền,
 * cùng hành động) với trang `/manage/vehicles/[id]`.
 *
 * Mở từ hộp thư yêu cầu thuê: người trực đang quét cả danh sách, nhảy sang một route khác là
 * mất chỗ đang đọc cùng bộ lọc và trang hiện tại. "Mở trang đầy đủ" giữ lại lối lấy link chia sẻ.
 */
export function VehicleDetailDialog({
  vehicleId,
  open,
  onClose,
}: {
  vehicleId: string;
  open: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Vehicles');
  const tCommon = useTranslations('Common');

  return (
    <ResponsiveDialog
      open={open}
      onClose={onClose}
      size="xl"
      mobileMode="fullscreen"
      footer={null}
      title={
        <span className={styles.titleRow}>
          <span>{t('detail.title')}</span>
          <Link href={vehiclePath.detail(vehicleId)} className={styles.pageLink}>
            {t('detail.openPage')}
          </Link>
        </span>
      }
    >
      <VehicleDetailContent
        vehicleId={vehicleId}
        notFoundAction={{ label: tCommon('actions.close'), onClick: onClose }}
        onDeleted={onClose}
      />
    </ResponsiveDialog>
  );
}
