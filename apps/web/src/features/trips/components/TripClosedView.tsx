'use client';

import {
  ExclamationCircleFilled,
  MessageOutlined,
} from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { useId, type ReactNode } from 'react';
import {
  CANCELLATION_PARTY,
  CUSTOMER_CANCELLATION_REASON_VALUES,
  CUSTOMER_TRIP_STAGE,
  isCancellationParty,
  isCancellationReasonCategory,
  type CustomerCancellationReason,
  type CustomerTripStage,
} from '@xeprime/types';
import { SUPPORT_HOTLINE } from '@/constants/contact';
import { ROUTES } from '@/constants/routes';
import { InsuranceCoverageList } from '@/features/insurance/components/InsuranceCoverageList';
import { CtaButton } from '@/features/marketplace/components/CtaButton';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { CustomerTripDetail } from '../types';
import { TripDriverCard } from './TripDriverCard';
import { TripEstimateCard } from './TripEstimateCard';
import { TripFinanceCard } from './TripFinanceCard';
import { TripHandoverEvidence } from './TripHandoverEvidence';
import { TripHoldPanel } from './TripHoldPanel';
import { TripNotReceivedReport } from './TripNotReceivedReport';
import { TripOwnerActions } from './TripOwnerActions';
import { CustomerTripTimeline } from './CustomerTripTimeline';
import { TripPageHeader } from './TripPageHeader';
import {
  TripColumns,
  TripRequestRenterCard,
  TripRequestStatusCard,
  TripRequestTripCard,
  useTripRequestData,
  FAILED_STATUS_IMAGE,
  SUCCESS_STATUS_IMAGE,
  type TripRequestTone,
} from './TripRequestLayout';
import { TripReviewCard } from './TripReviewCard';
import layout from './TripRequestLayout.module.css';
import styles from './TripClosedView.module.css';

/** Chặng ĐÃ KHÉP của phía khách — mọi chặng `TripClosedView` vẽ. */
export const CUSTOMER_CLOSED_VIEW_STAGES: readonly CustomerTripStage[] = [
  CUSTOMER_TRIP_STAGE.COMPLETED,
  CUSTOMER_TRIP_STAGE.CANCELLED,
  CUSTOMER_TRIP_STAGE.REJECTED,
  CUSTOMER_TRIP_STAGE.EXPIRED,
  CUSTOMER_TRIP_STAGE.SLOT_TAKEN,
  CUSTOMER_TRIP_STAGE.NO_SHOW,
];

type ClosedTone = 'completed' | 'failed' | 'notice';

/**
 * Kết cục → sắc thái thẻ trạng thái + khoá câu chữ. Bảng tra literal (không ghép chuỗi lúc chạy) để
 * `next-intl` kiểm khoá ở tầng kiểu.
 *
 * Hỏng do một BÊN (huỷ, từ chối, không nhận xe) ⇒ đỏ. Không ai có lỗi (chủ xe không kịp trả lời, khung
 * giờ đã có người) ⇒ vàng — tô đỏ chúng là đổ lỗi cho người không làm gì sai.
 */
const STATUS = {
  [CUSTOMER_TRIP_STAGE.COMPLETED]: {
    tone: 'completed',
    pill: 'success',
    title: 'status.completedTitle',
    body: 'status.completedBody',
  },
  [CUSTOMER_TRIP_STAGE.CANCELLED]: {
    tone: 'failed',
    pill: 'danger',
    title: 'status.cancelledTitle',
    body: 'status.cancelledBody',
  },
  [CUSTOMER_TRIP_STAGE.REJECTED]: {
    tone: 'failed',
    pill: 'danger',
    title: 'status.rejectedTitle',
    body: 'status.rejectedBody',
  },
  [CUSTOMER_TRIP_STAGE.NO_SHOW]: {
    tone: 'failed',
    pill: 'danger',
    title: 'status.noShowTitle',
    body: 'status.noShowBody',
  },
  [CUSTOMER_TRIP_STAGE.EXPIRED]: {
    tone: 'notice',
    pill: 'warning',
    title: 'status.expiredTitle',
    body: 'status.expiredBody',
  },
  [CUSTOMER_TRIP_STAGE.SLOT_TAKEN]: {
    tone: 'notice',
    pill: 'warning',
    title: 'status.slotTakenTitle',
    body: 'status.slotTakenBody',
  },
} as const satisfies Record<
  string,
  { tone: ClosedTone; pill: TripRequestTone; title: string; body: string }
