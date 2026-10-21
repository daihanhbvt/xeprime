import type { ComponentProps, ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  ROUTE_TYPE,
  SERVICE_TYPE,
  SUPPORT_HOTLINE,
  canCustomerCancelTrip,
  isSameVnPhone,
  serviceRequiresDriverLicence,
  type PublicListingDetail,
} from '@xeprime/types';
import { dayjs, LEGAL_DOC, LIST_SEPARATOR, longTermReturnFromWallClock } from '@xeprime/domain';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import {
  BookingReviewCosts,
  type ReviewCostsBreakdown,
} from '@/features/booking-requests/components/BookingReviewCosts';
import { useListingSpecSummary } from '@/features/booking-requests/hooks/use-listing-spec-summary';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useDriverLicence } from '@/features/driver-licence/hooks/use-driver-licence';
import { useOpenLegalDoc } from '@/features/legal/use-open-legal-doc';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { images } from '@/assets';
import { mixHex } from '@/theme/color-mix';
import { themed, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { tripRequestSteps, type TripRequestStep } from '../trip-flow';

/**
 * Các thẻ dùng chung của ba màn chuyến phía khách theo design v2 — bản native của
 * `TripRequestLayout` + `TripRequestProgress` bên web (PR #207). Web xếp hai cột; trên điện thoại
 * chúng đứng MỘT cột theo đúng thứ tự DOM của web (cột trái rồi cột phải).
 *
 * Mỗi thẻ là một khối riêng ở đây một lần — ba màn chép lại sẽ trôi khỏi nhau ngay lần sửa đầu.
 */

/** Sắc thái nhãn viên thuốc — đúng bốn màu thiết kế dùng. */
export type TripRequestTone = 'warning' | 'success' | 'primary' | 'info';

/*
 * Viền = màu chữ trộn 45% vào nền thẻ — đúng phép `color-mix(… 45%, bg-container)` của web, nên tự
 * tối theo nền ở giao diện tối.
 */
const usePillSkin = themed<Record<TripRequestTone, { bg: string; fg: string; border: string }>>(
  (colors) => {
    const skin = (bg: string, fg: string) => ({ bg, fg, border: mixHex(fg, colors.surface, 0.45) });
    return {
      warning: skin(colors.warningSurface, colors.warning),
      success: skin(colors.successSurface, colors.success),
      primary: skin(colors.primaryLight, colors.primaryStrong),
      info: skin(colors.infoSurface, colors.info),
    };
  },
);

/**
 * Nhãn viên thuốc (Figma "Request status": đệm 2/8, viền 1px, bo 16, chữ 14 Medium) — trạng thái
 * yêu cầu, tình trạng khoản giữ chỗ. Cùng khuôn `.pill` của web.
 */
export function TripRequestPill({ tone, children }: { tone: TripRequestTone; children: string }) {
  const PILL_SKIN = usePillSkin();
  const skin = PILL_SKIN[tone];
  return (
    <XStack
      alignSelf="flex-start"
      bg={skin.bg}
      bw={1}
      bc={skin.border}
      br={radius.lg}
      px={space.sm}
      py={2}
    >
      <Text col={skin.fg} fos={fontSize.body} fow={fontWeight.medium}>
        {children}
      </Text>
    </XStack>
  );
}

/** Tiêu đề thẻ — `.cardTitle` web (18 Semibold), cùng cỡ cho mọi thẻ để chúng đọc thành một bộ. */
export function CardTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} accessibilityRole="header">
      {children}
    </Text>
  );
}

/** Câu dẫn của thẻ — `.cardLead` web (14, `Text/tertiary`). */
export function CardLead({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.placeholder} fos={fontSize.body}>
      {children}
    </Text>
  );
}

/**
 * Đầu trang của các màn chuyến — bản native của `TripPageHeader` web: đường dẫn "Trang chủ / … /
 * trang hiện tại" (mắt cuối tô vàng), tiêu đề trang (24 Semibold) + câu dẫn, và tiến trình hành
 * trình ngay dưới. Nút lui nằm ở thanh trên của app nên đường dẫn không lặp lại nó.
 */
