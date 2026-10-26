'use client';

import {
  CalendarOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FlagOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  ROUTE_TYPE,
  SERVICE_TYPE,
  appliesExcessMileage,
  longTermPickupWindow,
  type PickupPreference,
  type RouteType,
  type ServiceType,
} from '@xeprime/types';
import { LIST_SEPARATOR, type RentalMode } from '@xeprime/domain';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import type { PublicListingDetail } from '@/features/marketplace/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { appWallClockToIso, type Dayjs } from '@/lib/datetime';
import { useListingSpecSummary, type ListingSpecSource } from '../hooks/use-listing-spec-summary';
import { pickupPointText } from '../pickup-point';
import styles from './BookingTripCard.module.css';

/** Chuyến khách đã chọn — giá trị THÔ của form, thẻ tự quyết dòng nào hiện. */
export interface BookingTrip {
  serviceType: ServiceType;
  routeType: RouteType;
  rentalMode: RentalMode;
  pickupAt: Dayjs | null;
  returnAt: Dayjs | null;
  packageMonths: number | null;
  pickupPreference: PickupPreference;
  requestedPickupDate: Dayjs | null;
  /**
   * Khoảng "nhận trong N ngày" server ĐÃ CHỐT lúc nhận yêu cầu (`YYYY-MM-DD`):
   *  - bỏ trống (`undefined`) — đang SOẠN yêu cầu: tính từ hôm nay, đúng như server sẽ tính lúc nhận;
   *  - `null` — chuyến đã gửi mà không ghi khoảng (dữ liệu cũ): KHÔNG tính lại từ hôm nay, câu
   *    nguyện vọng tự rơi về "gian hàng chốt lúc duyệt".
   */
  pickupWindow?: { start: string; end: string } | null;
  /** Ngày trả dự kiến của gói — chỉ có khi khách đã chọn MỘT ngày nhận cụ thể (ADR 0011). */
  expectedReturnDate: Dayjs | null;
  /**
   * Lịch dài hạn ĐÃ CHỐT giờ — luồng đặt hộ: gian hàng là bên chốt lịch nên đơn có giờ nhận thật và
   * ngày trả suy từ gói (`pickupAt`/`returnAt`), không có "nguyện vọng" nào để kể.
   */
  scheduleFixed?: boolean;
  isDelivery: boolean;
  /** Chuỗi địa chỉ giao xe xem trước — cùng `formatAddress` server dùng để lưu. */
  deliveryAddress: string | null;
  /** Điểm đón của chuyến có tài xế. */
  driverPickupAddress: string | null;
  destination: string | null;
}

