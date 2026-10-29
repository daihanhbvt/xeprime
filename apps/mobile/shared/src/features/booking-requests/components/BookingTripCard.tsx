import type { ComponentProps, ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, XStack, YStack } from 'tamagui';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { useTranslations } from 'use-intl';
import {
  PICKUP_PREFERENCE,
  RENTAL_MODE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  appliesExcessMileage,
  longTermPickupWindow,
  type PublicListingDetail,
} from '@xeprime/types';
import {
  appWallClockToIso,
  dayjs,
  DAY_PARAM_FORMAT,
  LIST_SEPARATOR,
  longTermReturnFromWallClock,
  toAppTz,
  type Dayjs,
  type RentalMode,
} from '@xeprime/domain';
import { HomeCardAvatar } from '@/features/marketplace/components/home/HomeCardAvatar';
import { Card } from '@/components/ui/Card';
import { useAddressPreview } from '@/features/locations/hooks/use-address-preview';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { BookingRequestFormValues } from '../booking-schema';
import { useListingSpecSummary } from '../hooks/use-listing-spec-summary';
import { pickupPointText as formatPickupPoint } from '../pickup-point';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Ảnh xe nhỏ cạnh tên — bố cục `receipt` của `BookingTripCard` web (Figma `19759:22185`). */
/** `.receipt .vehicleImage` ở thẻ ≤420px: rộng 96, tỉ lệ 135/76, bo `radius-control`. */
const RECEIPT_PHOTO = { width: 96, aspectRatio: 135 / 76, borderRadius: radius.control } as const;
/** `.review .vehicleImage` ở thẻ hẹp: rộng hết thẻ, tỉ lệ 285/160, bo `radius-card`. */
const REVIEW_PHOTO = { width: '100%', aspectRatio: 285 / 160, borderRadius: radius.card } as const;
/** Khe `space-12` của web — thang mobile không có bậc này. */
const GAP_12 = toPx(XP_TOKENS['space-12']);
/** Ô tròn icon của một dòng lịch/địa điểm (`.scheduleIcon` web). */
const SCHEDULE_ICON_SIZE = 36;

/** Chuyến đang kể — gương `BookingTrip` của web; thẻ tự quyết dòng nào hiện. */
export interface BookingTrip {
  serviceType: string;
  routeType: string;
  rentalMode: RentalMode;
  /** Mặt đồng hồ giờ Việt Nam (Dayjs) — đổi sang ISO lúc hiển thị bằng `appWallClockToIso`. */
  pickupAt: Dayjs | null;
  returnAt: Dayjs | null;
  packageMonths: number | null;
  pickupPreference: string;
  /** `YYYY-MM-DD` — ngày nhận cụ thể của nguyện vọng dài hạn. */
  requestedPickupDate: string | null;
  /** Ngày trả dự kiến của gói (`YYYY-MM-DD`) — chỉ có khi khách chọn MỘT ngày nhận cụ thể (ADR 0011). */
  expectedReturnDate: string | null;
  /**
   * Lịch dài hạn ĐÃ CHỐT giờ — luồng đặt hộ: gian hàng là bên chốt lịch nên đơn có giờ nhận thật và
   * ngày trả suy từ gói, không có "nguyện vọng" nào để kể.
   */
  scheduleFixed?: boolean;
  isDelivery: boolean;
  deliveryAddress: string | null;
  /** Điểm đón của chuyến có tài xế. */
  driverPickupAddress: string | null;
  destination: string | null;
}

/**
 * "Thông tin chuyến đi" của hộp "Đã gửi yêu cầu" — bản native của `BookingTripCard
 * variant="receipt"` web: ảnh xe nhỏ + tên + dòng thông số → lịch (nhận/trả, hoặc gói + nguyện vọng
 * dài hạn — ADR 0011) → nơi nhận xe (điểm hẹn THẬT của chủ xe, giao tận nơi, hay điểm đón có tài
 * xế) → slot `children` (dòng tổng) → chủ xe + tóm tắt "dịch vụ · thời lượng".
 *
 * Không gọi API, không cộng trừ tiền: mọi thứ đến từ form vừa gửi và tin đăng.
 */
