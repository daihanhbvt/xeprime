'use client';

import { ArrowLeftOutlined, ClockCircleOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import {
  API_ERROR_CODE, CUSTOMER_TRIP_STAGE, CUSTOMER_TRIP_STAGE_META, SERVICE_TYPE, customerTripTimeline, isCustomerTripClosed, routeTypeLabel, serviceTypeLabel, type CustomerTripStage, } from '@xeprime/types';
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
import { getErrorCode, getErrorMessage, isUnauthenticated } from '@/services/api-client';
import { useTrip } from '../hooks';
import type { CustomerTripDetail } from '../types';
import { CustomerTripTimeline } from './CustomerTripTimeline';
import { TripFinanceCard } from './TripFinanceCard';
import styles from './TripDetailView.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

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
  const fmt = useAppFormat();

  const router = useRouter();
  const { open } = useAuthModal();
  const nextFromHere = useNextFromCurrentPath();
  const { data, isLoading, isError, error, refetch } = useTrip(tripId);
  const [reviewOpen, setReviewOpen] = useState(false);

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
            title="Phiên đăng nhập đã hết hạn"
            description="Vui lòng đăng nhập lại để xem chuyến đi này."
            action={
              <Button
                type="primary"
                onClick={() => open({ mode: AUTH_MODE.LOGIN, next: nextFromHere() })}
              >
                Đăng nhập
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
          title={missing ? 'Chuyến đi không tồn tại hoặc đã bị xóa' : 'Không tải được chuyến đi'}
          description={missing ? 'Mã định danh chuyến không tồn tại.' : getErrorMessage(error)}
          action={
            missing ? (
              <Button type="primary" onClick={() => router.push(ROUTES.TRIPS)}>
                Về danh sách chuyến
              </Button>
            ) : (
              <Button type="primary" onClick={() => void refetch()}>
                Thử lại
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
          <ArrowLeftOutlined aria-hidden="true" /> Quay lại danh sách
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
          <h1 className={styles.heading}>Chi tiết chuyến đi{data.code ? ` #${data.code}` : ''}</h1>
          <p className={styles.sub}>{subtitleFor(stage)}</p>
        </div>
        <StatusTag value={stage} meta={CUSTOMER_TRIP_STAGE_META} group="customerTripStage" />
      </header>

      <TerminalNotice trip={data} stage={stage} />

      <div className={styles.layout}>
        <div className={styles.main}>
          {stage === CUSTOMER_TRIP_STAGE.ACTIVE ? (
            <section className={styles.highlight}>
              <h2 className={styles.highlightTitle}>Hành trình đang diễn ra</h2>
              <p className={styles.highlightLead}>
                <ClockCircleOutlined aria-hidden="true" /> Thời gian trả xe dự kiến:{' '}
                <b>{fmt.rentalPoint(dayjs(data.returnAt))}</b>
              </p>
              <p className={styles.highlightNote}>
                Nếu có thay đổi, vui lòng liên hệ chủ xe sớm nhất.
              </p>
            </section>
          ) : null}

          <section className={styles.block}>
            <h2 className={styles.blockTitle}>Thông tin phương tiện</h2>
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
                <p className={styles.vehicleSpecs}>{vehicleSpecs(data)}</p>
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
                      {data.shop.ratingAvg} · {data.shop.ratingCount} đánh giá
                    </span>
                  </>
                ) : (
                  <span>Chưa có đánh giá</span>
                )}
              </span>
            </div>
            <Link href={shopPath.detail(data.shop.slug)} className={styles.shopLink}>
              Xem gian hàng →
            </Link>
          </section>

          <section className={styles.block}>
            <h2 className={styles.blockTitle}>Thời gian &amp; địa điểm nhận xe</h2>
            <dl className={styles.rows}>
              <div className={styles.row}>
                <dt>Dịch vụ</dt>
                <dd>
                  {serviceTypeLabel(data.serviceType)}
                  {data.routeType ? ` · ${routeTypeLabel(data.routeType)}` : ''}
                </dd>
              </div>
              {/*
                Chuyến THUÊ DÀI HẠN còn chờ duyệt chưa có lịch nào (ADR 0011): hiện gói đã mua và
                nguyện vọng ngày nhận. Đổ dayjs(null) vào đây sẽ in "Invalid Date", và tệ hơn là
                khiến khách tưởng lịch đã chốt.
              */}
              {data.longTermPackageMonths ? (
                <div className={styles.row}>
                  <dt>Gói thuê</dt>
                  <dd>{fmt.packageLabel(data.longTermPackageMonths)}</dd>
                </div>
              ) : null}
              {data.pickupAt && data.returnAt ? (
                <>
                  <div className={styles.row}>
                    <dt>Nhận xe</dt>
                    <dd>{fmt.rentalPoint(dayjs(data.pickupAt))}</dd>
                  </div>
                  <div className={styles.row}>
                    <dt>Trả xe</dt>
                    <dd>{fmt.rentalPoint(dayjs(data.returnAt))}</dd>
                  </div>
                  <div className={styles.row}>
                    <dt>Thời lượng</dt>
                    <dd>{fmt.rentalDuration(dayjs(data.pickupAt), dayjs(data.returnAt))}</dd>
                  </div>
                </>
              ) : (
                <div className={styles.row}>
                  <dt>Nguyện vọng nhận xe</dt>
                  <dd>{fmt.pickupWish(data)}</dd>
                </div>
              )}
            </dl>
            {/* Chuyến CÓ TÀI XẾ: xe đến đón — hiện hành trình thay cho hình thức nhận xe. */}
            {data.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
              <p className={styles.pickupMethod}>
                <EnvironmentOutlined aria-hidden="true" />
                <span>
                  <b>Xe đón tận nơi</b>
                  {data.pickupAddress ? (
                    <span className={styles.address}>Điểm đón: {data.pickupAddress}</span>
                  ) : null}
                  {data.destination ? (
                    <span className={styles.address}>Điểm đến: {data.destination}</span>
                  ) : null}
                </span>
              </p>
            ) : (
              <p className={styles.pickupMethod}>
                <EnvironmentOutlined aria-hidden="true" />
                <span>
                  <b>{data.deliveryRequested ? 'Giao xe tận nơi' : 'Nhận tại đại lý'}</b>
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
              <h2 className={styles.blockTitle}>Hành trình thực tế</h2>
              <dl className={styles.rows}>
                {data.actualPickupAt ? (
                  <div className={styles.row}>
                    <dt>Thời gian nhận bàn giao</dt>
                    <dd>{fmt.dateTime(data.actualPickupAt)}</dd>
                  </div>
                ) : null}
                {data.actualReturnAt ? (
                  <div className={styles.row}>
                    <dt>Thời gian hoàn tất bàn giao</dt>
                    <dd>{fmt.dateTime(data.actualReturnAt)}</dd>
                  </div>
                ) : null}
              </dl>
            </section>
          ) : null}

          {data.customerNote ? (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Ghi chú của bạn</h2>
              <p className={styles.note}>{data.customerNote}</p>
            </section>
          ) : null}

          {data.review ? (
            <section className={styles.block}>
              <h2 className={styles.blockTitle}>Đánh giá của bạn</h2>
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
              <h2 className={styles.blockTitle}>Chi tiết giá</h2>
              {/*
                Chưa có đơn thì chưa có giá chốt. Dựng một bảng "dự kiến" ở đây là hứa hẹn thay
                chủ xe — con số có thể khác hẳn sau khi họ xác nhận.
              */}
              <p className={styles.note}>
                Giá chính thức sẽ hiển thị ngay khi chủ xe xác nhận yêu cầu của bạn.
              </p>
            </section>
          )}

          <div className={styles.actions}>
            <ChatWithShopButton
              vehicleId={data.vehicle.id}
              type="primary"
              block
              label="Liên hệ cửa hàng"
            />
            {data.shop.phone ? (
              <Button block href={`tel:${data.shop.phone}`}>
                Gọi {data.shop.phone}
              </Button>
            ) : null}
            {data.canReview ? (
              <Button block onClick={() => setReviewOpen(true)}>
                Đánh giá chuyến đi
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
    </div>
  );
}

/**
 * Kết cục hỏng có khối RIÊNG, không phải một mốc trên dòng thời gian: đánh dấu `Hoàn thành` cho
 * chuyến bị huỷ là nói dối, còn để dòng thời gian trống lơ lửng thì không giải thích được gì.
 */
function TerminalNotice({ trip, stage }: { trip: CustomerTripDetail; stage: CustomerTripStage }) {
  if (stage === CUSTOMER_TRIP_STAGE.PENDING_APPROVAL) {
    return (
      <Alert
        type="warning"
        showIcon
        message="Đang chờ chủ xe xác nhận"
        description="Chủ xe đang xem xét yêu cầu đặt xe của bạn. Bạn sẽ nhận được thông báo ngay khi có phản hồi."
      />
    );
  }

  if (stage === CUSTOMER_TRIP_STAGE.REJECTED) {
    return (
      <Alert
        type="error"
        showIcon
        message="Yêu cầu bị từ chối"
        description={
          trip.rejectReason ??
          'Chủ xe không thể tiếp nhận yêu cầu này. Bạn có thể tìm một chiếc xe khác cho cùng lịch trình.'
        }
      />
    );
  }

  if (stage === CUSTOMER_TRIP_STAGE.CANCELLED) {
    return (
      <Alert
        type="info"
        showIcon
        message="Chuyến đi đã hủy"
        description="Chuyến này đã được hủy. Khoản giữ chỗ (nếu có) đã được giải phóng."
      />
    );
  }

  if (stage === CUSTOMER_TRIP_STAGE.NO_SHOW) {
    return (
      <Alert
        type="error"
        showIcon
        message="Khách không nhận xe"
        description="Chuyến được đánh dấu là không nhận xe đúng hẹn. Liên hệ chủ xe nếu bạn cho rằng có nhầm lẫn."
      />
    );
  }

  return null;
}

function subtitleFor(stage: CustomerTripStage): string {
  switch (stage) {
    case CUSTOMER_TRIP_STAGE.PENDING_APPROVAL:
      return 'Yêu cầu thuê xe của bạn đã được gửi tới chủ xe';
    case CUSTOMER_TRIP_STAGE.READY:
      return 'Yêu cầu thuê xe đã được chủ xe xác nhận thành công';
    case CUSTOMER_TRIP_STAGE.ACTIVE:
      return 'Bạn đang trong thời gian thuê xe này. Vui lòng đi chuyển an toàn';
    case CUSTOMER_TRIP_STAGE.COMPLETED:
      return 'Chuyến đi đã kết thúc tốt đẹp. Cảm ơn bạn đã đồng hành cùng XePrime!';
    default:
      return 'Chuyến đi đã kết thúc sớm';
  }
}

/** Thông số xe — bỏ qua phần thiếu thay vì hiện dấu gạch cho từng ô trống. */
function vehicleSpecs(trip: CustomerTripDetail): string {
  const parts = [
    trip.vehicle.seatCount ? `${trip.vehicle.seatCount} chỗ` : null,
    trip.vehicle.transmission,
    trip.vehicle.fuelType,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(' · ') : 'Chưa cập nhật thông số';
}
