'use client';

import { useTranslations } from 'next-intl';

import { useAppFormat } from '@/i18n/use-app-format';
import type { ExcessMileageSuggestion } from '../types';

import styles from './ExcessMileageFacts.module.css';

/**
 * Bảy con số đứng sau đề xuất phí vượt km — **tất cả do SERVER tính**.
 *
 * Không một phép nhân/trừ nào ở đây: `actualKm`, `allowedKm`, `excessKm` và `amount` đều đọc
 * thẳng từ `settlement.excessMileage`. Trình duyệt tính lại công thức tiền là cách chắc chắn
 * nhất để hai nơi lệch nhau, và bên lệch sẽ là bên khách nhìn thấy.
 *
 * Hai chỉ số đồng hồ hiện ở dạng THÔ chứ không chỉ hiệu của chúng: chủ xe phải đối chiếu được
 * với biên bản bàn giao trước khi trừ tiền khách.
 *
 * Thiếu dữ kiện (chưa đặt hạn mức, thiếu một đầu đồng hồ, hoặc số lúc trả nhỏ hơn lúc giao) thì
 * nói THẲNG là chưa đủ dữ liệu — không dựng một số 0 trông như "khách chạy trong hạn mức".
 */
/**
 * VÌ SAO chưa đề xuất được — bốn ngả, bốn câu. Gộp lại là nói sai với ít nhất một ngả.
 *
 * Thứ tự quan trọng: "không có hạn mức" phải kiểm TRƯỚC, vì ba ngả còn lại đều giả định chuyến
 * này có hạn mức. Và `chargedDays === 0` (đơn dài hạn, hoặc snapshot cũ không ghi số ngày) là
 * một ngả riêng: chuyến CÓ hạn mức nhưng không có số ngày để nhân ra nó.
 */
function unavailableReason(
  s: ExcessMileageSuggestion,
): 'noPolicy' | 'noChargedDays' | 'odometerReversed' | 'missingOdometer' {
  if (s.includedKmPerDay == null) return 'noPolicy';
  if (s.chargedDays <= 0) return 'noChargedDays';
  if (
    s.pickupOdometerKm != null &&
    s.returnOdometerKm != null &&
    s.returnOdometerKm < s.pickupOdometerKm
  ) {
    return 'odometerReversed';
  }
  return 'missingOdometer';
}

export function ExcessMileageFacts({ suggestion }: { suggestion: ExcessMileageSuggestion }) {
  const t = useTranslations('Bookings.settlement.excessMileage');
  const fmt = useAppFormat();

  if (!suggestion.available) {
    return <p className={styles.note}>{t(unavailableReason(suggestion))}</p>;
  }

  const excess = suggestion.excessKm > 0;

  return (
    <>
      <dl className={styles.facts}>
        <div className={styles.row}>
          <dt>{t('pickupOdometer')}</dt>
          <dd>{fmt.km(suggestion.pickupOdometerKm)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('returnOdometer')}</dt>
          <dd>{fmt.km(suggestion.returnOdometerKm)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('actual')}</dt>
          <dd>{fmt.km(suggestion.actualKm)}</dd>
        </div>
        <div className={styles.row}>
          <dt>{t('allowed')}</dt>
          {/* Hạn mức nói rõ nó từ đâu ra: số ngày TÍNH PHÍ × km mỗi ngày, cả hai của server. */}
          <dd>
            {t('allowedValue', {
              total: fmt.km(suggestion.allowedKm),
              days: suggestion.chargedDays,
              perDay: fmt.km(suggestion.includedKmPerDay),
            })}
          </dd>
        </div>
        <div className={styles.row}>
          <dt>{t('feePerKm')}</dt>
          <dd>{fmt.money(suggestion.feePerKm ?? '0')}</dd>
        </div>
        <div className={`${styles.row} ${styles.rowWide}`}>
          <dt>{t('excess')}</dt>
          <dd className={excess ? styles.excess : undefined}>{fmt.km(suggestion.excessKm)}</dd>
        </div>
        {/*
          Dòng tiền chỉ xuất hiện khi CÓ km vượt. Một dòng "Phụ phí đề xuất: 0đ" đọc như một
          khoản đang chờ ghi, trong khi thứ cần nói là chuyến này không phát sinh gì.
        */}
        {excess ? (
          <div className={`${styles.row} ${styles.rowWide}`}>
            <dt>{t('suggestedAmount')}</dt>
            <dd className={styles.excess}>{fmt.money(suggestion.amount ?? '0')}</dd>
          </div>
        ) : null}
      </dl>
      {excess ? null : <p className={styles.note}>{t('withinLimit')}</p>}
    </>
  );
}
