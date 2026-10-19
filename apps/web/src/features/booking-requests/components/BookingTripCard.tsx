'use client';

import {
  CalendarOutlined,
  DashboardOutlined,
  EnvironmentOutlined,
  FlagOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Avatar } from 'antd';
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
import { useListingSpecSummary } from '../hooks/use-listing-spec-summary';
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
  /** Ngày trả dự kiến của gói — chỉ có khi khách đã chọn MỘT ngày nhận cụ thể (ADR 0011). */
  expectedReturnDate: Dayjs | null;
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
   */
  variant: 'review' | 'receipt';
  /** Hành động ở đầu thẻ — "Chỉnh sửa" của màn Xem lại. */
  action?: ReactNode;
  /**
   * Nhắc HẠN MỨC QUÃNG ĐƯỜNG — khoản duy nhất có thể phát sinh sau chuyến mà không nằm trong bảng
   * giá. Đó là lời nhắc TRƯỚC khi gửi; sau khi gửi rồi thì nó không còn đổi được quyết định nào.
   */
  showMileage?: boolean;
  /** Khối chen giữa lịch và hàng chủ xe — ước lượng giao xe (Xem lại), tổng tiền (đã gửi). */
  children?: ReactNode;
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
  children,
}: BookingTripCardProps) {
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const specs = useListingSpecSummary(listing);

  const isLongTerm = trip.serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const name = listing?.name ?? vehicleName;
  const image = listing?.mainImageUrl ?? vehicleImageUrl;

  /* ── Mốc thời gian: dài hạn là GÓI + nguyện vọng, không phải một lịch đã chốt (ADR 0011) ── */
  const pickupWindow = longTermPickupWindow(new Date());
  const timeRows: Array<{ key: string; label: string; value: string }> = isLongTerm
    ? [
        {
          key: 'package',
          label: t('reviewPage.trip.package'),
          value: fmt.packageLabel(trip.packageMonths) ?? '—',
        },
        {
          key: 'wish',
          label: t('reviewPage.trip.pickupWish'),
          // Câu nguyện vọng DÙNG CHUNG mọi bề mặt dài hạn (`fmt.pickupWish`); khoảng "trong 7 ngày"
          // tính từ hôm nay như server sẽ tính lúc nhận yêu cầu.
          value: fmt.pickupWish({
            pickupPreference: trip.pickupPreference,
            requestedPickupDate: trip.requestedPickupDate?.format('YYYY-MM-DD') ?? null,
            pickupWindowStartDate: pickupWindow.start,
            pickupWindowEndDate: pickupWindow.end,
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
      ]
    : [
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
                : t('reviewPage.trip.selfPickupPending'),
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
        <h3 className={styles.title}>{t('reviewPage.trip.title')}</h3>
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

      {listing ? (
        <>
          <div className={styles.divider} role="presentation" />
          <div className={styles.ownerRow}>
            <div className={styles.owner}>
              <Avatar
                size={32}
                src={listing.shopLogoUrl ?? undefined}
                icon={<UserOutlined />}
                alt=""
                className={styles.ownerAvatar}
              />
              <div className={styles.ownerText}>
                <span className={styles.ownerCaption}>{t('reviewPage.trip.owner')}</span>
                <span className={styles.ownerName}>{listing.shopName}</span>
              </div>
            </div>
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