export function BookingTripCard({
  listing,
  values,
  rentalMode,
  children,
  variant = 'receipt',
  action,
  showMileage = false,
}: {
  listing: PublicListingDetail;
  values: BookingRequestFormValues;
  rentalMode: RentalMode;
  /** Khối chen giữa lịch và hàng chủ xe — dòng tổng ở hộp "Đã gửi", ước tính giao xe ở màn Xem lại. */
  children?: ReactNode;
  /** `review` = màn Xem lại (ảnh lớn, Figma `21850:69704`); mặc định `receipt` (hộp "Đã gửi"). */
  variant?: 'receipt' | 'review';
  /** Hành động đầu thẻ — "Chỉnh sửa" của màn Xem lại. */
  action?: ReactNode;
  showMileage?: boolean;
}) {
  const driverPickupAddress = useAddressPreview(
    values.pickupProvinceCode,
    values.pickupWardCode,
    values.pickupAddressLine,
  );
  const deliveryAddress = useAddressPreview(
    values.deliveryProvinceCode,
    values.deliveryWardCode,
    values.deliveryAddressLine,
  );
  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const specificDate =
    values.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && values.requestedPickupDate
      ? values.requestedPickupDate
      : null;
  const expectedReturn =
    longTerm && specificDate && values.longTermPackageMonths
      ? longTermReturnFromWallClock(dayjs(specificDate), values.longTermPackageMonths)
      : null;

  const trip: BookingTrip = {
    serviceType: values.serviceType,
    routeType: values.routeType ?? ROUTE_TYPE.IN_CITY,
    rentalMode,
    pickupAt: values.pickupAt ? toAppTz(values.pickupAt) : null,
    returnAt: values.returnAt ? toAppTz(values.returnAt) : null,
    packageMonths: values.longTermPackageMonths ?? null,
    pickupPreference: values.pickupPreference ?? PICKUP_PREFERENCE.WITHIN_7_DAYS,
    requestedPickupDate: specificDate,
    expectedReturnDate: expectedReturn ? dayjs(expectedReturn).format(DAY_PARAM_FORMAT) : null,
    isDelivery: Boolean(values.deliveryRequested),
    deliveryAddress: deliveryAddress ?? null,
    driverPickupAddress: driverPickupAddress ?? null,
    destination: values.destination || null,
  };

  return (
    <BookingTripCardView
      listing={listing}
      vehicleName={listing.name}
      vehicleImageUrl={listing.mainImageUrl ?? null}
      trip={trip}
      variant={variant}
      {...(action ? { action } : {})}
      showMileage={showMileage}
    >
      {children}
    </BookingTripCardView>
  );
}

/**
 * Thân thẻ chuyến — MỘT bản cho hộp "Đã gửi yêu cầu" của khách và màn Xem lại / hộp kết quả của
 * luồng ĐẶT HỘ (gian hàng lập đơn tay, web `StaffBookingReviewStep`), như `BookingTripCard` web.
 */