>;

type ClosedStage = keyof typeof STATUS;

/** Minh hoạ của thẻ trạng thái: ảnh Figma cho hoàn tất/hỏng, biểu tượng cho kết cục không ai có lỗi. */
const BADGE: Partial<Record<ClosedTone, ReactNode>> = {
  notice: <ExclamationCircleFilled />,
};
const IMAGE: Partial<Record<ClosedTone, string>> = {
  completed: SUCCESS_STATUS_IMAGE,
  failed: FAILED_STATUS_IMAGE,
};

/**
 * Chi tiết một chuyến ĐÃ KHÉP của khách — hoàn thành (Figma `21621:68041` chưa đánh giá ·
 * `21621:68560` đã đánh giá) và các kết cục hỏng (đã huỷ `21621:67556`; bị từ chối, quá hạn phản
 * hồi, xe đã có khách khác, không nhận xe dùng cùng khuôn). Dựng trên khung hai cột chung
 * (`TripColumns`) với các thẻ của màn chuyến đã xác nhận.
 *
 *  - TRÁI: thẻ trạng thái · thông tin chuyến đi (kèm lối liên hệ chủ xe theo `canContact`) · tài xế ·
 *    hành trình thực tế + biên bản bàn giao · bảo hiểm · người thuê.
 *  - PHẢI: đánh giá (chuyến hoàn thành) · khoản giữ chỗ/hoàn tiền · hoá đơn · cần hỗ trợ.
 *
 * Mọi con số và quyền đều do SERVER quyết: số tiền là số đóng băng của đơn (ADR 0024) hoặc báo giá
 * lúc gửi khi chưa từng có đơn; khoản hoàn và hộp khai tài khoản nhận hoàn là của `TripHoldPanel`.
 *
 * Chuyến huỷ: tiêu đề theo bên huỷ (`cancelledBy`) và dòng "Lý do" đọc `cancelReason` từ sổ huỷ
 * (Figma 21621:31608); yêu cầu rút trước khi chủ xe quyết không có dòng sổ ⇒ không có dòng lý do.
 * Lối "Nhắn tin với tổng đài XePrime" thành liên kết sang trung tâm hỗ trợ — chưa có kênh chat với
 * XePrime.
 */
