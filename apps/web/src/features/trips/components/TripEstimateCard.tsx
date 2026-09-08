'use client';

import { useTranslations } from 'next-intl';

import { PriceBreakdown } from '@/components/data-display/PriceBreakdown';
import { useAppFormat } from '@/i18n/use-app-format';

import type { CustomerTripEstimate } from '../types';
import styles from './TripEstimateCard.module.css';

/**
 * Bảng kê giá của một chuyến CHƯA được duyệt.
 *
 * Dùng lại `PriceBreakdown` — chính component vẽ báo giá lúc đặt xe và snapshot trên đơn — nên
 * khách thấy đúng những dòng họ đã đọc trước khi bấm gửi, không phải một bảng thứ hai trông
 * gần giống. Mọi con số đến từ server; ở đây không cộng trừ gì.
 *
 * **Hai mức chi tiết, theo vai:**
 *  - *Khách* dừng ở "Tổng bạn trả" — thứ họ cần biết là phải chuẩn bị bao nhiêu tiền.
 *  - *Chủ xe* thấy thêm **số thực nhận**, vì tổng khách trả KHÔNG phải doanh thu của họ: phụ
 *    phí chuyến nằm ở phía khách và thuộc về XePrime, ngân sách hoặc hãng bảo hiểm (ADR 0029
 *    điều 1). Không nói rõ thì chủ xe đọc tổng của khách thành tiền mình sắp nhận.
 *
 * Nhãn "tạm tính" không phải chú thích cho đẹp: bảng này tính theo chính sách ĐANG hiệu lực,
 * còn số chốt chỉ sinh ra lúc duyệt (ADR 0024).
 */
export function TripEstimateCard({
  estimate,
  isHost,
}: {
  estimate: CustomerTripEstimate;
  isHost: boolean;
}) {
  const t = useTranslations('Trips.estimate');
  const fmt = useAppFormat();

  return (
    <PriceBreakdown
      title={t('title')}
      badge={t('badge')}
      rows={estimate.rows}
      totalAmount={estimate.rentalTotal}
      totalLabel={t('rentalTotal')}
      depositAmount={estimate.depositAmount}
      fees={estimate.fees}
      footer={
        <div className={styles.footer}>
          {/*
            Chỉ chủ xe: tổng khách trả không phải doanh thu của họ. `ownerNetAmount` do server
            tính theo đúng công thức của ADR 0029 — client không tự trừ ra.
          */}
          {isHost && estimate.fees ? (
            <p className={styles.net}>
              <span className={styles.netLabel}>{t('ownerNet')}</span>
              <span className={styles.netValue}>{fmt.money(estimate.fees.ownerNetAmount)}</span>
            </p>
          ) : null}
          <p className={styles.note}>{isHost ? t('noteHost') : t('noteRenter')}</p>
        </div>
      }
    />
  );
}