export function BookingTripCardView({
  listing,
  vehicleName,
  vehicleImageUrl,
  trip,
  action,
  showMileage = false,
  showOwner = true,
  selfPickupFallback,
  variant = 'receipt',
  children,
}: {
  /** `null` = xe nội bộ (chưa lên chợ) — tên + ảnh lấy từ `vehicleName`/`vehicleImageUrl`. */
  listing: PublicListingDetail | null;
  vehicleName: string;
  vehicleImageUrl: string | null;
  trip: BookingTrip;
  /** Hành động ở đầu thẻ — "Chỉnh sửa" của màn Xem lại. */
  action?: ReactNode;
  /** Nhắc HẠN MỨC QUÃNG ĐƯỜNG — chỉ trước khi gửi/tạo. */
  showMileage?: boolean;
  /**
   * Hàng chủ xe (avatar + tên) — `false` ở luồng đặt hộ: người đang xem CHÍNH LÀ chủ xe. Dòng tóm
   * tắt dịch vụ · thời lượng vẫn ở lại.
   */
  showOwner?: boolean;
  /** Câu thay cho điểm nhận xe khi không có tin đăng — xe nội bộ của luồng đặt hộ. */
  selfPickupFallback?: string;
  /**
   * Bố cục — web `variant`: `receipt` (hộp kết quả: ảnh nhỏ cạnh tên, tiêu đề có gạch dưới) hoặc
   * `review` (màn Xem lại: ảnh lớn hết bề rộng, một cột).
   */
  variant?: 'receipt' | 'review';
  children?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const tCard = useTranslations('Listings.card');
  const fmt = useAppFormat();
  const specs = useListingSpecSummary(listing).join(LIST_SEPARATOR);

  const longTerm = trip.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const name = listing?.name ?? vehicleName;
  const image = listing?.mainImageUrl ?? vehicleImageUrl;
  const owner =
    showOwner && listing
      ? {
          name: listing.shopName,
          logoUrl: listing.shopLogoUrl ?? null,
          verified: listing.shopVerified ?? false,
        }
      : null;

  /* ── Mốc thời gian: dài hạn là GÓI + nguyện vọng, không phải một lịch đã chốt (ADR 0011) ── */
  const window = longTermPickupWindow(new Date());
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
  const packageRow = {
    key: 'package',
    label: t('reviewPage.trip.package'),
    value: fmt.packageLabel(trip.packageMonths) ?? '—',
  };
  const timeRows: Array<{ key: string; label: string; value: string }> = !longTerm
    ? exactRows
    : trip.scheduleFixed
      ? [packageRow, ...exactRows]
      : [
          packageRow,
          {
            key: 'wish',
            label: t('reviewPage.trip.pickupWish'),
            // Câu nguyện vọng DÙNG CHUNG mọi bề mặt dài hạn (`fmt.pickupWish`), như web.
            value: fmt.pickupWish({
              pickupPreference: trip.pickupPreference,
              requestedPickupDate: trip.requestedPickupDate,
              pickupWindowStartDate: window?.start ?? null,
              pickupWindowEndDate: window?.end ?? null,
            }),
          },
          ...(trip.expectedReturnDate
            ? [
                {
                  key: 'expectedReturn',
                  label: t('reviewPage.trip.expectedReturn'),
                  value: t('review.expectedReturnValue', {
                    date: fmt.dateKey(trip.expectedReturnDate),
                  }),
                },
              ]
            : []),
        ];

  /* ── Nơi nhận xe: ba hình thức loại trừ nhau ─────────────────────────────────────────────── */
  const pickupPoint = listing?.pickupPoint ?? null;
  const pickupPointText = pickupPoint ? formatPickupPoint(pickupPoint) : '';
  const placeRows: Array<{ key: string; icon: IoniconName; title: string; body: string }> =
    withDriver
      ? [
          {
            key: 'driverPickup',
            icon: 'location-outline',
            title: t('reviewPage.trip.driverPickup'),
            body: trip.driverPickupAddress ?? '—',
          },
          ...(trip.routeType !== ROUTE_TYPE.IN_CITY && trip.destination
            ? [
                {
                  key: 'destination',
                  icon: 'flag-outline' as const,
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
              icon: 'location-outline',
              title: t('reviewPage.trip.delivery'),
              body: trip.deliveryAddress ?? '—',
            },
          ]
        : [
            {
              key: 'self',
              icon: 'location-outline',
              title: t('reviewPage.trip.selfPickup'),
              body:
                pickupPointText || (selfPickupFallback ?? t('reviewPage.trip.selfPickupPending')),
            },
          ];
  /* Cùng hàm `SettlementService` dùng lúc quyết toán, để cổng công bố và cổng thu tiền không lệch. */
  if (showMileage && appliesExcessMileage(trip.serviceType) && listing?.mileagePolicy) {
    placeRows.push({
      key: 'mileage',
      icon: 'speedometer-outline',
      title: t('review.mileage'),
      body: t('review.mileageValue', {
        km: fmt.km(listing.mileagePolicy.includedKmPerDay),
        fee: fmt.money(listing.mileagePolicy.excessFeePerKm),
      }),
    });
  }

  const serviceText = longTerm
    ? dl('serviceType', trip.serviceType)
    : withDriver
      ? `${dl('serviceType', trip.serviceType)}${LIST_SEPARATOR}${dl('routeType', trip.routeType)}`
      : trip.rentalMode === RENTAL_MODE.HOURLY
        ? t('time.modeHourly')
        : t('time.modeDaily');
  const durationText = longTerm
    ? fmt.packageLabel(trip.packageMonths)
    : trip.pickupAt && trip.returnAt
      ? fmt.rentalDuration(trip.pickupAt, trip.returnAt)
      : null;

  const review = variant === 'review';

  return (
    // `.card` — viền 1px `color-border`, bo `radius-card`, nền `bg-container`, các khối cách `space-md`.
    <Card>
      <YStack gap={space.md}>
        {/*
          `.head` — tiêu đề body-lg semibold + hành động ("Chỉnh sửa"). Bố cục `receipt` thêm gạch
          dưới 1px `color-border` và đệm dưới `space-12`; `review` thì không.
        */}
        <XStack
          ai="center"
          jc="space-between"
          gap={space.md}
          {...(review
            ? {}
            : { pb: GAP_12, borderBottomWidth: 1, borderBottomColor: colors.border })}
        >
          <Text
            f={1}
            col={colors.text}
            fos={fontSize.bodyLg}
            fow={fontWeight.semibold}
            accessibilityRole="header"
          >
            {t('reviewPage.trip.title')}
          </Text>
          {action}
        </XStack>

        {review ? (
          /*
            `.review .vehicle` ở thẻ hẹp (≤600px): MỘT cột — ảnh rộng hết thẻ tỉ lệ 285/160, bo
            `radius-card`; dưới nó tên h3 semibold + thông số body `text-secondary`, căn giữa,
            đệm dọc `space-12` (`.vehicleInfo`).
          */
          <YStack>
            {image ? (
              <Image
                source={{ uri: image }}
                style={REVIEW_PHOTO}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityLabel={name}
              />
            ) : (
              <YStack style={REVIEW_PHOTO} bg={colors.surfaceMuted} />
            )}
            <YStack ai="center" gap={space.xs} py={GAP_12}>
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} ta="center">
                {name}
              </Text>
              {specs ? (
                <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                  {specs}
                </Text>
              ) : null}
            </YStack>
          </YStack>
        ) : (
          /*
            `.receipt .vehicle` — ảnh nhỏ cạnh tên, cách `space-12`. Thẻ ≤420px: ảnh 96 rộng, tỉ lệ
            135/76, bo `radius-control`; tên h3 semibold, thông số body `text-secondary`, căn trái.
          */
          <XStack ai="center" gap={GAP_12}>
            {image ? (
              <Image
                source={{ uri: image }}
                style={RECEIPT_PHOTO}
                contentFit="cover"
                cachePolicy="memory-disk"
                accessibilityLabel={name}
              />
            ) : (
              <YStack style={RECEIPT_PHOTO} bg={colors.surfaceMuted} />
            )}
            <YStack f={1} minWidth={0} gap={space.xs} py={GAP_12}>
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold}>
                {name}
              </Text>
              {specs ? (
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {specs}
                </Text>
              ) : null}
            </YStack>
          </XStack>
        )}

        {/*
          `.schedule` — khung nền `color-bg` (BG/gray-50), đệm `space-md`, bo `radius-card`, các dòng
          cách `space-12`. Thẻ hẹp: nhận/trả xếp dọc (`.times` một cột ở ≤420px).
        */}
        <YStack gap={GAP_12} p={space.md} br={radius.card} bg={colors.background}>
          {timeRows.map((row) => (
            <ScheduleRow key={row.key} icon="calendar-outline" label={row.label} value={row.value} />
          ))}
          {placeRows.map((row) => (
            <ScheduleRow key={row.key} icon={row.icon} label={row.title} value={row.body} place />
          ))}
        </YStack>

        {children}

        {/* `.divider` — 1px `color-border`. */}
        <YStack h={1} bg={colors.border} />
        {/* `.ownerRow` — chủ xe bên trái, tóm tắt dịch vụ · thời lượng bên phải; xuống dòng khi hẹp, khe `space-12`. */}
        <XStack ai="center" jc="space-between" gap={GAP_12} flexWrap="wrap">
          {owner ? (
            <XStack ai="center" gap={GAP_12} flexShrink={1}>
              {/*
                Khối chủ xe CÙNG kiểu thẻ xe (người dùng chốt 28/10/2026): avatar + dấu xác minh
                (gian hàng tuyến gói), nhãn "Gian hàng" / "Chủ xe", tên gian hàng màu `primary-hover`.
              */}
              <HomeCardAvatar
                name={owner.name}
                url={owner.logoUrl}
                size={32}
                verified={owner.verified}
                markDisc={12}
                markIcon={9}
              />
              <YStack flexShrink={1}>
                <Text col={colors.placeholder} fos={fontSize.bodySm}>
                  {tCard(owner.verified ? 'shop' : 'owner')}
                </Text>
                <Text
                  col={owner.verified ? colors.primaryHover : colors.textMuted}
                  fos={fontSize.body}
                  fow={fontWeight.medium}
                >
                  {owner.name}
                </Text>
              </YStack>
            </XStack>
          ) : null}
          {/* `.tripSummary` — body semibold `color-primary-hover` (Text/Brand/primary 2). */}
          {/* Mỗi hàng MỘT giá trị: "Thuê theo ngày" / "1 ngày" — không nối " · " (28/10/2026). */}
          <YStack ai="flex-end">
            <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.semibold} ta="right">
              {serviceText}
            </Text>
            {durationText ? (
              <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.semibold} ta="right">
                {durationText}
              </Text>
            ) : null}
          </YStack>
        </XStack>
      </YStack>
    </Card>
  );
}

