'use client';

import { useEffect } from 'react';
import type { ServiceType } from '@xeprime/types';

import { RENTAL_TERMS_ANCHOR } from '@/constants/routes';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';

import { AutoAcceptSection } from './AutoAcceptSection';
import { TermsSection } from './TermsSection';
import styles from './BookingTermsSection.module.css';

/**
 * Mục "Nhận chuyến & thủ tục" của MỘT dịch vụ (30/09/2026) — dùng chung cho cổng quản lý và khu
 * tài khoản.
 *
 * Gom hai card mà trước đây là hai mục menu: "Tối ưu nhận chuyến" (công tắc tự nhận) và "Thủ tục
 * cho thuê" (giấy tờ, điều khoản, cọc). Cả hai là luật khách phải qua để có chuyến, và mỗi card
 * vẫn TỰ LƯU bằng mutation của chính nó — gom chỉ đổi chỗ bày.
 *
 * Phiên hỗ trợ (ADR 0050 §13): thủ tục là khu TIỀN (pháp lý + cọc) — không dựng, như trước.
 */
export function BookingTermsSection({ serviceType }: { serviceType: ServiceType }) {
  const moneyHidden = useSupportHides(SUPPORT_HIDDEN_AREA.MONEY_TERMS);

  /*
   * Link cũ tới mục "Thủ tục cho thuê" nay mở mục này kèm `#rental-terms`. Card thủ tục đứng sau
   * card tối ưu và tải dữ liệu riêng, nên trình duyệt không tự cuộn kịp — cuộn một lần khi mở.
   */
  useEffect(() => {
    if (window.location.hash === `#${RENTAL_TERMS_ANCHOR}`) {
      document.getElementById(RENTAL_TERMS_ANCHOR)?.scrollIntoView({ block: 'start' });
    }
  }, []);

  return (
    <div className={styles.stack}>
      <AutoAcceptSection serviceType={serviceType} />
      {moneyHidden ? null : (
        <div id={RENTAL_TERMS_ANCHOR} className={styles.anchor}>
          <TermsSection serviceType={serviceType} />
        </div>
      )}
    </div>
  );
}
