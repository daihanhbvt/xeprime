'use client';

import {
  ArrowLeftOutlined,
  ClockCircleOutlined,
  EnvironmentOutlined,
  PhoneOutlined,
  StarOutlined,
} from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  API_ERROR_CODE,
  CUSTOMER_TRIP_STAGE,
  CUSTOMER_TRIP_STAGE_META,
  SERVICE_TYPE,
  canCustomerCancelTrip,
  customerTripTimeline,
  isCustomerTripClosed,
  type CustomerTripStage,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { Stars } from '@/components/data-display/Stars';
import { StatusTag } from '@/components/data-display/StatusTag';
import { EmptyState } from '@/components/feedback/EmptyState';
import { ROUTES, listingPath, shopPath } from '@/constants/routes';
import { useAuthModal, useNextFromCurrentPath } from '@/features/auth/components/AuthModalProvider';
import { AUTH_MODE } from '@/features/auth/post-auth-destination';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { ReviewModal } from '@/features/reviews/components/ReviewModal';
import { dayjs } from '@/lib/datetime';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode, isUnauthenticated } from '@/services/api-client';
import { useTrip } from '../hooks';
import type { CustomerTripDetail } from '../types';
import { CancelTripDialog } from './CancelTripDialog';
import { CustomerTripTimeline } from './CustomerTripTimeline';
import { TripFinanceCard } from './TripFinanceCard';
import { TripHandoverEvidence } from './TripHandoverEvidence';
import styles from './TripDetailView.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useTranslations } from 'next-intl';

/**
 * Chi tiết một chuyến — **một** kiến trúc cho mọi chặng.
 *
 * Không có trang riêng cho `Sẵn sàng` / `Đang thuê` / `Hoàn thành`: cùng bộ khối, khác nhau ở
 * khối nào xuất hiện và nhãn nào hiển thị. Ba trang song song nghĩa là mỗi lần sửa một chi tiết
 * phải sửa ba nơi, và chúng sẽ trôi khỏi nhau.
 *
 * Phân nhánh dựa trên `stage` (view-model từ `@xeprime/types`), không đọc thẳng trạng thái đơn.
 */