/**
 * Một dòng lịch/địa điểm — web `.scheduleRow`: ô tròn 36 nền `bg-selected`, icon `color-primary`,
 * khe `space-12` (dòng địa điểm: khe `space-sm`, icon bám dòng đầu).
 *
 * Chữ (Figma `Date details`): mốc thời gian — nhãn `label` `text-tertiary`, giá trị body semibold
 * `color-text`; địa điểm — tiêu đề body-sm semibold `color-text`, thân body `text-secondary`. Khe 2.
 */
function ScheduleRow({
  icon,
  label,
  value,
  place = false,
}: {
  icon: IoniconName;
  label: string;
  value: string;
  /** Dòng địa điểm: nhãn đậm, giá trị thường (`.placeTitle`/`.placeBody`). */
  place?: boolean;
}) {
  const colors = useColors();
  return (
    <XStack ai={place ? 'flex-start' : 'center'} gap={place ? space.sm : GAP_12}>
      <YStack
        w={SCHEDULE_ICON_SIZE}
        h={SCHEDULE_ICON_SIZE}
        br={radius.pill}
        ai="center"
        jc="center"
        bg={colors.surfaceSelected}
        accessibilityElementsHidden
        importantForAccessibility="no-hide-descendants"
      >
        <Ionicons name={icon} size={iconSize.md} color={colors.primary} />
      </YStack>
      <YStack f={1} minWidth={0} gap={2}>
        {place ? (
          <>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {label}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {value}
            </Text>
          </>
        ) : (
          <>
            <Text col={colors.placeholder} fos={fontSize.label}>
              {label}
            </Text>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {value}
            </Text>
          </>
        )}
      </YStack>
    </XStack>
  );
}