interface BookingTripCardProps {
  listing: PublicListingDetail | null;
  vehicleName: string;
  vehicleImageUrl: string | null;
  trip: BookingTrip;
  /**
   * Hình dạng của thẻ — cùng NỘI DUNG, khác bố cục:
   *
   *  - `review`: màn Xem lại (Figma `19727:55974`) — ảnh xe lớn bên trái, lịch xếp dọc bên phải.
   *  - `receipt`: hộp "Đã gửi yêu cầu" (Figma `19759:22185`, rộng 600) — ảnh xe nhỏ cạnh tên,
   *    nhận/trả nằm chung một hàng, tiêu đề có gạch chân.
   *
   *  Màn chuyến chờ chủ xe phản hồi (Figma `19727:60709`) dùng `review` — cùng khối "Trip review".
   */
  variant: 'review' | 'receipt';
  /** Hành động ở đầu thẻ — "Chỉnh sửa" của màn Xem lại. */
  action?: ReactNode;
  /**
   * Nhắc HẠN MỨC QUÃNG ĐƯỜNG — khoản duy nhất có thể phát sinh sau chuyến mà không nằm trong bảng
   * giá. Đó là lời nhắc TRƯỚC khi gửi; sau khi gửi rồi thì nó không còn đổi được quyết định nào.
   */
  showMileage?: boolean;
  /**
   * Thứ thẻ tự đọc từ TIN ĐĂNG, khi không có tin đăng — chuyến đã gửi mở lại lúc xe đã rời chợ
   * (tin ẩn/gỡ trả 404). Thông số và tên chủ xe lấy từ chính chuyến (`GET /trips/:id`), để thẻ không
   * mất hàng chủ xe chỉ vì tin đăng không còn công khai.
   */
  fallback?: { specs: ListingSpecSource; ownerName: string };
  /** Khối chen giữa lịch và hàng chủ xe — ước lượng giao xe (Xem lại), tổng tiền (đã gửi). */
  children?: ReactNode;
  /**
   * Lối liên hệ đứng ngay cạnh tên chủ xe — chỉ màn chuyến ĐÃ xác nhận có (Figma `19879:73257`: nút
   * nhắn tin tròn). Trước lúc đó kênh liên hệ chưa mở cho mọi tuyến (ADR 0028 điều 9).
   */
  ownerAction?: ReactNode;
  /**
   * Trang mặt tiền của chủ xe (`/shops/:slug`) — tên chủ xe thành liên kết. Chuyến đã gửi có; màn
   * Xem lại / hộp kết quả thì không (khách đang ở giữa một hộp thoại).
   */
  ownerHref?: string;
  /**
   * Bậc tiêu đề của thẻ — `h3` trong hộp đặt xe (dưới tiêu đề `h2` của bước), `h2` khi thẻ đứng
   * ngay dưới `h1` của một trang (chuyến chờ chủ xe phản hồi): không nhảy bậc dàn ý.
   */
  headingLevel?: 2 | 3;
  /**
   * Hàng chủ xe (avatar + tên) — `false` ở luồng đặt hộ: người đang xem CHÍNH LÀ chủ xe. Dòng tóm
   * tắt dịch vụ · thời lượng vẫn ở lại, vì đó là chỗ duy nhất thẻ nói dịch vụ của chuyến.
   */
  showOwner?: boolean;
  /**
   * Câu thay cho điểm nhận xe khi không có tin đăng — xe nội bộ của luồng đặt hộ. Câu mặc định
   * ("chủ xe gửi địa chỉ khi xác nhận") là lời nói với KHÁCH, sai khi người đọc là gian hàng.
   */
  selfPickupFallback?: string;
}

/**
 * Thẻ "Thông tin chuyến đi" — MỘT bản cho màn Xem lại và hộp "Đã gửi yêu cầu".
 *
 * Hai màn kể lại cùng một chuyến, và phần khó nằm ở cách kể: dài hạn là GÓI + nguyện vọng chứ
 * không phải một lịch đã chốt (ADR 0011), ba hình thức nhận xe loại trừ nhau, dòng tóm tắt dịch vụ
 * đổi theo dịch vụ. Hai bản viết tay là hai chỗ có thể lệch nhau — khách soát một đằng, gửi xong
 * lại đọc một nẻo.
 *
 * Không tự gọi API và không cộng trừ tiền: mọi thứ đến từ form, tin đăng, và slot `children`.
 */
