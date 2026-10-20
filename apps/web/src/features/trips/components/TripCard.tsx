'use client';

import { CalendarOutlined, EnvironmentOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import Link from 'next/link';
import {
  CUSTOMER_TRIP_STAGE_META,
  isCustomerTripClosed,
  SERVICE_TYPE,
  TRIP_ROLE,
  type CustomerTripStage,
  type TripRole,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { StatusTag } from '@/components/data-display/StatusTag';
import { BookingDriverCell } from '@/features/bookings/components/BookingDriverCell';
import { RespondDeadline } from '@/features/booking-requests/components/RespondDeadline';
import { tripPath } from '@/constants/routes';
import { cx } from '@/lib/cx';
import type { CustomerTrip } from '../types';
import styles from './TripCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useTranslations } from 'next-intl';

interface TripCardProps {
  trip: CustomerTrip;
  /**
   * Quyết định của CHỦ XE trên một yêu cầu còn chờ. Vắng mặt = màn hình không cho quyết định ở
   * đây (thiếu quyền `booking_requests.approve`), và thẻ KHÔNG bày nút mờ để giải thích.
   */
  decisions?: {
    onApprove: (trip: CustomerTrip) => void;
    onReject: (trip: CustomerTrip) => void;
    /** Thao tác đang chạy trên ĐÚNG chuyến này — chặn bấm chồng lên nhau. */
    /** `cancel` từ ADR 0045: chuyến ĐÃ NHẬN cũng có một thao tác đang chạy để khoá nút. */
  pending: 'approve' | 'reject' | 'cancel' | null;
  };
  /**
   * Mở chi tiết TẠI CHỖ (hộp thoại) — chỉ chuyến của CHỦ XE: có đơn thì vào đơn, chưa có thì vào
   * yêu cầu. Vắng mặt thì thẻ điều hướng tới `/trips/[id]` của site khách.
   */
  onOpenDetail?: (trip: CustomerTrip) => void;
  /** Đang nạp dữ liệu để mở chi tiết chuyến này — nút "Xem chi tiết" quay, không bấm chồng. */
  detailLoading?: boolean;
  /** KHU chứa chuyến — mặc định `/trips`. Chỉ dùng khi thẻ điều hướng (không có `onOpenDetail`). */
  basePath?: string;
}

/**
 * Một chuyến trong danh sách chuyến — dùng cho CẢ HAI phía: `Chuyến của tôi` của khách (site khách)
 * và `Chuyến cho thuê` của chủ xe tuyến hoa hồng (site partner, `OwnerTripsView`).
 *
 * Thẻ tự nói mình là phía nào: một nhãn ở đầu thẻ, và dòng người đối diện đổi theo
 * ("Chủ xe: …" ↔ "Khách thuê: …"). Cấu trúc thì giữ nguyên một bản — dựng hai thẻ riêng là hai
 * bố cục phải sửa cùng lúc mỗi lần đổi một chi tiết.
 *
 * Khác biệt thật sự chỉ nằm ở HÀNH ĐỘNG: chủ xe đang có một yêu cầu chờ thì thấy đồng hồ đếm
 * ngược cùng hai quyết định ngay trên thẻ, vì đó là việc phải làm trước khi hết hạn. Mọi chặng
 * còn lại của cả hai phía chỉ có một lối đi tiếp là mở chi tiết.
 */
export function TripCard({
  trip,
  decisions,
  onOpenDetail,
  detailLoading = false,
  basePath,
}: TripCardProps) {
  const t = useTranslations('Trips');
  const dl = useDomainLabel();
  const fmt = useAppFormat();

  const stage = trip.stage as CustomerTripStage;
  const role = trip.role as TripRole;
  const isHost = role === TRIP_ROLE.HOST;
  const href = tripPath.detail(trip.id, basePath);
  /*
   * Chủ xe mở chi tiết bằng HỘP THOẠI ở site partner — nơi không có trang `/trips/[id]` nào. Tên
   * xe khi đó là chữ thường: một link ở đây sẽ dẫn vào trang không tồn tại, còn một nút thứ hai
   * cho CÙNG hành động với "Xem chi tiết" là hai đích cho trình đọc màn hình.
   */
  const opensInPlace = isHost && onOpenDetail !== undefined;
  /* Chỉ chuyến của CHỦ XE còn chờ chính họ trả lời mới có gì để quyết định. */
  const canDecide = Boolean(decisions && isHost && trip.respondBy);

  return (
    <article className={styles.card}>
      {/*
        Ảnh chỉ hiện khi xe THẬT SỰ có. `next/image` cần host khai báo sẵn còn ảnh xe đến từ R2
        theo cấu hình từng môi trường, nên dùng thẻ ảnh thường.
      */}
      {trip.vehicle.imageUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- ảnh R2, host cấu hình theo môi trường
        <img
          src={trip.vehicle.imageUrl}
          alt={trip.vehicle.name}
          className={styles.image}
          loading="lazy"
        />
      ) : (
        <div className={styles.imageFallback} aria-hidden="true" />
      )}

      <div className={styles.body}>
        {/* Nhãn phía + mã chuyến — hai thứ đầu tiên người đọc cần để biết mình đang nhìn gì. */}
        <p className={styles.tags}>
          <span className={cx(styles.roleTag, isHost ? styles.roleHost : styles.roleRenter)}>
            {t(isHost ? 'card.roleHost' : 'card.roleRenter')}
          </span>
          {trip.code ? <span className={styles.code}>#{trip.code}</span> : null}
        </p>
        <p className={styles.shop}>
          {t(isHost ? 'card.renter' : 'card.owner')}:{' '}
          <span className={styles.shopName}>
            {isHost ? (trip.renter?.name ?? t('card.renterUnknown')) : trip.shop.name}
          </span>
        </p>
        <h3 className={styles.name}>
          {opensInPlace ? (
            trip.vehicle.name
          ) : (
            <Link href={href} className={styles.nameLink}>
              {trip.vehicle.name}
            </Link>
          )}
        </h3>

        {/*
          Biển số đứng RIÊNG thành chip, không nhét chung vào dòng dịch vụ: nó là thứ người ta
          đối chiếu với chiếc xe trước mặt, và trong một danh sách nhiều xe cùng đời thì đây là
          thứ duy nhất phân biệt được chúng. Vắng mặt khi chuyến chưa gắn kết (phía khách).
        */}
        {trip.vehicle.plateNumber ? (
          <p className={styles.chips}>
            <span className={styles.plate}>{trip.vehicle.plateNumber}</span>
          </p>
        ) : null}

        <p className={styles.meta}>
          <CalendarOutlined aria-hidden="true" />
          {/* Yêu cầu dài hạn chưa duyệt chưa có lịch — nói gói + nguyện vọng, không bịa ngày. */}
          <span>
            {trip.pickupAt && trip.returnAt
              ? fmt.shortDateTimeRange(trip.pickupAt, trip.returnAt)
              : [fmt.packageLabel(trip.longTermPackageMonths), fmt.pickupWish(trip)]
                  .filter(Boolean)
                  .join(LIST_SEPARATOR)}
          </span>
        </p>
        <p className={styles.meta}>
          <EnvironmentOutlined aria-hidden="true" />
          <span>
            {/* Chuyến có tài xế: xe đến đón — nhãn giao/nhận xe tự lái không đúng ngữ cảnh. */}
            {trip.serviceType === SERVICE_TYPE.WITH_DRIVER
              ? `${dl('serviceType', trip.serviceType)}${trip.routeType ? ` · ${dl('routeType', trip.routeType)}` : ''}`
              : `${dl('serviceType', trip.serviceType)} · ${trip.deliveryRequested ? t('pickup.delivery') : t('pickup.agency')}`}
          </span>
        </p>
        {/* Chủ xe theo dõi tài xế của chuyến có tài xế ngay trên thẻ — giống cột "Tài xế" ở bảng đơn. */}
        {isHost && trip.bookingId && trip.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
          <p className={styles.meta}>
            <span>{t('card.driver')}:</span>
            <BookingDriverCell booking={trip} />
          </p>
        ) : null}
      </div>

      <div className={styles.side}>
        <StatusTag value={stage} meta={CUSTOMER_TRIP_STAGE_META} group="customerTripStage" />
        {/* Hạn trả lời chỉ có nghĩa với người PHẢI trả lời — khách nhìn nó không làm được gì. */}
        {isHost && trip.respondBy ? <RespondDeadline respondBy={trip.respondBy} /> : null}
        <div className={styles.money}>
          <span className={styles.moneyLabel}>{t('card.total')}</span>
          {/*
            Tổng tiền KHÁCH PHẢI TRẢ, đã gồm phụ phí chuyến (ADR 0029). Chuyến chưa duyệt cũng
            có số — server báo giá tạm tính bằng ĐÚNG phép tính của bước duyệt — nhưng nó phải
            được gắn nhãn: tạm tính trưng ra như giá chốt là lời hứa hệ thống không giữ.

            Không báo giá được (xe thiếu giá, gói dài hạn chưa chọn) thì nói thẳng, không bao
            giờ hiện `0 đ` — thứ trông y hệt "chuyến này miễn phí".
          */}
          <span className={styles.moneyValue}>
            {trip.totalAmount ? fmt.money(trip.totalAmount) : t('card.awaitingQuote')}
          </span>
          {/*
            "Chốt khi duyệt" chỉ đúng khi còn một lượt duyệt phía trước. Chuyến đã khép mà chưa
            từng có đơn (từ chối, quá hạn, huỷ, mất khung giờ) sẽ không bao giờ được chốt giá —
            con số chỉ còn là báo giá lúc khách gửi.
          */}
          {trip.totalAmount && trip.totalIsEstimate ? (
            <span className={styles.moneyNote}>
              {isCustomerTripClosed(stage) ? t('card.estimatedClosed') : t('card.estimated')}
            </span>
          ) : null}
        </div>
        {/*
          MỘT hàng nút, MỘT hệ kiểu dáng.

          Ba hành động dùng API `color`/`variant` của AntD chứ không tự chế CSS, và `.actions`
          ép chung một chiều cao cho cả nút lẫn link — trước đó link "Xem chi tiết" cao 44px
          đứng cạnh ba nút `size="small"` cao 24px, nên cùng một danh sách trông như hai sản
          phẩm khác nhau.

          Xác nhận là NÚT CHÍNH của sản phẩm nên nó mang sắc thương hiệu, đúng bằng nút
          "Duyệt & giữ xe" ở màn chi tiết — cùng một hành động thì phải cùng một hình. Từ chối
          viền đỏ vì nó phá huỷ; xem chi tiết viền vàng vì nó chỉ là lối đi.
        */}
        <div className={styles.actions}>
          {/*
            Lối đi mặc định của KHÁCH là điều hướng ⇒ `<Link>` tạo dáng như nút, không phải
            `<Button>` lồng trong `<Link>`: lồng hai phần tử tương tác cho trình đọc màn hình hai
            đích cho cùng một thứ. Chủ xe MỞ MODAL nên đó là nút thật, không giả dạng link.
          */}
          {opensInPlace ? (
            <Button
              color="primary"
              variant="outlined"
              loading={detailLoading}
              disabled={decisions?.pending != null}
              onClick={() => onOpenDetail?.(trip)}
            >
              {t('card.viewDetail')}
            </Button>
          ) : (
            <Link href={href} className={styles.action}>
              {t('card.viewDetail')}
            </Link>
          )}

          {canDecide && decisions ? (
            <>
              <Button
                color="danger"
                variant="outlined"
                loading={decisions.pending === 'reject'}
                disabled={decisions.pending !== null}
                onClick={() => decisions.onReject(trip)}
              >
                {t('card.reject')}
              </Button>
              <Button
                type="primary"
                loading={decisions.pending === 'approve'}
                disabled={decisions.pending !== null}
                onClick={() => decisions.onApprove(trip)}
              >
                {t('card.approve')}
              </Button>
            </>
          ) : null}
        </div>
      </div>
    </article>
  );
}