export function TripPageHeading({
  crumbs,
  title,
  description,
  aside,
  badge,
}: {
  /** Các mắt SAU "Trang chủ"; mắt cuối là trang đang đứng. */
  crumbs?: ReadonlyArray<{ key: string; label: string; onPress?: () => void }>;
  title: string;
  description?: string;
  /** Tiến trình hành trình — `BookingJourney variant="inline"`. */
  aside?: ReactNode;
  /** Nhãn trạng thái cạnh tiêu đề — bố cục chung (`StatusTag` web). */
  badge?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.pageHeader');
  const navigateOnce = useNavigateOnce();
  const trail = crumbs
    ? [
        { key: 'home', label: t('home'), onPress: () => navigateOnce(ROUTES.explore.home()) },
        ...crumbs,
      ]
    : [];

  return (
    <YStack gap={space.md}>
      {trail.length > 0 ? (
        <XStack
          flexWrap="wrap"
          ai="center"
          accessibilityRole="summary"
          accessibilityLabel={t('breadcrumbLabel')}
        >
          {trail.map((crumb, index) => {
            const last = index === trail.length - 1;
            return (
              <XStack key={crumb.key} ai="center">
                {index > 0 ? (
                  <Text col={colors.placeholder} fos={fontSize.body} px={space.xs}>
                    /
                  </Text>
                ) : null}
                <Text
                  col={last ? colors.primaryHover : colors.placeholder}
                  fos={fontSize.body}
                  fow={last ? fontWeight.medium : fontWeight.regular}
                  accessibilityRole={!last && crumb.onPress ? 'link' : undefined}
                  onPress={!last ? crumb.onPress : undefined}
                >
                  {crumb.label}
                </Text>
              </XStack>
            );
          })}
        </XStack>
      ) : null}
      <YStack gap={space.sm}>
        <XStack ai="flex-start" gap={space.sm}>
          <YStack f={1} gap={2}>
            <Text
              col={colors.text}
              fos={fontSize.h2}
              fow={fontWeight.semibold}
              accessibilityRole="header"
            >
              {title}
            </Text>
            {description ? (
              <Text col={colors.placeholder} fos={fontSize.body}>
                {description}
              </Text>
            ) : null}
          </YStack>
          {badge ? <XStack pt={space.xs}>{badge}</XStack> : null}
        </XStack>
        {aside}
      </YStack>
    </YStack>
  );
}

/** "Chi tiết xe / Gửi yêu cầu thuê xe" — `useTripFlowCrumbs` web. */
export function useTripFlowCrumbs(vehicleId: string) {
  const t = useTranslations('Trips.pageHeader');
  const navigateOnce = useNavigateOnce();
  return [
    {
      key: 'vehicle',
      label: t('vehicle'),
      onPress: () => navigateOnce(ROUTES.explore.listingDetail(vehicleId)),
    },
    { key: 'request', label: t('request') },
  ];
}

/**
 * Thẻ trạng thái đầu màn: huy hiệu + nhãn chặng + tiêu đề + một câu giải thích, và chỗ cho phần
 * riêng của từng màn (đồng hồ hạn phản hồi, lời nhắc, lối "Xem hướng dẫn nhận xe").
 *
 * `variant="confirmed"` — chuyến đã xác nhận (Figma `19759:40235`): nền success nhạt, viền NÉT ĐỨT
 * xanh. Huy hiệu là TRANG TRÍ (web dùng ảnh `request-sent.webp`; app chưa có ảnh đó nên dùng biểu
 * tượng cùng nghĩa) — tiêu đề ngay cạnh đã nói đúng điều nó nói.
 */
const STATUS_BADGE_STYLE = { width: 48, height: 48 } as const;

export function TripRequestStatusCard({
  tag,
  tone,
  title,
  body,
  variant = 'default',
  children,
}: {
  /** Nhãn CHẶNG — cùng từ vựng với danh sách chuyến (`Domain`, ADR 0005). */
  tag: string;
  tone: TripRequestTone;
  title: string;
  body: string;
  variant?: 'default' | 'confirmed';
  children?: ReactNode;
}) {
  const colors = useColors();
  const confirmed = variant === 'confirmed';
  return (
    <YStack
      gap={space.md}
      p={space.md}
      br={radius.lg}
      bw={1}
      borderStyle={confirmed ? 'dashed' : 'solid'}
      bc={confirmed ? colors.success : colors.border}
      bg={confirmed ? colors.successSurface : colors.surface}
    >
      <XStack ai="center" gap={space.md}>
        {/* Huy hiệu TRANG TRÍ — cùng ảnh `request-sent.webp` web dùng cho cả ba màn. */}
        <Image
          source={images.bookingRequestSent}
          style={STATUS_BADGE_STYLE}
          contentFit="contain"
          accessible={false}
        />
        <YStack f={1} gap={space.sm}>
          <TripRequestPill tone={tone}>{tag}</TripRequestPill>
          <Text
            col={colors.text}
            fos={fontSize.h3}
            fow={fontWeight.semibold}
            accessibilityRole="header"
          >
            {title}
          </Text>
        </YStack>
      </XStack>
      <CardLead>{body}</CardLead>
      {children}
    </YStack>
  );
}

/**
 * "Tiến trình yêu cầu" — các mốc xếp DỌC, mỗi mốc một tiêu đề + một câu. Luật mốc ở
 * `tripRequestSteps` (thuần, có test). Trạng thái từng mốc đọc được bằng trình đọc màn hình, không
 * chỉ bằng màu của chấm.
 */
export function TripRequestProgress({
  current,
  hasHoldStage,
}: {
  current: TripRequestStep;
  hasHoldStage: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.requestProgress');
  const steps = tripRequestSteps(current, hasHoldStage);

  return (
    <Card>
      <YStack gap={space.md}>
        <CardTitle>{t('title')}</CardTitle>
        <YStack gap={space.md}>
          {steps.map(({ step, state }) => (
            <XStack
              key={step}
              ai="flex-start"
              gap={space.sm}
              accessible
              accessibilityLabel={`${t(`steps.${step}.title`)} — ${t(`state.${state}`)}`}
              accessibilityState={{ selected: state === 'current' }}
            >
              <YStack
                w={22}
                h={22}
                br={radius.pill}
                ai="center"
                jc="center"
                bw={state === 'todo' ? 1 : state === 'current' ? 2 : 0}
                bc={state === 'current' ? colors.primary : colors.border}
                bg={
                  state === 'done'
                    ? colors.primary
                    : state === 'current'
                      ? colors.primaryLight
                      : colors.surface
                }
              >
                {state === 'done' ? (
                  <Ionicons name="checkmark" size={iconSize.xs} color={colors.onPrimary} />
                ) : (
                  <YStack
                    w={8}
                    h={8}
                    br={radius.pill}
                    bg={state === 'current' ? colors.primary : colors.border}
                  />
                )}
              </YStack>
              <YStack f={1} gap={2}>
                <Text
                  col={state === 'todo' ? colors.textMuted : colors.text}
                  fos={fontSize.bodySm}
                  fow={fontWeight.semibold}
                >
                  {t(`steps.${step}.title`)}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {/*
                    Mốc giữ chỗ nhìn từ TRƯỚC nói điều kiện; khi khách đã đứng ở đó thì điều kiện đã
                    thoả — câu phải nói việc cần làm ngay. Cùng nhánh với web.
                  */}
                  {step === 'hold' && state === 'current'
                    ? t('steps.hold.bodyCurrent')
                    : t(`steps.${step}.body`)}
                </Text>
              </YStack>
            </XStack>
          ))}
        </YStack>
      </YStack>
    </Card>
  );
}

/** Ảnh xe — tỉ lệ 285:160 của `BookingTripCard` web, bo 16. */
const VEHICLE_PHOTO_STYLE = {
  width: '100%',
  aspectRatio: 285 / 160,
  borderRadius: radius.lg,
} as const;

type IoniconName = ComponentProps<typeof Ionicons>['name'];

/** Một dòng lịch/địa điểm của thẻ chuyến — ô tròn icon vàng nhạt 36 + nhãn + giá trị (`.scheduleRow` web). */
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
    <XStack ai={place ? 'flex-start' : 'center'} gap={place ? space.sm : space.md}>
      <YStack
        w={36}
        h={36}
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

/**
 * "Thông tin chuyến đi" của chuyến đã gửi — bản native của `BookingTripCard` (bố cục `review`) mà
 * web dùng lại ở màn chuyến: tiêu đề → ảnh bo góc → tên xe + thông số căn giữa → khối lịch (nền
 * trang, các dòng có icon) → vạch → chủ xe (avatar · "Chủ xe" · tên) + tóm tắt "dịch vụ · thời lượng".
 *
 * Điểm nhận xe đọc từ TIN ĐĂNG (chuyến không chép nó lúc gửi); tin đã ẩn/gỡ thì rơi về câu "chủ xe
 * gửi địa chỉ khi xác nhận". Biển số (chỉ có sau khi chủ xe nhận chuyến) đứng dưới thông số.
 */
export function TripRequestTripCard({
  trip,
  listing,
  ownerAction,
}: {
  trip: CustomerTripDetail;
  listing: PublicListingDetail | null;
  /** Lối liên hệ cạnh tên chủ xe — chỉ màn chuyến đã xác nhận có. */
  ownerAction?: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const navigateOnce = useNavigateOnce();
  const { vehicle } = trip;
  const withDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const longTerm = trip.serviceType === SERVICE_TYPE.LONG_TERM;

  const specs = useListingSpecSummary(vehicle).join(LIST_SEPARATOR);
  const name = listing?.name ?? vehicle.name;
  const image = listing?.mainImageUrl ?? vehicle.imageUrl ?? null;
  const ownerLogo = listing?.shopLogoUrl ?? null;

  const pickupAt = trip.pickupAt ? dayjs(trip.pickupAt) : null;
  const returnAt = trip.returnAt ? dayjs(trip.returnAt) : null;
  const packageMonths = trip.longTermPackageMonths ?? null;
  const requestedPickup = trip.requestedPickupDate ? dayjs(trip.requestedPickupDate) : null;
  // Ngày trả DỰ KIẾN = ngày nhận mong muốn + N tháng LỊCH — hàm duy nhất được phép suy (ADR 0011).
  const expectedReturn =
    longTerm && packageMonths != null && requestedPickup
      ? longTermReturnFromWallClock(requestedPickup, packageMonths)
      : null;

  const timeRows: Array<{ key: string; label: string; value: string }> = longTerm
    ? [
        {
          key: 'package',
          label: t('reviewPage.trip.package'),
          value: fmt.packageLabel(packageMonths) ?? '—',
        },
        { key: 'wish', label: t('reviewPage.trip.pickupWish'), value: fmt.pickupWish(trip) },
        ...(expectedReturn
          ? [
              {
                key: 'expectedReturn',
                label: t('reviewPage.trip.expectedReturn'),
                value: t('review.expectedReturnValue', {
                  date: fmt.dateKey(dayjs(expectedReturn).format('YYYY-MM-DD')),
                }),
              },
            ]
          : []),
      ]
    : [
        {
          key: 'pickup',
          label: t('reviewPage.trip.pickupAt'),
          value: trip.pickupAt ? fmt.dateTime(trip.pickupAt) : '—',
        },
        {
          key: 'return',
          label: t('reviewPage.trip.returnAt'),
          value: trip.returnAt ? fmt.dateTime(trip.returnAt) : '—',
        },
      ];

  const selfPickup = listing?.pickupPoint
    ? [listing.pickupPoint.branchName, listing.pickupPoint.address]
        .filter(Boolean)
        .join(LIST_SEPARATOR) || t('reviewPage.trip.selfPickupPending')
    : t('reviewPage.trip.selfPickupPending');
  const placeRows: Array<{ key: string; icon: IoniconName; label: string; value: string }> =
    withDriver
      ? [
          {
            key: 'driverPickup',
            icon: 'location-outline',
            label: t('reviewPage.trip.driverPickup'),
            value: trip.pickupAddress || '—',
          },
          ...(trip.routeType !== ROUTE_TYPE.IN_CITY && trip.destination
            ? [
                {
                  key: 'destination',
                  icon: 'flag-outline' as const,
                  label: t('reviewPage.trip.destination'),
                  value: trip.destination,
                },
              ]
            : []),
        ]
      : trip.deliveryRequested
        ? [
            {
              key: 'delivery',
              icon: 'location-outline',
              label: t('reviewPage.trip.delivery'),
              value: trip.deliveryAddress || '—',
            },
          ]
        : [
            {
              key: 'self',
              icon: 'location-outline',
              label: t('reviewPage.trip.selfPickup'),
              value: selfPickup,
            },
          ];

  // Tóm tắt "dịch vụ · thời lượng" — cùng luật `BookingTripCard` web (dưới 1 ngày = theo giờ).
  const hourly = pickupAt && returnAt ? returnAt.diff(pickupAt, 'day', true) < 1 : false;
  const serviceText = longTerm
    ? domainLabel('serviceType', trip.serviceType)
    : withDriver
      ? `${domainLabel('serviceType', trip.serviceType)}${LIST_SEPARATOR}${domainLabel('routeType', trip.routeType ?? ROUTE_TYPE.IN_CITY)}`
      : hourly
        ? t('time.modeHourly')
        : t('time.modeDaily');
  const durationText = longTerm
    ? fmt.packageLabel(packageMonths)
    : pickupAt && returnAt
      ? fmt.rentalDuration(pickupAt, returnAt)
      : null;

  return (
    <Card>
      <YStack gap={space.md}>
        <CardTitle>{t('reviewPage.trip.title')}</CardTitle>

        <YStack>
          {image ? (
            <Image
              source={{ uri: image }}
              style={VEHICLE_PHOTO_STYLE}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
              accessibilityLabel={name}
            />
          ) : (
            <YStack style={VEHICLE_PHOTO_STYLE} bg={colors.surfaceMuted} />
          )}
          <YStack ai="center" gap={space.xs} py={space.md}>
            <Pressable
              onPress={() => navigateOnce(ROUTES.explore.listingDetail(vehicle.id))}
              accessibilityRole="link"
              accessibilityLabel={name}
            >
              <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} ta="center">
                {name}
              </Text>
            </Pressable>
            {specs ? (
              <Text col={colors.textMuted} fos={fontSize.body} ta="center">
                {specs}
              </Text>
            ) : null}
            {vehicle.plateNumber ? (
              <XStack bg={colors.surfaceMuted} br={radius.sm} px={space.sm} py={2}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                  {vehicle.plateNumber}
                </Text>
              </XStack>
            ) : null}
          </YStack>

          <YStack gap={space.md} p={space.md} br={radius.lg} bg={colors.background}>
            {timeRows.map((row) => (
              <ScheduleRow
                key={row.key}
                icon="calendar-outline"
                label={row.label}
                value={row.value}
              />
            ))}
            {placeRows.map((row) => (
              <ScheduleRow key={row.key} icon={row.icon} label={row.label} value={row.value} place />
            ))}
          </YStack>
        </YStack>

        <YStack h={1} bg={colors.border} />

        {/* Tên chủ xe dẫn tới mặt tiền của họ — trang đó tự vẽ đúng mặt tiền theo tuyến (ADR 0038). */}
        <XStack ai="center" jc="space-between" gap={space.md} flexWrap="wrap">
          <XStack ai="center" gap={space.lg} flexShrink={1}>
          <Pressable
            onPress={() => navigateOnce(ROUTES.explore.shopDetail(trip.shop.slug))}
            accessibilityRole="link"
            accessibilityLabel={trip.shop.name}
          >
            <XStack ai="center" gap={space.md}>
              <Avatar name={trip.shop.name} url={ownerLogo} size={32} />
              <YStack>
                <Text col={colors.placeholder} fos={fontSize.bodySm}>
                  {t('reviewPage.trip.owner')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.body} fow={fontWeight.medium}>
                  {trip.shop.name}
                </Text>
              </YStack>
            </XStack>
          </Pressable>
          {/* Lối liên hệ — nút tròn cạnh tên chủ xe (`.circleAction` web). */}
          {ownerAction ? <XStack gap={space.sm}>{ownerAction}</XStack> : null}
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

/**
 * "Thông tin người thuê" chỉ-đọc — đúng liên hệ khách đã để lại cho CHÍNH chuyến này (`contact`,
 * ADR 0063), không phải hồ sơ tài khoản hiện tại: khách có thể đã thuê hộ người nhà. Chuyến cũ chưa
 * có `contact` thì rơi về tài khoản, cùng phép rơi của `BookingRenterCard` web.
 */
export function TripRequestRenterCard({ trip }: { trip: CustomerTripDetail }) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow.reviewPage.renter');
  const tView = useTranslations('Trips.requestView');
  const tFlow = useTranslations('BookingRequests.flow');
  const me =useCurrentUser().data ?? null;
  const contact = trip.contact ?? (me ? { name: me.displayName, phone: me.phone ?? '' } : null);

  return (
    <Card>
      <YStack gap={space.sm}>
        <CardTitle>{t('title')}</CardTitle>
        <CardLead>{t('readonlyDescription')}</CardLead>
        {contact ? (
          <>
            <DataRow label={t('name')} value={contact.name} />
            <DataRow label={t('phone')} value={contact.phone || '—'} />
            {/* Cùng `usePhoneNote` web: số TRÙNG số đã xác minh ⇒ "Đã xác thực"; KHÁC ⇒ nhắc. */}
            {me && contact.phone ? (
              isSameVnPhone(contact.phone, me.phone) ? (
                me.phoneVerified ? (
                  <XStack ai="center" gap={2} alignSelf="flex-end">
                    <Ionicons name="checkmark-circle" size={iconSize.xs} color={colors.success} />
                    <Text col={colors.success} fos={fontSize.label}>
                      {tFlow('contact.verified')}
                    </Text>
                  </XStack>
                ) : null
              ) : me.phone ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('phoneDifferent', { accountPhone: me.phone })}
                </Text>
              ) : null
            ) : null}
          </>
        ) : null}
        {me?.email ? <DataRow label={t('email')} value={me.email} /> : null}
        <YStack gap={2} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {tView('noteLabel')}
          </Text>
          <Text col={colors.text} fos={fontSize.bodySm}>
            {trip.customerNote?.trim() || '—'}
          </Text>
        </YStack>
      </YStack>
    </Card>
  );
}

/**
 * "Giấy tờ & điều kiện nhận xe" — cùng nội dung với khối đó ở màn Xem lại (`RequestReviewStep`):
 * bằng lái (dịch vụ có cần không, bằng đã xác thực của tài khoản), giấy tờ và điều khoản chủ xe
 * cho ĐÚNG dịch vụ của chuyến.
 */
export function TripRequirementsCard({
  trip,
  listing,
}: {
  trip: CustomerTripDetail;
  listing: PublicListingDetail | null;
}) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.flow.reviewPage.requirements');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const me = useCurrentUser().data ?? null;
  const required = serviceRequiresDriverLicence(trip.serviceType);
  const licenceQ = useDriverLicence({ enabled: required && me !== null });
  const verified = required ? (licenceQ.data?.verified ?? null) : null;
  const terms = listing?.rentalTerms?.find((term) => term.serviceType === trip.serviceType) ?? null;
  const documents = terms?.requiredDocuments ?? [];

  const licenceMeta = verified
    ? [
        verified.classes.length
          ? t('licenceClasses', { classes: verified.classes.join(', ') })
          : null,
        verified.noExpiry
          ? t('licenceNoExpiry')
          : verified.expiresOn
            ? t('licenceExpires', { date: fmt.dateKey(verified.expiresOn) })
            : null,
      ]
        .filter(Boolean)
        .join(LIST_SEPARATOR)
    : '';

  return (
    <Card>
      <YStack gap={space.sm}>
        <CardTitle>{t('title')}</CardTitle>
        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {required ? t('licenceTitle') : t('driverTitle')}
          </Text>
          <CardLead>{required ? t('licenceBody') : t('driverBody')}</CardLead>
        </YStack>
        {verified ? (
          <XStack
            ai="flex-start"
            gap={space.xs}
            p={space.sm}
            br={radius.md}
            bg={colors.successSurface}
          >
            <Ionicons name="checkmark-circle" size={iconSize.sm} color={colors.success} />
            <Text f={1} col={colors.text} fos={fontSize.bodySm}>
              <Text fow={fontWeight.semibold}>{t('licenceVerified')}</Text>
              {licenceMeta ? `${LIST_SEPARATOR}${licenceMeta}` : ''}
            </Text>
          </XStack>
        ) : null}
        {documents.length > 0 ? (
          <CardLead>
            {t('documents', {
              documents: documents
                .map((doc) => domainLabel('customerDocumentType', doc))
                .join(', '),
            })}
          </CardLead>
        ) : null}
        {terms?.termsText ? (
          <YStack gap={2} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('hostTerms')}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {terms.termsText}
            </Text>
          </YStack>
        ) : null}
        <Text col={colors.placeholder} fos={fontSize.label}>
          {t('reminder')}
        </Text>
      </YStack>
    </Card>
  );
}

