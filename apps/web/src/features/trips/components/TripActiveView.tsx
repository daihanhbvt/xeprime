'use client';

import { CarFilled, ClockCircleOutlined } from '@ant-design/icons';
import { Alert } from 'antd';
import { useTranslations } from 'next-intl';
import {
  DEPOSIT_COLLECTION_MODE,
  customerTripTimeline,
  type CustomerTripStage,
} from '@xeprime/types';
import { ROUTES } from '@/constants/routes';
import { InsuranceCoverageList } from '@/features/insurance/components/InsuranceCoverageList';
import { TripGatewayReturn } from '@/features/payment-gateway/components/TripGatewayReturn';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { dayjs } from '@/lib/datetime';
import type { CustomerTripDetail } from '../types';
import { CustomerTripTimeline } from './CustomerTripTimeline';
import { TripActualJourney, TripSupportCard } from './TripClosedView';
import { TripDriverCard } from './TripDriverCard';
import { TripEstimateCard } from './TripEstimateCard';
import { TripFinanceCard } from './TripFinanceCard';
import { TripHoldPanel } from './TripHoldPanel';
import { TripNotReceivedReport } from './TripNotReceivedReport';
import { TripOwnerActions } from './TripOwnerActions';
import { TripPageHeader } from './TripPageHeader';
import {
  TripColumns,
  TripRequestRenterCard,
  TripRequestStatusCard,
  TripRequestTripCard,
  useTripRequestData,
} from './TripRequestLayout';
import { TripReviewCard } from './TripReviewCard';
import layout from './TripRequestLayout.module.css';
import styles from './TripActiveView.module.css';

/**
 * Chuyến của KHÁCH đang thuê (chặng `active`) — CHƯA có bản vẽ riêng: dựng trên cùng khung hai cột và
 * cùng các thẻ của màn đã xác nhận (Figma `21621:66493`) và đã khép (`21621:68041`), để mọi chặng
 * phía khách đọc như một màn.
 *
 *  - TRÁI: thẻ trạng thái "Hành trình đang diễn ra" (giờ trả xe dự kiến) · thông tin chuyến (biển số,
 *    lối liên hệ chủ xe theo `canContact`) · tài xế · hành trình thực tế + biên bản nhận xe · bảo
 *    hiểm · người thuê.
 *  - PHẢI: khiếu nại còn mở · khoản giữ chỗ (kết cục / hoàn tiền) · chi phí · cần hỗ trợ.
 *
 * Nội dung và luật giữ nguyên bố cục cũ của chặng này — chỉ đổi cách trình bày:
 *  - Đơn `active` KHÔNG huỷ được (ADR 0045 điều 1 — `canCustomerCancelTrip` không gồm chặng này): kết
 *    thúc sớm là bàn giao trả xe rồi quyết toán, nên không có nút huỷ và không có khối chính sách huỷ.
 *  - Số tiền là số ĐÃ ĐÓNG BĂNG của đơn (ADR 0024) — `TripFinanceCard`; thiếu đơn thì báo giá.
 *  - Đơn thu cọc trực tiếp (không qua khoản giữ chỗ) vẫn được nói rõ giới hạn bảo vệ (ADR 0028 điều 9).
 */
export function TripActiveView({ trip, backHref }: { trip: CustomerTripDetail; backHref: string }) {
  const t = useTranslations('Trips.detail');
  const tHeader = useTranslations('Trips.pageHeader');
  const tSubtitle = useTranslations('Trips.subtitle');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const data = useTripRequestData(trip);
  const timeline = customerTripTimeline(trip.stage as CustomerTripStage);

  return (
    <TripColumns
      header={
        <TripPageHeader
          home={false}
          backHref={backHref}
          backLabel={t('back')}
          crumbs={[
            { key: 'account', label: tHeader('account'), href: ROUTES.ACCOUNT.ROOT },
            { key: 'trips', label: tHeader('trips'), href: backHref },
            { key: 'detail', label: tHeader('tripDetail') },
          ]}
          title={trip.code ? t('headingWithCode', { code: trip.code }) : t('heading')}
          description={tSubtitle('active')}
          aside={
            timeline.visible ? (
              <CustomerTripTimeline
                confirmedDone={timeline.confirmedDone}
                completedDone={timeline.completedDone}
              />
            ) : null
          }
        />
      }
      lead={
        <TripRequestStatusCard
          variant="active"
          badge={<CarFilled />}
          tag={dl('customerTripStage', trip.stage)}
          tone="info"
          title={t('activeTitle')}
          body={t('activeNote')}
        >
          {trip.returnAt ? (
            <p className={styles.returnAt}>
              <ClockCircleOutlined aria-hidden="true" className={styles.returnIcon} />
              <span>
                {t('activeReturn')}{' '}
                <b className={styles.returnValue}>{fmt.rentalPoint(dayjs(trip.returnAt))}</b>
              </span>
            </p>
          ) : null}
        </TripRequestStatusCard>
      }
      main={
        <>
          <TripRequestTripCard
            trip={trip}
            data={data}
            ownerAction={<TripOwnerActions trip={trip} />}
          />

          {/* Người lái của chuyến có tài xế (ADR 0067). Chuyến khác: khối im lặng. */}
          <TripDriverCard trip={trip} />

          <TripActualJourney trip={trip} />

          {/* Bảo hiểm theo từng sản phẩm khách đã trả (ADR 0064) — rỗng thì không vẽ gì. */}
          <InsuranceCoverageList coverage={trip.insuranceCoverage ?? []} className={layout.card} />

          <TripRequestRenterCard trip={trip} />
        </>
      }
      priority={
        <>
          {/* Khiếu nại "chưa nhận được xe" còn mở (ADR 0066) — ngoài ca đó khối tự im lặng. */}
          <TripNotReceivedReport trip={trip} />

          {/* Quay về từ MoMo/VNPAY bằng liên kết CŨ (ADR 0058) — không có tham số thì im lặng. */}
          <TripGatewayReturn tripId={trip.id} />

          {/* Khoản giữ chỗ: kết cục hoặc khoản hoàn — `TripHoldPanel` tự quyết vẽ gì. */}
          {trip.hold ? (
            <section className={layout.card}>
              <TripHoldPanel
                hold={trip.hold}
                tripId={trip.id}
                tripTotalAmount={trip.estimate?.fees?.customerTotalAmount ?? null}
                payAtHandoverAmount={trip.estimate?.fees?.payAtPickupAmount ?? null}
              />
            </section>
          ) : null}

          {trip.depositCollectionMode === DEPOSIT_COLLECTION_MODE.DIRECT ? (
            <Alert
              type="info"
              showIcon
              title={t('directDeposit.title')}
              description={t('directDeposit.body')}
            />
          ) : null}

          {/* Server chỉ bật `canReview` cho chuyến hoàn thành — ở đây khối thường im lặng. */}
          <TripReviewCard trip={trip} />
        </>
      }
      aside={
        <>
          {trip.finance ? (
            <TripFinanceCard finance={trip.finance} closed={false} />
          ) : trip.estimate ? (
            <TripEstimateCard
              estimate={trip.estimate}
              isHost={false}
              settled={trip.hold?.paidAt != null}
            />
          ) : (
            <section className={layout.card}>
              <h2 className={layout.cardTitle}>{t('priceBlock')}</h2>
              <p className={layout.cardLead}>{t('priceEmpty')}</p>
            </section>
          )}

          <TripSupportCard trip={trip} />
        </>
      }
    />
  );
}