export function TripClosedView({ trip, backHref }: { trip: CustomerTripDetail; backHref: string }) {
  const t = useTranslations('Trips.closed');
  const tTrips = useTranslations('Trips');
  const tDetail = useTranslations('Trips.detail');
  const tHeader = useTranslations('Trips.pageHeader');
  const tSubtitle = useTranslations('Trips.subtitle');
  const dl = useDomainLabel();
  const data = useTripRequestData(trip);

  const stage = trip.stage as ClosedStage;
  const status = STATUS[stage];
  const completed = stage === CUSTOMER_TRIP_STAGE.COMPLETED;
  // Ai đã huỷ — server suy từ sổ huỷ (ADR 0045), không có thì giữ tiêu đề chung "Chuyến đi đã hủy".
  const cancelledBy =
    stage === CUSTOMER_TRIP_STAGE.CANCELLED && isCancellationParty(trip.cancelledBy)
      ? trip.cancelledBy
      : null;
  const recordedReason = trip.cancelReason?.category;
  const reasonCategory =
    cancelledBy && isCancellationReasonCategory(recordedReason) ? recordedReason : null;
  /*
   * Khách tự huỷ ⇒ nhãn đúng chữ khách đã chọn trong hộp huỷ (Trips.cancel.reasons); phía khác ⇒
   * nhãn chung của nhóm lý do (Domain).
   */
  const reasonLabel = !reasonCategory
    ? null
    : cancelledBy === CANCELLATION_PARTY.CUSTOMER &&
        (CUSTOMER_CANCELLATION_REASON_VALUES as readonly string[]).includes(reasonCategory)
      ? tTrips(`cancel.reasons.${reasonCategory as CustomerCancellationReason}`)
      : dl('cancellationReasonCategory', reasonCategory);

  return (
    <TripColumns
      header={
        <TripPageHeader
          home={false}
          backHref={backHref}
          backLabel={tDetail('back')}
          crumbs={[
            { key: 'account', label: tHeader('account'), href: ROUTES.ACCOUNT.ROOT },
            { key: 'trips', label: tHeader('trips'), href: backHref },
            { key: 'detail', label: tHeader('tripDetail') },
          ]}
          title={
            cancelledBy
              ? t('cancelledHeading')
              : trip.code
                ? tDetail('headingWithCode', { code: trip.code })
                : tDetail('heading')
          }
          description={
            completed
              ? tSubtitle('completed')
              : cancelledBy === CANCELLATION_PARTY.CUSTOMER
                ? t('cancelledByCustomer')
                : cancelledBy
                  ? t('cancelledByOther')
                  : t('subtitle')
          }
          // Đơn HOÀN THÀNH: hai mốc "Đã xác nhận → Hoàn thành" đều tích (người dùng chốt 28/10/2026).
          // Huỷ/từ chối không đi hết đường nên không vẽ mốc nào (`customerTripTimeline`).
          aside={completed ? <CustomerTripTimeline confirmedDone completedDone /> : undefined}
        />
      }
      lead={
        <TripRequestStatusCard
          variant={status.tone}
          badge={BADGE[status.tone]}
          image={IMAGE[status.tone]}
          tag={stage === CUSTOMER_TRIP_STAGE.CANCELLED ? t('status.cancelledTag') : dl('customerTripStage', stage)}
          tone={status.pill}
          title={cancelledBy ? tTrips(`cancelledBy.${cancelledBy}`) : t(status.title)}
          body={
            completed && !trip.canReview && !trip.review
              ? t('status.completedBodyNoReview')
              : t(status.body)
          }
        >
          {/* Lý do do chủ xe tự gõ — giữ nguyên chữ của họ, không dịch. */}
          {stage === CUSTOMER_TRIP_STAGE.REJECTED && trip.rejectReason ? (
            <p className={styles.reason}>
              {t.rich('status.reason', {
                reason: trip.rejectReason,
                b: (chunks) => <b className={styles.reasonValue}>{chunks}</b>,
              })}
            </p>
          ) : null}
          {reasonLabel ? (
            <p className={styles.reason}>
              {t.rich('status.reason', {
                reason: reasonLabel,
                b: (chunks) => <b className={styles.reasonValue}>{chunks}</b>,
              })}
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

          {/* Người đã đến đón — chuyến có tài xế (ADR 0067). Chuyến khác: khối im lặng. */}
          <TripDriverCard trip={trip} />

          <TripActualJourney trip={trip} />

          {/* Bảo hiểm theo từng sản phẩm khách đã trả (ADR 0064) — rỗng thì không vẽ gì. */}
          <InsuranceCoverageList coverage={trip.insuranceCoverage ?? []} className={layout.card} />

          <TripRequestRenterCard trip={trip} />
        </>
      }
      priority={
        <>
          {completed ? <TripReviewCard trip={trip} /> : null}

          {/* Khiếu nại "chưa nhận được xe" còn mở (ADR 0066) — ngoài ca đó khối tự im lặng. */}
          <TripNotReceivedReport trip={trip} />

          {/*
            Khoản giữ chỗ: kết cục (đã chốt / hết hạn / đã hoàn) và — khi XePrime nợ khách một khoản
            hoàn — hộp khai tài khoản nhận hoàn. `TripHoldPanel` tự quyết vẽ gì.
          */}
          {/* Có đơn ⇒ khoản giữ chỗ/hoàn đã GỘP vào hoá đơn dịch vụ bên dưới; thẻ riêng chỉ còn cho
              chuyến chưa từng có đơn (bảng giá là báo giá lúc gửi). */}
          {trip.hold && !trip.finance ? (
            <section className={layout.card}>
              <TripHoldPanel
                hold={trip.hold}
                tripId={trip.id}
                tripTotalAmount={trip.estimate?.fees?.customerTotalAmount ?? null}
                payAtHandoverAmount={trip.estimate?.fees?.payAtPickupAmount ?? null}
              />
            </section>
          ) : null}
        </>
      }
      aside={
        <>
          {/*
            Ba nguồn tiền, loại trừ nhau: có đơn → số ĐÃ ĐÓNG BĂNG (ADR 0024); chưa từng có đơn →
            báo giá lúc gửi; không báo giá được → nói thẳng là chưa có.
          */}
          {trip.finance ? (
            <TripFinanceCard
              finance={trip.finance}
              closed
              settlement={{ hold: trip.hold ?? null, tripId: trip.id, completed }}
            />
          ) : trip.estimate ? (
            <TripEstimateCard
              estimate={trip.estimate}
              isHost={false}
              settled={trip.hold?.paidAt != null}
            />
          ) : (
            <section className={layout.card}>
              <h2 className={layout.cardTitle}>{tDetail('priceBlock')}</h2>
              <p className={layout.cardLead}>{tDetail('priceEmpty')}</p>
            </section>
          )}

          <TripSupportCard trip={trip} />
        </>
      }
    />
  );
}

/**
 * "Cần hỗ trợ?" — Figma `21621:67556` (cột phải, cuối): liên hệ XePrime + hotline. Lối nhắn chủ xe
 * nằm ở hàng chủ xe trong thẻ "Thông tin chuyến đi" (`TripOwnerActions`), không lặp ở đây. Chuyến
 * đang thuê (`TripActiveView`) dùng lại khối này.
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars -- giữ chữ ký cho các màn đang gọi
export function TripSupportCard(_props: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.closed.support');
  const titleId = useId();
  return (
    <section className={layout.policy} aria-labelledby={titleId}>
      <div className={layout.policyCopy}>
        <h2 id={titleId} className={layout.policyTitle}>
          {t('title')}
        </h2>
        <p className={layout.policyBody}>{t('body')}</p>
      </div>
      <CtaButton
        href={ROUTES.SUPPORT}
        variant="neutral"
        size="form"
        block
        iconStart={<MessageOutlined />}
      >
        {t('contactXePrime')}
      </CtaButton>
      <p className={layout.hotline}>
        {t.rich('hotline', {
          phone: SUPPORT_HOTLINE.display,
          tel: (chunks) => (
            <a href={`tel:${SUPPORT_HOTLINE.tel}`} className={layout.hotlineLink}>
              {chunks}
            </a>
          ),
        })}
      </p>
    </section>
  );
}

/**
 * "Hành trình thực tế" + biên bản bàn giao — cùng câu hỏi "chuyến đã diễn ra thế nào", mốc giờ ở
 * trên, biên bản + ảnh + Odo ở dưới. Mốc chỉ có sau bàn giao và chỉ hiện khi thật sự được ghi nhận;
 * biên bản chỉ gọi API khi đã có mốc (mốc do chính lần xác nhận bàn giao ghi, cùng transaction).
 * Dùng chung cho chuyến đang thuê và chuyến đã khép.
 */
export function TripActualJourney({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.detail');
  const fmt = useAppFormat();
  const titleId = useId();
  const hasActual = Boolean(trip.actualPickupAt || trip.actualReturnAt);

  return (
    <>
      {hasActual ? (
        <section className={layout.card} aria-labelledby={titleId}>
          <h2 id={titleId} className={layout.cardTitle}>
            {t('actualBlock')}
          </h2>
          <dl className={styles.facts}>
            {trip.actualPickupAt ? (
              <div className={styles.fact}>
                <dt>{t('actualPickup')}</dt>
                <dd>{fmt.dateTime(trip.actualPickupAt)}</dd>
              </div>
            ) : null}
            {trip.actualReturnAt ? (
              <div className={styles.fact}>
                <dt>{t('actualReturn')}</dt>
                <dd>{fmt.dateTime(trip.actualReturnAt)}</dd>
              </div>
            ) : null}
          </dl>
        </section>
      ) : null}
      <TripHandoverEvidence tripId={trip.id} enabled={hasActual} />
    </>
  );
}
