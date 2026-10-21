import type { ComponentProps, ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PICKUP_PREFERENCE,
  RENTAL_MODE,
  ROUTE_TYPE,
  SERVICE_TYPE,
  longTermPickupWindow,
  type PublicListingDetail,
} from '@xeprime/types';
import {
  dayjs,
  DAY_PARAM_FORMAT,
  LIST_SEPARATOR,
  longTermReturnFromWallClock,
  type RentalMode,
} from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { useAddressPreview } from '@/features/locations/hooks/use-address-preview';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { BookingRequestFormValues } from '../booking-schema';
import { useListingSpecSummary } from '../hooks/use-listing-spec-summary';

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Ảnh xe nhỏ cạnh tên — bố cục `receipt` của `BookingTripCard` web (Figma `19759:22185`). */
const RECEIPT_PHOTO = { width: 96, height: 64, borderRadius: radius.md } as const;
/** Ô tròn icon của một dòng lịch/địa điểm (`.scheduleIcon` web). */
const SCHEDULE_ICON_SIZE = 36;

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
}: {
  listing: PublicListingDetail;
  values: BookingRequestFormValues;
  rentalMode: RentalMode;
  /** Khối chen giữa lịch và hàng chủ xe — dòng tổng ở hộp "Đã gửi". */
  children?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const specs = useListingSpecSummary(listing).join(LIST_SEPARATOR);

  const longTerm = values.serviceType === SERVICE_TYPE.LONG_TERM;
  const withDriver = values.serviceType === SERVICE_TYPE.WITH_DRIVER;
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

  /* ── Mốc thời gian: dài hạn là GÓI + nguyện vọng, không phải một lịch đã chốt (ADR 0011) ── */
  const specificDate =
    values.pickupPreference === PICKUP_PREFERENCE.SPECIFIC_DATE && values.requestedPickupDate
      ? values.requestedPickupDate
      : null;
  const window = longTermPickupWindow(new Date());
  const expectedReturn =
    longTerm && specificDate && values.longTermPackageMonths
      ? longTermReturnFromWallClock(dayjs(specificDate), values.longTermPackageMonths)
      : null;
  const timeRows: Array<{ key: string; label: string; value: string }> = longTerm
    ? [
        {
          key: 'package',
          label: t('reviewPage.trip.package'),
          value: fmt.packageLabel(values.longTermPackageMonths) ?? '—',
        },
        {
          key: 'wish',
          label: t('reviewPage.trip.pickupWish'),
          // Câu nguyện vọng DÙNG CHUNG mọi bề mặt dài hạn (`fmt.pickupWish`), như web.
          value: fmt.pickupWish({
            pickupPreference: values.pickupPreference,
            requestedPickupDate: specificDate,
            pickupWindowStartDate: window?.start ?? null,
            pickupWindowEndDate: window?.end ?? null,
          }),
        },
        ...(expectedReturn
          ? [
              {
                key: 'expectedReturn',
                label: t('reviewPage.trip.expectedReturn'),
                value: t('review.expectedReturnValue', {
                  date: fmt.dateKey(dayjs(expectedReturn).format(DAY_PARAM_FORMAT)),
                }),
              },
            ]
          : []),
      ]
    : [
        {
          key: 'pickup',
          label: t('reviewPage.trip.pickupAt'),
          value: values.pickupAt ? fmt.dateTime(values.pickupAt) : '—',
        },
        {
          key: 'return',
          label: t('reviewPage.trip.returnAt'),
          value: values.returnAt ? fmt.dateTime(values.returnAt) : '—',
        },
      ];

  /* ── Nơi nhận xe: ba hình thức loại trừ nhau ─────────────────────────────────────────────── */
  const pickupPoint = listing.pickupPoint ?? null;
  const placeRows: Array<{ key: string; icon: IoniconName; title: string; body: string }> =
    withDriver
      ? [
          {
            key: 'driverPickup',
            icon: 'location-outline',
            title: t('reviewPage.trip.driverPickup'),
            body: driverPickupAddress ?? '—',
          },
          ...(values.routeType !== ROUTE_TYPE.IN_CITY && values.destination
            ? [
                {
                  key: 'destination',
                  icon: 'flag-outline' as const,
                  title: t('reviewPage.trip.destination'),
                  body: values.destination,
                },
              ]
            : []),
        ]
      : values.deliveryRequested
        ? [
            {
              key: 'delivery',
              icon: 'location-outline',
              title: t('reviewPage.trip.delivery'),
              body: deliveryAddress ?? '—',
            },
          ]
        : [
            {
              key: 'self',
              icon: 'location-outline',
              title: t('reviewPage.trip.selfPickup'),
              body: pickupPoint
                ? [pickupPoint.branchName, pickupPoint.address].filter(Boolean).join(LIST_SEPARATOR) ||
                  t('reviewPage.trip.selfPickupPending')
                : t('reviewPage.trip.selfPickupPending'),
            },
          ];

  const serviceText = longTerm
    ? dl('serviceType', values.serviceType)
    : withDriver
      ? `${dl('serviceType', values.serviceType)}${LIST_SEPARATOR}${dl('routeType', values.routeType)}`
      : rentalMode === RENTAL_MODE.HOURLY
        ? t('time.modeHourly')
        : t('time.modeDaily');
  const durationText = longTerm
    ? fmt.packageLabel(values.longTermPackageMonths)
    : values.pickupAt && values.returnAt
      ? fmt.rentalDuration(dayjs(values.pickupAt), dayjs(values.returnAt))
      : null;

  return (
    <Card>
      <YStack gap={space.md}>
        <Text
          col={colors.text}
          fos={fontSize.h4}
          fow={fontWeight.semibold}
          accessibilityRole="header"
          pb={space.sm}
          borderBottomWidth={1}
          borderBottomColor={colors.borderSubtle}
        >
          {t('reviewPage.trip.title')}
        </Text>

        <XStack ai="center" gap={space.md}>
          {listing.mainImageUrl ? (
            <Image
              source={{ uri: listing.mainImageUrl }}
              style={RECEIPT_PHOTO}
              contentFit="cover"
              cachePolicy="memory-disk"
              accessibilityLabel={listing.name}
            />
          ) : (
            <YStack style={RECEIPT_PHOTO} bg={colors.surfaceMuted} />
          )}
          <YStack f={1} gap={space.xs}>
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
              {listing.name}
            </Text>
            {specs ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {specs}
              </Text>
            ) : null}
          </YStack>
        </XStack>

        <YStack gap={space.md} p={space.md} br={radius.lg} bg={colors.background}>
          {timeRows.map((row) => (
            <ScheduleRow key={row.key} icon="calendar-outline" label={row.label} value={row.value} />
          ))}
          {placeRows.map((row) => (
            <ScheduleRow key={row.key} icon={row.icon} label={row.title} value={row.body} place />
          ))}
        </YStack>

        {children}

        <YStack h={1} bg={colors.border} />
        <XStack ai="center" jc="space-between" gap={space.md} flexWrap="wrap">
          <XStack ai="center" gap={space.md} flexShrink={1}>
            <Avatar name={listing.shopName} url={listing.shopLogoUrl ?? null} size={32} />
            <YStack flexShrink={1}>
              <Text col={colors.placeholder} fos={fontSize.bodySm}>
                {t('reviewPage.trip.owner')}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.body} fow={fontWeight.medium}>
                {listing.shopName}
              </Text>
            </YStack>
          </XStack>
          <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.semibold}>
            {durationText
              ? t('reviewPage.trip.summary', { service: serviceText, duration: durationText })
              : serviceText}
          </Text>
        </XStack>
      </YStack>
    </Card>
  );
}

/** Một dòng lịch/địa điểm — ô tròn icon vàng nhạt + nhãn + giá trị (`.scheduleRow` web). */
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
    <XStack ai={place ? 'flex-start' : 'center'} gap={space.md}>
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
      <YStack f={1} gap={space.xs}>
        <Text
          col={place ? colors.text : colors.placeholder}
          fos={fontSize.body}
          fow={place ? fontWeight.semibold : fontWeight.regular}
        >
          {label}
        </Text>
        <Text
          col={place ? colors.textMuted : colors.text}
          fos={fontSize.bodyLg}
          fow={place ? fontWeight.regular : fontWeight.semibold}
        >
          {value}
        </Text>
      </YStack>
    </XStack>
  );
}
