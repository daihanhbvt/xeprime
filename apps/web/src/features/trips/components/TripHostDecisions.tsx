'use client';

import { Button } from 'antd';
import { useTranslations } from 'next-intl';

import { useBookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';

import { tripToDecisionTarget } from '../decision-target';
import type { CustomerTripDetail } from '../types';
import styles from './TripDetailView.module.css';

/**
 * Hai quyết định của CHỦ XE trên một yêu cầu còn chờ, ở màn chi tiết chuyến.
 *
 * Là component RIÊNG chứ không phải một nhánh `if` trong `TripDetailView`: nó cầm hai mutation
 * và bốn hộp thoại, mà hook thì không gọi có điều kiện được. Để trong màn cha nghĩa là mọi
 * người xem — kể cả khách đang mở chuyến mình đi thuê — đều phải dựng cả cụm đó.
 *
 * Không kiểm permission ở đây: `role = host` chỉ do server đặt cho **chủ** gian hàng sở hữu xe
 * của chuyến (xem `CustomerTripsService.resolveScope`), và vai đó có sẵn toàn bộ quyền tenant.
 * Cửa chặn thật vẫn là guard của `POST /booking-requests/:id/approve`.
 */
export function TripHostDecisions({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.host');
  const decisions = useBookingRequestDecisions();
  const target = tripToDecisionTarget(trip);

  return (
    <section className={styles.support}>
      <h2 className={styles.supportTitle}>{t('decisionTitle')}</h2>
      <p className={styles.hostHint}>{t('decisionHint')}</p>
      <Button type="primary" size="large" block onClick={() => decisions.openApprove(target)}>
        {t('approve')}
      </Button>
      <Button block danger onClick={() => decisions.openReject(target)}>
        {t('reject')}
      </Button>
      {decisions.dialogs}
    </section>
  );
}
