'use client';

import { CheckOutlined, RightOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { SERVICE_TYPE } from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import type { PublicListingDetail } from '../types';
import styles from './ListingBenefitsCard.module.css';

/**
 * Thẻ "Tự nhận xe" cột phải theo chuẩn Figma v2 (node 19707:83510):
 * - Viền vàng ấm, bo góc 16px
 * - 3 cam kết tự nhận xe kèm icon check xanh mint
 * - Link "Cách thức hoạt động >"
 *
 * Mobile (Figma `19771:72529`): lối "Cách thức hoạt động" lên cùng hàng với tiêu đề — chỉ CSS.
 *
 * Mỗi cam kết chỉ hiện khi nó ĐÚNG với chiếc xe này, ở dịch vụ đang xem — bản vẽ in cả ba cho mọi
 * xe, nhưng "không cần chờ chủ xe duyệt" là sai với xe không bật "Đặt ngay" (ADR 0044: gửi yêu cầu
 * → chủ xe duyệt), và "gói theo giờ" là sai với xe không có giá giờ. Không còn cam kết nào ⇒ không
 * vẽ thẻ. Chỉ thuộc về TỰ LÁI — xe có tài xế hay thuê dài hạn không có chuyện "tự nhận xe".
 */
export function ListingBenefitsCard({
  listing,
  activeService,
}: {
  listing: Pick<PublicListingDetail, 'hourlyPrice' | 'instantBookServiceTypes'>;
  activeService: string;
}) {
  const t = useTranslations('Listings.detail.benefits');
  if (activeService !== SERVICE_TYPE.SELF_DRIVE) return null;

  const keys = [
    ...(listing.hourlyPrice ? (['hourly'] as const) : []),
    ...((listing.instantBookServiceTypes ?? []).includes(SERVICE_TYPE.SELF_DRIVE)
      ? (['noWait'] as const)
      : []),
  ];
  if (keys.length === 0) return null;

  return (
    <div className={styles.card}>
      <h3 className={styles.title}>{t('title')}</h3>
      <ul className={styles.list}>
        {keys.map((key) => (
          <li key={key} className={styles.item}>
            <span className={styles.checkIconWrap} aria-hidden="true">
              <CheckOutlined className={styles.checkIcon} />
            </span>
            <span>{t(`items.${key}`)}</span>
          </li>
        ))}
      </ul>
      <Link href={ROUTES.ABOUT} className={styles.link}>
        <span>{t('howItWorks')}</span>
        <RightOutlined className={styles.arrowIcon} aria-hidden="true" />
      </Link>
    </div>
  );
}