export function TripDetailView({ tripId }: { tripId: string }) {
  const t = useTranslations('Trips');
  const dl = useDomainLabel();
  const errorMessage = useErrorMessage();
  const fmt = useAppFormat();

  const router = useRouter();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();
  const { data, isLoading, isError, error, refetch } = useTrip(tripId);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [cancelOpen, setCancelOpen] = useState(false);

  if (isLoading) {
    return (
      <div className={styles.page}>
        <Skeleton active paragraph={{ rows: 2 }} />
        <Skeleton active paragraph={{ rows: 8 }} />
      </div>
    );
  }

  if (isError || !data) {
    if (isUnauthenticated(error)) {
      return (
        <div className={styles.page}>
          <EmptyState
            variant="empty"
            title={t('auth.expiredTitle')}
            description={t('auth.expiredDetail')}
            action={
              <Button
                type="primary"
                onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
              >
                {t('auth.login')}
              </Button>
            }
          />
        </div>
      );
    }

    /*
     * Backend trả 404 cho cả "không tồn tại" lẫn "không phải chuyến của bạn" — cố ý, để không
     * xác nhận sự tồn tại của chuyến người khác. Nên phía này cũng chỉ có MỘT câu, và lối thoát
     * là quay về danh sách chứ không phải bấm thử lại mãi.
     *
     * Nhánh theo MÃ lỗi có cấu trúc, không theo câu tiếng Việt: đổi một chữ trong message ở
     * backend không được phép làm hỏng luồng ở đây.
     */
    const missing = getErrorCode(error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <div className={styles.page}>
        <EmptyState
          variant={missing ? 'empty' : 'error'}
          title={missing ? t('detail.notFoundTitle') : t('detail.errorTitle')}
          description={missing ? t('detail.notFoundBody') : errorMessage(error)}
          action={
            missing ? (
              <Button type="primary" onClick={() => router.push(ROUTES.TRIPS)}>
                {t('detail.backToTrips')}
              </Button>
            ) : (
              <Button type="primary" onClick={() => void refetch()}>
                {t('detail.retry')}
              </Button>
            )
          }
        />
      </div>
    );
  }

  const stage = data.stage as CustomerTripStage;
  const timeline = customerTripTimeline(stage);
  const closed = isCustomerTripClosed(stage);

  return (
    <div className={styles.page}>
      <div className={styles.topBar}>
        <Link href={ROUTES.TRIPS} className={styles.back}>
          <ArrowLeftOutlined aria-hidden="true" /> {t('detail.back')}
        </Link>
        {timeline.visible ? (
          <CustomerTripTimeline
            confirmedDone={timeline.confirmedDone}
            completedDone={timeline.completedDone}
          />
        ) : null}
      </div>

      <header className={styles.header}>
        <div className={styles.headings}>
          <h1 className={styles.heading}>
            {data.code ? t('detail.headingWithCode', { code: data.code }) : t('detail.heading')}
          </h1>
          <p className={styles.sub}>{t(SUBTITLE_KEY[stage])}</p>
        </div>
        <StatusTag value={stage} meta={CUSTOMER_TRIP_STAGE_META} group="customerTripStage" />
      </header>

      <TerminalNotice trip={data} stage={stage} />

      <div className={styles.layout}>
        <div className={styles.main}>
          {stage === CUSTOMER_TRIP_STAGE.ACTIVE ? (
            <section className={styles.highlight}>
              <h2 className={styles.highlightTitle}>{t('detail.activeTitle')}</h2>
              <p className={styles.highlightLead}>
                <ClockCircleOutlined aria-hidden="true" /> {t('detail.activeReturn')}{' '}
                <b>{fmt.rentalPoint(dayjs(data.returnAt))}</b>
              </p>
              <p className={styles.highlightNote}>{t('detail.activeNote')}</p>
            </section>
          ) : null}

          <section className={styles.block}>
            <h2 className={styles.blockTitle}>{t('detail.vehicleBlock')}</h2>
            <div className={styles.vehicle}>
              {data.vehicle.imageUrl ? (
                <PreviewImage
                  src={data.vehicle.imageUrl}
                  alt={data.vehicle.name}
                  className={styles.vehicleImage}
                  loading="lazy"
                />
              ) : null}
              <div className={styles.vehicleBody}>
                <Link href={listingPath.detail(data.vehicle.id)} className={styles.vehicleName}>
                  {data.vehicle.name}
                </Link>
                <p className={styles.vehicleSpecs}>
                  {[
                    data.vehicle.seatCount
                      ? t('detail.seatCount', { count: data.vehicle.seatCount })
                      : null,
                    data.vehicle.transmission,
                    data.vehicle.fuelType,
                  ]
                    .filter(Boolean)
                    .join(LIST_SEPARATOR) || t('detail.specsEmpty')}
                </p>
                {/* Biển số chỉ có sau khi chủ xe nhận chuyến — server quyết định, không phải UI. */}
                {data.vehicle.plateNumber ? (
                  <p className={styles.plate}>{data.vehicle.plateNumber}</p>
                ) : null}
              </div>
            </div>
          </section>

          <section className={styles.shop}>
            <span className={styles.shopAvatar} aria-hidden="true">
              {data.shop.name.charAt(0).toUpperCase()}
            </span>
            <div className={styles.shopBody}>
              <span className={styles.shopName}>{data.shop.name}</span>
              <span className={styles.shopMeta}>
                {data.shop.ratingCount > 0 ? (
                  <>
                    <Stars value={data.shop.ratingAvg} size="sm" />
                    <span>
                      {t('detail.ratingSummary', {
                        avg: fmt.rating(data.shop.ratingAvg),
                        count: data.shop.ratingCount,
                      })}
                    </span>
                  </>
                ) : (
                  <span>{t('detail.noRating')}</span>
                )}
              </span>
            </div>
            <Link href={shopPath.detail(data.shop.slug)} className={styles.shopLink}>
              {t('detail.viewShop')}
            </Link>
          </section>

          <section className={styles.block}>
            <h2 className={styles.blockTitle}>{t('detail.scheduleBlock')}</h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>{t('detail.service')}</dt>
                <dd>
                  {dl('serviceType', data.serviceType)}
                  {data.routeType ? ` · ${dl('routeType', data.routeType)}` : ''}
                </dd>
              </div>
              {/*
                Chuyến THUÊ DÀI HẠN còn chờ duyệt chưa có lịch nào (ADR 0011): hiện gói đã mua và
                nguyện vọng ngày nhận. Đổ dayjs(null) vào đây sẽ in "Invalid Date", và tệ hơn là
                khiến khách tưởng lịch đã chốt.
              */}
              {data.longTermPackageMonths ? (
                <div className={styles.row}>
                  <dt>{t('detail.package')}</dt>
                  <dd>{fmt.packageLabel(data.longTermPackageMonths)}</dd>
                </div>
              ) : null}
              {data.pickupAt && data.returnAt ? (
                <>
                  <div className={styles.row}>
                    <dt>{t('detail.pickupAt')}</dt>
                    <dd>{fmt.rentalPoint(dayjs(data.pickupAt))}</dd>
                  </div>
                  <div className={styles.row}>
                    <dt>{t('detail.returnAt')}</dt>
                    <dd>{fmt.rentalPoint(dayjs(data.returnAt))}</dd>
                  </div>
                  <div className={styles.row}>
                    <dt>{t('detail.duration')}</dt>
                    <dd>{fmt.rentalDuration(dayjs(data.pickupAt), dayjs(data.returnAt))}</dd>
                  </div>
                </>
              ) : (
                <div className={styles.row}>
                  <dt>{t('detail.pickupWish')}</dt>
                  <dd>{fmt.pickupWish(data)}</dd>
                </div>
              )}
            </dl>
            {/* Chuyến CÓ TÀI XẾ: xe đến đón — hiện hành trình thay cho hình thức nhận xe. */}
            {data.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
              <p className={styles.pickupMethod}>
                <EnvironmentOutlined aria-hidden="true" />
                <span>
                  <b>{t('pickup.driverPickup')}</b>
                  {data.pickupAddress ? (
                    <span className={styles.address}>
                      {t('pickup.pickupPoint', { address: data.pickupAddress })}
                    </span>
                  ) : null}
                  {data.destination ? (
                    <span className={styles.address}>
                      {t('pickup.destination', { address: data.destination })}
                    </span>
                  ) : null}
                </span>
              </p>
            ) : (
              <p className={styles.pickupMethod}>
                <EnvironmentOutlined aria-hidden="true" />
                <span>
                  <b>{data.deliveryRequested ? t('pickup.delivery') : t('pickup.agency')}</b>
                  {data.deliveryRequested && data.deliveryAddress ? (
                    <span className={styles.address}>{data.deliveryAddress}</span>
                  ) : null}
                </span>
              </p>
            )}
          </section>

          {/* Mốc THỰC TẾ chỉ có ý nghĩa sau chuyến — và chỉ hiện khi thật sự được ghi nhận. */}
          {data.actualPickupAt || data.actualReturnAt ? (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('detail.actualBlock')}</h2>
              <dl className={styles.rows}>
                {data.actualPickupAt ? (
                  <div className={styles.row}>
                    <dt>{t('detail.actualPickup')}</dt>
                    <dd>{fmt.dateTime(data.actualPickupAt)}</dd>
                  </div>
                ) : null}
                {data.actualReturnAt ? (
                  <div className={styles.row}>
                    <dt>{t('detail.actualReturn')}</dt>
                    <dd>{fmt.dateTime(data.actualReturnAt)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {/*
            Bằng chứng bàn giao đứng NGAY SAU mốc thực tế: hai khối trả lời cùng một câu hỏi
            ("chuyến đã diễn ra thế nào"), chỉ khác độ sâu — mốc giờ ở trên, biên bản + ảnh +
            Odo ở dưới. Tách chúng ra hai đầu trang là bắt khách cuộn qua lại để đối chiếu.

            Chỉ gọi API khi chuyến ĐÃ có mốc bàn giao thật. `actualPickupAt`/`actualReturnAt`
            do chính lần xác nhận bàn giao ghi (cùng transaction), nên "chưa có mốc nào" đồng
            nghĩa "chưa có biên bản nào đã xác nhận" — không cần một lượt gọi để biết là rỗng.
          */}
          <TripHandoverEvidence
            tripId={tripId}
            enabled={Boolean(data.actualPickupAt || data.actualReturnAt)}
          />

          {data.customerNote ? (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('detail.noteBlock')}</h2>
              <p className={styles.note}>{data.customerNote}</p>
            </section>
          ) : null}

          {data.review ? (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('detail.reviewBlock')}</h2>
              <Stars value={data.review.rating} />
              {data.review.comment ? <p className={styles.note}>{data.review.comment}</p> : null}
            </section>
          ) : null}
        </div>

        <aside className={styles.side}>
          {data.finance ? (
            <TripFinanceCard finance={data.finance} closed={closed} />
          ) : (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>{t('detail.priceBlock')}</h2>
              {/*
                Chưa có đơn thì chưa có giá chốt. Dựng một bảng "dự kiến" ở đây là hứa hẹn thay
                chủ xe — con số có thể khác hẳn sau khi họ xác nhận.
              */}
              <p className={styles.note}>{t('detail.priceEmpty')}</p>
            </section>
          )}

          {/*
            Cụm hỗ trợ là một THẺ có tiêu đề, không phải ba nút xếp chồng vô danh.
            Trước đây ba nút full-width cùng cỡ đứng nối đuôi nhau: mắt không biết cái nào là
            việc chính, "Gọi 0900000000" thì dài quá khổ và tràn ở màn hẹp, còn "Đánh giá chuyến
            đi" — chỉ hiện đúng một lần trong cả vòng đời chuyến — lại to ngang với việc nhắn tin
            hằng ngày. Giờ: nhắn tin là nút chính, gọi và đánh giá là hai ô phụ chia đôi hàng
            dưới, số điện thoại xuống dòng phụ để nhãn nút luôn ngắn.
          */}
          <section className={styles.support}>
            <h2 className={styles.supportTitle}>{t('actions.title')}</h2>
            <ChatWithShopButton
              vehicleId={data.vehicle.id}
              type="primary"
              size="large"
              block
              label={t('actions.contactShop')}
            />
            <div className={styles.supportRow}>
              {data.shop.phone ? (
                <a className={styles.supportAction} href={`tel:${data.shop.phone}`}>
                  <PhoneOutlined aria-hidden="true" />
                  <span className={styles.supportLabel}>{t('actions.call')}</span>
                  <span className={styles.supportMeta}>{data.shop.phone}</span>
                </a>
              ) : null}
              {data.canReview ? (
                <button
                  type="button"
                  className={styles.supportAction}
                  onClick={() => setReviewOpen(true)}
                >
                  <StarOutlined aria-hidden="true" />
                  <span className={styles.supportLabel}>{t('actions.review')}</span>
                  <span className={styles.supportMeta}>{data.vehicle.name}</span>
                </button>
              ) : null}
            </div>
          </section>

          <div className={styles.actions}>
            {/*
              Huỷ đứng CUỐI và không phải nút chính: nó là lối thoát, không phải việc khách vào
              đây để làm. Chỉ hiện tới trước lúc giao xe — sau đó xe đã ở ngoài đường và việc cần
              làm là gọi chủ xe, nên một nút "Huỷ" ở đó chỉ là lời hứa hão.
            */}
            {canCustomerCancelTrip(data.stage) ? (
              <Button block danger onClick={() => setCancelOpen(true)}>
                {t('actions.cancel')}
              </Button>
            ) : null}
          </div>
        </aside>
      </div>

      {/*
        Dựng CÓ ĐIỀU KIỆN: mỗi lần mở là một instance mới nên form sạch, không cần reset trong
        effect. `bookingId` chắc chắn có khi `canReview` — server chỉ bật cờ đó cho chuyến đã
        hoàn thành, mà chuyến hoàn thành thì phải có đơn.
      */}
      {reviewOpen && data.bookingId ? (
        <ReviewModal
          trip={{ bookingId: data.bookingId, vehicleName: data.vehicle.name }}
          open
          onClose={() => setReviewOpen(false)}
        />
      ) : null}

      {/* Dựng có điều kiện: mỗi lần mở là một instance mới, không mang lỗi của lần trước sang. */}
      {cancelOpen ? (
        <CancelTripDialog trip={data} open onClose={() => setCancelOpen(false)} />
      ) : null}
    </div>
  );
}

/**
 * Kết cục hỏng có khối RIÊNG, không phải một mốc trên dòng thời gian: đánh dấu `Hoàn thành` cho
 * chuyến bị huỷ là nói dối, còn để dòng thời gian trống lơ lửng thì không giải thích được gì.
 */
function TerminalNotice({ trip, stage }: { trip: CustomerTripDetail; stage: CustomerTripStage }) {
  const t = useTranslations('Trips.notice');

  if (stage === CUSTOMER_TRIP_STAGE.PENDING_APPROVAL) {
    return (
      <Alert type="warning" showIcon message={t('pendingTitle')} description={t('pendingBody')} />
    );
  }

  if (stage === CUSTOMER_TRIP_STAGE.REJECTED) {
    return (
      <Alert
        type="error"
        showIcon
        message={t('rejectedTitle')}
        // Lý do do chủ xe tự gõ — giữ nguyên chữ của họ, không có bản dịch nào cho câu đó.
        description={trip.rejectReason ?? t('rejectedBody')}
      />
    );
  }

  if (stage === CUSTOMER_TRIP_STAGE.CANCELLED) {
    return (
      <Alert type="info" showIcon message={t('cancelledTitle')} description={t('cancelledBody')} />
    );
  }

  if (stage === CUSTOMER_TRIP_STAGE.NO_SHOW) {
    return <Alert type="error" showIcon message={t('noShowTitle')} description={t('noShowBody')} />;
  }

  return null;
}

/**
 * Chặng → KHOÁ message của câu phụ đề.
 *
 * Bảng tra literal chứ không ghép chuỗi lúc chạy: `next-intl` kiểm khoá message ở tầng KIỂU,
 * nên `t(`subtitle.${stage}`)` chỉ ra `subtitle.${string}` và mất sạch bảo chứng — sai một khoá
 * sẽ thành lỗi lúc chạy thay vì lỗi biên dịch. `Record` đủ mọi chặng nên thêm chặng mới là lỗi
 * biên dịch ngay, không lặng lẽ rơi vào nhánh mặc định.
 */
const SUBTITLE_KEY = {
  [CUSTOMER_TRIP_STAGE.PENDING_APPROVAL]: 'subtitle.pending_approval',
  [CUSTOMER_TRIP_STAGE.AWAITING_HOLD]: 'subtitle.awaiting_hold',
  [CUSTOMER_TRIP_STAGE.READY]: 'subtitle.ready',
  [CUSTOMER_TRIP_STAGE.ACTIVE]: 'subtitle.active',
  [CUSTOMER_TRIP_STAGE.COMPLETED]: 'subtitle.completed',
  [CUSTOMER_TRIP_STAGE.CANCELLED]: 'subtitle.terminal',
  [CUSTOMER_TRIP_STAGE.REJECTED]: 'subtitle.terminal',
  [CUSTOMER_TRIP_STAGE.NO_SHOW]: 'subtitle.terminal',
  // `as const` giữ kiểu LITERAL cho từng khoá (chú thích kiểu tường minh sẽ nới nó thành
  // `string` và `t()` mất bảo chứng); `satisfies` vẫn bắt lỗi nếu thiếu một chặng.
} as const satisfies Record<CustomerTripStage, string>;
