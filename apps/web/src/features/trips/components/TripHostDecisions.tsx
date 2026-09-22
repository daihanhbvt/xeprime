'use client';

import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import { canHostCancelTrip } from '@xeprime/types';

import { useBookingRequestDecisions } from '@/features/booking-requests/hooks/use-booking-request-decisions';

import { tripToDecisionTarget } from '../decision-target';
import type { CustomerTripDetail } from '../types';
import styles from './TripDetailView.module.css';

/**
 * Quyết định của CHỦ XE trên một chuyến chưa thành đơn, ở màn chi tiết chuyến.
 *
 * Là component RIÊNG chứ không phải một nhánh `if` trong `TripDetailView`: nó cầm ba mutation
 * và năm hộp thoại, mà hook thì không gọi có điều kiện được. Để trong màn cha nghĩa là mọi
 * người xem — kể cả khách đang mở chuyến mình đi thuê — đều phải dựng cả cụm đó.
 *
 * ## HAI chặng, hai bộ nút hoàn toàn khác nhau
 *
 * Trước ADR 0045, màn này hỏi `respondBy != null` rồi bày "Duyệt"/"Từ chối". Từ ADR 0044,
 * `respondBy` vẫn còn nguyên SAU khi chủ xe đã nhận chuyến — nên chính họ nhìn thấy nút
 * "Duyệt" cho một chuyến mình duyệt rồi, và bấm vào chỉ nhận một lỗi khó hiểu từ server.
 *
 * Chặng mới đọc từ `stage`, thứ nói đúng bóng đang ở chân ai:
 *
 *   · `pending_approval` (+ `pending_approval_paid` LEGACY ADR 0039) — chủ xe còn phải quyết:
 *     **Duyệt** hoặc **Từ chối**;
 *   · `awaiting_hold` — đã nhận, bóng ở chân khách. Việc chính là ĐỢI, và lối duy nhất còn lại
 *     là **Huỷ chuyến** (ADR 0045 điều 1).
 *
 * Không kiểm permission ở đây: `role = host` chỉ do server đặt cho **chủ** gian hàng sở hữu xe
 * của chuyến (xem `CustomerTripsService.resolveScope`), và vai đó có sẵn toàn bộ quyền tenant.
 * Cửa chặn thật vẫn là guard của `POST /booking-requests/:id/approve` và `/cancel`.
 */
export function TripHostDecisions({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.host');
  const decisions = useBookingRequestDecisions();
  const target = tripToDecisionTarget(trip);
  const accepted = canHostCancelTrip(trip.stage);

  return (
    <section className={styles.support}>
      <h2 className={styles.supportTitle}>
        {accepted ? t('acceptedTitle') : t('decisionTitle')}
      </h2>
      <p className={styles.hostHint}>{accepted ? t('acceptedHint') : t('decisionHint')}</p>
      {accepted ? (
        <Button block danger onClick={() => decisions.openCancel(target)}>
          {t('cancel')}
        </Button>
      ) : (
        <>
          <Button type="primary" size="large" block onClick={() => decisions.openApprove(target)}>
            {t('approve')}
          </Button>
          <Button block danger onClick={() => decisions.openReject(target)}>
            {t('reject')}
          </Button>
        </>
      )}
      {decisions.dialogs}
    </section>
  );
}