export function BookingTripCard({
  listing,
  vehicleName,
  vehicleImageUrl,
  trip,
  variant,
  action,
  showMileage = false,
  fallback,
  children,
  ownerAction,
  ownerHref,
  headingLevel = 3,
  showOwner = true,
  selfPickupFallback,
}: BookingTripCardProps) {
  const Heading = headingLevel === 2 ? 'h2' : 'h3';
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const specs = useListingSpecSummary(listing ?? fallback?.specs ?? null);

  const isLongTerm = trip.serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const name = listing?.name ?? vehicleName;
  const image = listing?.mainImageUrl ?? vehicleImageUrl;
  const owner = !showOwner
    ? null
    : listing
      ? { name: listing.shopName, logoUrl: listing.shopLogoUrl ?? null }
      : fallback
        ? { name: fallback.ownerName, logoUrl: null }
        : null;

  /* ── Mốc thời gian: dài hạn là GÓI + nguyện vọng, không phải một lịch đã chốt (ADR 0011) ── */
  const pickupWindow =
    trip.pickupWindow === undefined ? longTermPickupWindow(new Date()) : trip.pickupWindow;
  const exactRows = [
    {
      key: 'pickup',
      label: t('reviewPage.trip.pickupAt'),
      value: trip.pickupAt ? fmt.dateTime(appWallClockToIso(trip.pickupAt)) : '—',
    },
    {
      key: 'return',
      label: t('reviewPage.trip.returnAt'),
      value: trip.returnAt ? fmt.dateTime(appWallClockToIso(trip.returnAt)) : '—',
    },
  ];
  const timeRows: Array<{ key: string; label: string; value: string }> = !isLongTerm
    ? exactRows
    : trip.scheduleFixed
      ? [
          {
            key: 'package',
            label: t('reviewPage.trip.package'),
            value: fmt.packageLabel(trip.packageMonths) ?? '—',
          },
          ...exactRows,
        ]
      : [
          {
            key: 'package',
            label: t('reviewPage.trip.package'),
            value: fmt.packageLabel(trip.packageMonths) ?? '—',
          },
          {
            key: 'wish',
            label: t('reviewPage.trip.pickupWish'),
            // Câu nguyện vọng DÙNG CHUNG mọi bề mặt dài hạn (`fmt.pickupWish`); khoảng "trong 7
            // ngày" tính từ hôm nay như server sẽ tính lúc nhận yêu cầu.
            value: fmt.pickupWish({
              pickupPreference: trip.pickupPreference,
              requestedPickupDate: trip.requestedPickupDate?.format('YYYY-MM-DD') ?? null,
              pickupWindowStartDate: pickupWindow?.start ?? null,
              pickupWindowEndDate: pickupWindow?.end ?? null,
            }),
          },
          ...(trip.expectedReturnDate
            ? [
                {
                  key: 'expectedReturn',
                  label: t('reviewPage.trip.expectedReturn'),
                  value: t('review.expectedReturnValue', {
                    date: fmt.dateKey(trip.expectedReturnDate.format('YYYY-MM-DD')),
                  }),
                },
              ]
            : []),
        ];

  /* ── Nơi nhận xe: ba hình thức loại trừ nhau ─────────────────────────────────────────────── */
  const pickupPoint = listing?.pickupPoint ?? null;
  const placeRows: Array<{ key: string; icon: ReactNode; title: string; body: string }> =
    isWithDriver
      ? [
          {
            key: 'driverPickup',
            icon: <EnvironmentOutlined />,
            title: t('reviewPage.trip.driverPickup'),
            body: trip.driverPickupAddress ?? '—',
          },
          ...(trip.routeType !== ROUTE_TYPE.IN_CITY && trip.destination
            ? [
                {
                  key: 'destination',
                  icon: <FlagOutlined />,
                  title: t('reviewPage.trip.destination'),
                  body: trip.destination,
                },
              ]
            : []),
        ]
      : trip.isDelivery
        ? [
            {
              key: 'delivery',
              icon: <EnvironmentOutlined />,
              title: t('reviewPage.trip.delivery'),
              body: trip.deliveryAddress ?? '—',
            },
          ]
        : [
            {
              key: 'self',
              icon: <EnvironmentOutlined />,
              title: t('reviewPage.trip.selfPickup'),
              body: pickupPoint
                ? pickupPointText(pickupPoint)
                : (selfPickupFallback ?? t('reviewPage.trip.selfPickupPending')),
            },
          ];
  /*
   * Điều kiện dịch vụ đọc `appliesExcessMileage` — cùng hàm `SettlementService` dùng lúc quyết
   * toán, để cổng công bố và cổng thu tiền không lệch nhau.
   */
  if (showMileage && appliesExcessMileage(trip.serviceType) && listing?.mileagePolicy) {
    placeRows.push({
      key: 'mileage',
      icon: <DashboardOutlined />,
      title: t('review.mileage'),
      body: t('review.mileageValue', {
        km: fmt.km(listing.mileagePolicy.includedKmPerDay),
        fee: fmt.money(listing.mileagePolicy.excessFeePerKm),
      }),
    });
  }

  const serviceText = isLongTerm
    ? dl('serviceType', trip.serviceType)
    : isWithDriver
      ? `${dl('serviceType', trip.serviceType)}${LIST_SEPARATOR}${dl('routeType', trip.routeType)}`
      : trip.rentalMode === 'hourly'
        ? t('time.modeHourly')
        : t('time.modeDaily');
  const durationText = isLongTerm
    ? fmt.packageLabel(trip.packageMonths)
    : trip.pickupAt && trip.returnAt
      ? fmt.rentalDuration(trip.pickupAt, trip.returnAt)
      : null;

  return (
    <section className={cx(styles.card, styles[variant])} aria-label={t('reviewPage.trip.title')}>
      <div className={styles.head}>
        <Heading className={styles.title}>{t('reviewPage.trip.title')}</Heading>
        {action}
      </div>

      <div className={styles.body}>
        <div className={styles.vehicle}>
          {image ? (
            <PreviewImage src={image} alt={name} className={styles.vehicleImage} />
          ) : (
            <div className={styles.vehiclePlaceholder} aria-hidden="true" />
          )}
          <div className={styles.vehicleInfo}>
            <p className={styles.vehicleName}>{name}</p>
            {specs.length > 0 ? (
              <p className={styles.vehicleSpecs}>{specs.join(LIST_SEPARATOR)}</p>
            ) : null}
          </div>
        </div>

        <div className={styles.schedule}>
          <div className={styles.times}>
            {timeRows.map((row) => (
              <div key={row.key} className={styles.scheduleRow}>
                <span className={styles.scheduleIcon} aria-hidden>
                  <CalendarOutlined />
                </span>
                <div className={styles.scheduleText}>
                  <span className={styles.scheduleLabel}>{row.label}</span>
                  <span className={styles.scheduleValue}>{row.value}</span>
                </div>
              </div>
            ))}
          </div>
          {placeRows.map((row) => (
            <div key={row.key} className={cx(styles.scheduleRow, styles.placeRow)}>
              <span className={styles.scheduleIcon} aria-hidden>
                {row.icon}
              </span>
              <div className={styles.scheduleText}>
                <span className={styles.placeTitle}>{row.title}</span>
                <span className={styles.placeBody}>{row.body}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {children}

      {owner || !showOwner ? (
        <>
          <div className={styles.divider} role="presentation" />
          <div className={styles.ownerRow}>
            {owner ? (
              <div className={styles.ownerGroup}>
                <div className={styles.owner}>
                  <Avatar
                    size={32}
                    src={owner.logoUrl ?? undefined}
                    icon={<UserOutlined />}
                    alt=""
                    className={styles.ownerAvatar}
                  />
                  <div className={styles.ownerText}>
                    <span className={styles.ownerCaption}>{t('reviewPage.trip.owner')}</span>
                    {ownerHref ? (
                      <Link href={ownerHref} className={cx(styles.ownerName, styles.ownerLink)}>
                        {owner.name}
                      </Link>
                    ) : (
                      <span className={styles.ownerName}>{owner.name}</span>
                    )}
                  </div>
                </div>
                {ownerAction ? <div className={styles.ownerAction}>{ownerAction}</div> : null}
              </div>
            ) : null}
            <span className={styles.tripSummary}>
              {durationText
                ? t('reviewPage.trip.summary', { service: serviceText, duration: durationText })
                : serviceText}
            </span>
          </div>
        </>
      ) : null}
    </section>
  );
}