/**
 * Thẻ chi phí của ba màn — CÙNG hai thẻ "Chi phí thuê xe" + "Các khoản khác" của màn Xem lại
 * (`BookingReviewCosts`, như web develop): mọi khoản đi kèm luôn hiện nên các dòng cộng ra đúng
 * tổng, và tiền giữ chỗ chỉ nói MỘT lần — kèm nhãn trạng thái do màn truyền vào.
 */
export function TripCostsCard({
  listing,
  isDelivery,
  frozen = false,
  holdTag,
  ...breakdown
}: ReviewCostsBreakdown & {
  listing: PublicListingDetail | null;
  isDelivery: boolean;
  frozen?: boolean;
  holdTag?: { tone: TripRequestTone; label: string } | null;
}) {
  const t = useTranslations('Trips.detail');
  return (
    <BookingReviewCosts
      listing={listing}
      breakdown={breakdown}
      loading={false}
      isDelivery={isDelivery}
      listedRows={[]}
      holdTag={
        holdTag ? <TripRequestPill tone={holdTag.tone}>{holdTag.label}</TripRequestPill> : undefined
      }
      emptyNote={t('priceEmpty')}
      surface="trip"
      frozen={frozen}
    />
  );
}

/** Thẻ "chưa báo giá được" — xe thiếu giá, dài hạn chưa có gói. */
export function TripPriceEmptyCard() {
  const t = useTranslations('Trips.detail');
  return (
    <Card>
      <YStack gap={space.xs}>
        <CardTitle>{t('priceBlock')}</CardTitle>
        <CardLead>{t('priceEmpty')}</CardLead>
      </YStack>
    </Card>
  );
}

/**
 * "Cần thay đổi kế hoạch?" — cuối màn của cả ba chặng: lời nhắc theo chặng, lối phụ, chính sách
 * huỷ, nút huỷ và hotline.
 *
 * Huỷ là LỐI THOÁT, không phải việc khách vào đây để làm — đứng cuối, màu đỏ, và luôn qua tấm xác
 * nhận (`CancelTripSheet` ở màn cha). Chỉ hiện khi chặng còn huỷ được (`canCustomerCancelTrip`);
 * cửa chặn thật là `POST /trips/:id/cancel`.
 */
export function TripPlanChangeCard({
  trip,
  body,
  actions,
  onCancel,
}: {
  trip: CustomerTripDetail;
  /** Lời nhắc của CHẶNG: huỷ lúc này mất gì, được hoàn gì. */
  body: string;
  /** Lối phụ của riêng màn, đứng trước nút chính sách (ví dụ nhắn tin cho chủ xe). */
  actions?: ReactNode;
  onCancel: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.requestView.policy');
  const openDoc = useOpenLegalDoc();
  const canCancel = canCustomerCancelTrip(trip.stage);

  return (
    <Card tone="muted" lift="flat">
      <YStack gap={space.sm}>
        <CardTitle>{t('title')}</CardTitle>
        <CardLead>{body}</CardLead>
        {actions}
        <Button
          label={t('view')}
          variant="secondary"
          icon="document-text-outline"
          onPress={() => openDoc(LEGAL_DOC.CANCELLATION)}
        />
        {canCancel ? (
          <Button
            label={t('cancel')}
            variant="danger"
            icon="close-circle-outline"
            onPress={onCancel}
          />
        ) : null}
        <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
          {t.rich('hotline', {
            phone: SUPPORT_HOTLINE.display,
            // Số tổng đài là dữ liệu — thẻ `tel` bọc nó thành liên kết gọi được.
            tel: (chunks) => (
              <Text
                col={colors.primaryActive}
                fow={fontWeight.semibold}
                accessibilityRole="link"
                onPress={() => void Linking.openURL(`tel:${SUPPORT_HOTLINE.tel}`)}
              >
                {chunks}
              </Text>
            ),
          })}
        </Text>
      </YStack>
    </Card>
  );
}
