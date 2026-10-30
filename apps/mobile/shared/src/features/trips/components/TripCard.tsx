import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useCallback, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  canHostCancelTrip,
  canHostDecideTrip,
  CUSTOMER_TRIP_STAGE,
  CUSTOMER_TRIP_STAGE_META,
  isCancellationParty,
  DRIVER_ASSIGNMENT_STATUS_META,
  SERVICE_TYPE,
  STATUS_COLOR,
  STOREFRONT_KIND,
  TRIP_ROLE,
  type CustomerTripStage,
  type TripRole,
} from '@xeprime/types';
import {
  canShowHostChatOnTrip,
  isNegativeMoney,
  subtractMoney,
} from '@xeprime/domain';
import { Pressable, StyleSheet } from 'react-native';
import { Button } from '@/components/ui/Button';
import { HomeCardAvatar } from '@/features/marketplace/components/home/HomeCardAvatar';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RespondDeadline } from '@/features/booking-requests/components/RespondDeadline';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerTrip } from '../api';

/** Ảnh vuông nhỏ bên trái — thẻ chuyến ưu tiên THỜI GIAN và trạng thái, không phải ảnh xe. */
/** Ảnh xe ngang 16:10 như Figma — đứng cạnh hai mốc nhận/trả. */
const THUMB_W = 104;
const THUMB_H = 64;

/** Không phụ thuộc prop/state — dựng MỘT lần ở module scope, không phải mỗi lần render. */
const THUMB_STYLE = { width: THUMB_W, height: THUMB_H, borderRadius: radius.md };

interface TripCardProps {
  trip: CustomerTrip;
  onPress: (trip: CustomerTrip) => void;
  /**
   * Quyết định của CHỦ XE trên một yêu cầu còn chờ. Vắng mặt = màn không cho quyết định ở đây
   * (thiếu quyền `booking_requests.approve`), và thẻ KHÔNG bày nút mờ để giải thích.
   */
  decisions?: {
    onApprove: (trip: CustomerTrip) => void;
    onReject: (trip: CustomerTrip) => void;
    /** HUỶ một chuyến ĐÃ NHẬN (ADR 0045 điều 1) — chỉ có ở `awaiting_hold`. */
    onCancel: (trip: CustomerTrip) => void;
    /** Quyết định đang chạy cho CHÍNH thẻ này — khoá cả ba nút (web `TripCard` `pending`). */
    pending: 'approve' | 'reject' | 'cancel' | null;
  };
}

/** Tài xế của chuyến (ADR 0063): tên + trạng thái lượt gán, hoặc "chưa phân công". */
function TripDriverLine({ trip }: { trip: CustomerTrip }) {
  const colors = useColors();
  const t = useTranslations('Trips.card');
  const tDriver = useTranslations('Bookings.driver');
  const domainLabel = useDomainLabel();
  const driver = trip.driver ?? null;
  const meta = driver ? DRIVER_ASSIGNMENT_STATUS_META[driver.assignmentStatus] : null;
  return (
    <XStack ai="center" gap={space.xs} flexWrap="wrap">
      <Text col={colors.textMuted} fos={fontSize.label}>
        {`${t('driver')}:`}
      </Text>
      {driver && meta ? (
        <>
          <Text col={colors.text} fos={fontSize.label} numberOfLines={1} flexShrink={1}>
            {driver.name}
          </Text>
          <StatusBadge
            label={domainLabel('driverAssignmentStatus', driver.assignmentStatus, meta.label)}
            color={meta.color}
            size="sm"
          />
        </>
      ) : (
        <Text col={colors.warning} fos={fontSize.label} fow={fontWeight.medium}>
          {tDriver('none')}
        </Text>
      )}
    </XStack>
  );
}

/**
 * Một chuyến trong danh sách.
 *
 * Khác thẻ xe ở marketplace một cách có chủ đích: ở đó khách đang CHỌN xe nên ảnh lớn là đúng;
 * ở đây khách đã có xe và câu hỏi là "bao giờ, đang tới đâu, bao nhiêu tiền" — nên ảnh thu về
 * một ô vuông và thời gian chiếm chỗ chính.
 *
 * ## Một danh sách, HAI PHÍA
 *
 * "Chuyến của tôi" trộn chuyến tôi CHO THUÊ với chuyến tôi ĐI THUÊ vào cùng một danh sách —
 * server trộn chúng trong cùng một truy vấn phân trang (ADR 0014: một con người, nhiều vai). Thẻ
 * vì thế phải tự nói mình là phía nào: một nhãn vai ở đầu thẻ, và dòng người đối diện đổi theo
 * ("Chủ xe: …" ↔ "Khách thuê: …"). Cấu trúc giữ NGUYÊN một bản — dựng hai thẻ riêng là hai bố
 * cục phải sửa cùng lúc mỗi lần đổi một chi tiết.
 *
 * Khác biệt thật sự chỉ nằm ở HÀNH ĐỘNG: chủ xe đang có một yêu cầu chờ thì thấy đồng hồ đếm
 * ngược cùng hai quyết định ngay trên thẻ, vì đó là việc phải làm trước khi hết hạn. Mọi chặng
 * còn lại của cả hai phía chỉ có một lối đi tiếp là mở chi tiết.
 */
/** Tiền 0đ dạng chuỗi — mốc chặn "Còn lại" không âm (ADR 0007). */
const ZERO_MONEY = '0.00';

function TripCardImpl({ trip, onPress, decisions }: TripCardProps) {
  const colors = useColors();
  const t = useTranslations('Trips');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const meta = CUSTOMER_TRIP_STAGE_META[trip.stage as CustomerTripStage];
  const isHost = (trip.role as TripRole) === TRIP_ROLE.HOST;
  // Chuyến huỷ nói rõ AI huỷ (web `CustomerTripCard`) — chỉ phía khách; server suy từ sổ huỷ.
  const cancelledBy =
    !isHost && trip.stage === CUSTOMER_TRIP_STAGE.CANCELLED && isCancellationParty(trip.cancelledBy)
      ? trip.cancelledBy
      : null;
  /*
   * Chặng nào chủ xe còn một nút để bấm — đọc từ `stage`, KHÔNG đọc `respondBy`.
   *
   * Từ ADR 0044, `respondBy` vẫn còn nguyên SAU khi chủ xe đã nhận chuyến, nên hỏi nó là bày
   * nút "Duyệt" cho một chuyến họ vừa duyệt — và cú bấm đó chỉ trả về một lỗi khó hiểu.
   *
   * Hai chặng, hai bộ nút: còn chờ quyết ⇒ Duyệt/Từ chối; đã nhận và đang chờ khách trả tiền ⇒
   * chỉ còn một lối thoát là HUỶ (ADR 0045 điều 1).
   */
  /* Ba cột tiền (web `CustomerTripCard`): Đã trả + Còn lại = Tổng, không âm. */
  const paid = trip.holdPaidAmount ?? ZERO_MONEY;
  const rawRemaining = trip.totalAmount ? subtractMoney(trip.totalAmount, paid) : ZERO_MONEY;
  const remaining = isNegativeMoney(rawRemaining) ? ZERO_MONEY : rawRemaining;
  const stage = trip.stage as CustomerTripStage;
  const canDecide = Boolean(decisions && isHost && canHostDecideTrip(stage));
  const cancelOnly = canHostCancelTrip(stage);

  /*
   * MỘT hàm mở cho cả thẻ lẫn mũi tên. Viết `() => onPress(trip)` hai chỗ là hai closure mới ở
   * mỗi lần render, tức `memo` của `Card` và của mũi tên không bao giờ ăn — mà thẻ này nằm trong
   * một danh sách dài.
   */
  const open = useCallback(() => onPress(trip), [onPress, trip]);

  return (
    <Card onPress={open} accessibilityLabel={t('card.viewDetailOf', { name: trip.vehicle.name })} pressHighlight>
      {/*
        Khuôn thẻ Figma "Account / Profile / Trip" (người dùng chốt 28/10/2026): ảnh trái, nhãn chặng
        góc trên PHẢI trên mốc nhận/trả → tên xe + mã đơn → viên thông tin → chủ xe → ba cột tiền.
      */}
      <YStack gap={space.sm}>
        {isHost ? (
          <XStack ai="center" gap={space.xs} flexWrap="wrap">
              {/* NHÃN VAI — chủ xe mở danh sách cần biết đây là chuyến của chính mình. */}
              <StatusBadge label={t('card.roleHost')} color={STATUS_COLOR.INFO} size="sm" />
              {/* Đồng hồ hạn phản hồi chỉ khi chủ xe còn phải trả lời (chặng, không phải `respondBy`). */}
              {canHostDecideTrip(stage) && !cancelOnly && trip.respondBy ? (
                <RespondDeadline respondBy={trip.respondBy} />
              ) : null}
          </XStack>
        ) : null}

        <XStack gap={space.md} ai="center">
          {trip.vehicle.imageUrl ? (
            <Image
              source={{ uri: trip.vehicle.imageUrl }}
              style={THUMB_STYLE}
              contentFit="cover"
              cachePolicy="memory-disk"
              transition={150}
            />
          ) : (
            <YStack
              w={THUMB_W}
              h={THUMB_H}
              br={radius.md}
              bg={colors.surfaceMuted}
              ai="center"
              jc="center"
            >
              <Ionicons name="car-outline" size={28} color={colors.placeholder} />
            </YStack>
          )}
          <YStack f={1} minWidth={0} gap={space.xs}>
            {/* Nhãn chặng góc trên PHẢI, ngay trên ô "Nhận xe" (người dùng chốt 28/10/2026). */}
            <XStack jc="flex-end">
              <StatusBadge
                label={
                  cancelledBy
                    ? t(`cancelledBy.${cancelledBy}`)
                    : domainLabel('customerTripStage', trip.stage, meta.label)
                }
                color={meta.color}
                size="sm"
              />
            </XStack>
            <ScheduleLine trip={trip} />
          </YStack>
        </XStack>

        <XStack ai="center" gap={space.sm}>
          <Text f={1} col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold} numberOfLines={1}>
            {trip.vehicle.name}
          </Text>
          {trip.code ? (
            <Text col={colors.placeholder} fos={fontSize.label} numberOfLines={1}>
              {`#${trip.code}`}
            </Text>
          ) : null}
        </XStack>

        <TripInfoChips trip={trip} />

        {isHost ? (
          <YStack gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
              {`${t('card.renter')}: ${trip.renter?.name ?? t('card.renterUnknown')}`}
            </Text>
            {trip.bookingId && trip.serviceType === SERVICE_TYPE.WITH_DRIVER ? (
              <TripDriverLine trip={trip} />
            ) : null}
          </YStack>
        ) : (
          // Chat hiện/ẩn theo `canShowHostChatOnTrip` — cùng quy tắc web (ADR 0073).
          <XStack ai="center" gap={space.sm}>
            <TripHost trip={trip} />
            {canShowHostChatOnTrip({
              shopKind: trip.shop.shopKind,
              hasBooking: Boolean(trip.code),
            }) ? (
              <ChatWithShopButton
                vehicleId={trip.vehicle.id}
                label={t('confirmed.chatOwner')}
                iconOnly
                compact
                iconTone="surface"
              />
            ) : null}
          </XStack>
        )}

        {/* Ba cột tiền — Tổng | Đã thanh toán | Còn lại (tô vàng). Phép trừ trên CHUỖI tiền (ADR 0007). */}
        <XStack gap={space.sm} pt={space.xs} ai="stretch">
          <MoneyCell label={t('card.total')}>
            {trip.totalAmount ? (
              fmt.moneyThousands(trip.totalAmount)
            ) : (
              <Text col={colors.textMuted} fos={fontSize.bodySm} ta="center">
                {t('card.awaitingQuote')}
              </Text>
            )}
          </MoneyCell>
          <MoneyCell label={t('card.paid')}>
            {trip.totalAmount ? fmt.moneyThousands(paid) : '—'}
          </MoneyCell>
          <MoneyCell label={t('card.remaining')} highlight>
            {trip.totalAmount ? fmt.moneyThousands(remaining) : '—'}
          </MoneyCell>
        </XStack>

          {/*
          Hai quyết định NGAY TRÊN THẺ, không bắt mở chi tiết trước: đây là việc có hạn, và với
          chuyến đã trả tiền giữ chỗ thì mỗi phút chậm là tiền của khách đang bị giữ. Chỉ hiện khi
          chuyến còn chờ CHÍNH người đang xem trả lời.
        */}
          {canDecide && decisions ? (
            cancelOnly ? (
              <Button
                label={t('card.cancel')}
                variant="danger"
                size="sm"
                icon="close-circle-outline"
                loading={decisions.pending === 'cancel'}
                disabled={decisions.pending !== null}
                onPress={() => decisions.onCancel(trip)}
              />
            ) : (
              <XStack gap={space.sm}>
                <YStack f={1}>
                  <Button
                    label={t('card.reject')}
                    variant="secondary"
                    size="sm"
                    icon="close-circle-outline"
                    loading={decisions.pending === 'reject'}
                    disabled={decisions.pending !== null}
                    onPress={() => decisions.onReject(trip)}
                  />
                </YStack>
                <YStack f={1}>
                  <Button
                    label={t('card.approve')}
                    size="sm"
                    icon="checkmark-circle-outline"
                    loading={decisions.pending === 'approve'}
                    disabled={decisions.pending !== null}
                    onPress={() => decisions.onApprove(trip)}
                  />
                </YStack>
              </XStack>
            )
          ) : null}
      </YStack>
    </Card>
  );
}

/**
 * Hình thức nhận xe — thứ khách phải biết trước khi tới ngày: **tự đi lấy hay xe mang tới**.
 *
 * Cùng câu với thẻ chuyến web: "Tự lái · Nhận tại đại lý" / "… · Giao tận nơi"; có tài xế thì
 * "Có tài xế · <lộ trình>".
 */
function TripInfoChips({ trip }: { trip: CustomerTrip }) {
  const colors = useColors();
  const t = useTranslations('Trips.pickup');
  const domainLabel = useDomainLabel();
  const withDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;

  /* Dịch vụ · hình thức nhận xe — cùng dòng "Tự lái | Nhận tại đại lý" của thẻ web. */
  const method = withDriver
    ? trip.routeType
      ? domainLabel('routeType', trip.routeType)
      : t('driverPickup')
    : trip.deliveryRequested
      ? t('delivery')
      : t('agency');
  // Viên thông tin (Figma): biển số (chỉ có sau khi nhận chuyến) · hình thức thuê · cách nhận xe.
  const chips = [trip.vehicle.plateNumber, domainLabel('serviceType', trip.serviceType), method].filter(
    (v): v is string => Boolean(v),
  );

  return (
    <XStack gap={space.xs} flexWrap="wrap">
      {chips.map((chip) => (
        <YStack key={chip} px={space.sm} py={2} br={radius.sm} bw={1} bc={colors.border} bg={colors.surface}>
          <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
            {chip}
          </Text>
        </YStack>
      ))}
    </XStack>
  );
}

/**
 * Dòng thời gian của chuyến.
 *
 * Thuê dài hạn CHƯA duyệt không có `pickupAt`/`returnAt` — khách mới chỉ nêu nguyện vọng, và
 * gian hàng chốt lịch khi duyệt (ADR 0011). `pickupWishParts` là hàm DUY NHẤT phân loại nguyện
 * vọng đó; đoán ở đây là mỗi màn ngụ ý một mức chắc chắn khác nhau với khách.
 */
function ScheduleLine({ trip }: { trip: CustomerTrip }) {
  const colors = useColors();
  const fmt = useAppFormat();
  const t = useTranslations('Trips.detail');

  /* Hai mốc có NHÃN "Nhận xe" / "Trả xe" như thẻ web (Figma `19879:71822`). */
  if (trip.pickupAt && trip.returnAt) {
    return (
      <YStack gap={space.xs}>
        <SchedulePoint label={t('pickupAt')} value={fmt.dateTime(trip.pickupAt)} />
        <SchedulePoint label={t('returnAt')} value={fmt.dateTime(trip.returnAt)} />
      </YStack>
    );
  }

  if (trip.serviceType === SERVICE_TYPE.LONG_TERM) {
    /*
     * Yêu cầu dài hạn chưa duyệt chưa có lịch — nói GÓI + nguyện vọng như web, không bịa ngày. HAI
     * dòng riêng (web #230 `CustomerTripCard`): gộp làm một thì chuỗi dài bị cắt "…" đúng ở khoảng
     * ngày. Dòng nguyện vọng ("Trong 7 ngày tới: 28/10 – 03/11/2026") được xuống dòng.
     */
    const packageLabel = fmt.packageLabel(trip.longTermPackageMonths);
    return (
      <YStack gap={space.xs}>
        {packageLabel ? <SchedulePoint label={t('package')} value={packageLabel} /> : null}
        <SchedulePoint label={t('pickupWish')} value={fmt.pickupWish(trip) || '—'} wrap />
      </YStack>
    );
  }

  return null;
}

/** Một mốc của lịch thuê — biểu tượng lịch, nhãn nhỏ, giá trị đậm. */
function SchedulePoint({
  label,
  value,
  wrap = false,
}: {
  label: string;
  value: string;
  /** Cho giá trị dài xuống dòng thay vì cắt "…" (nguyện vọng dài hạn). */
  wrap?: boolean;
}) {
  const colors = useColors();
  return (
    // Figma: nhãn trái xám, giá trị phải — một hàng mỗi mốc.
    <XStack ai="flex-start" gap={space.sm} minWidth={0}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      <Text
        f={1}
        ta="right"
        col={colors.text}
        fos={fontSize.bodySm}
        fow={fontWeight.medium}
        {...(wrap ? {} : { numberOfLines: 1 })}
      >
        {value}
      </Text>
    </XStack>
  );
}

export const TripCard = memo(TripCardImpl);

/** Cỡ avatar bên cho thuê — cùng cỡ với thẻ xe ngoài chợ (`VehicleCard`). */
const HOST_AVATAR = 34;

const hostStyles = StyleSheet.create({ link: { flex: 1 } });

/**
 * Bên cho thuê trên thẻ chuyến của KHÁCH — bản native của `HostIdentity` (web `CustomerTripCard`),
 * cùng dáng khối gian hàng của `VehicleCard`: ẢNH thật (`shop.avatarUrl` — logo gian hàng hoặc ảnh
 * chủ xe theo tuyến), GIAN HÀNG nổi hơn chủ xe cá nhân (dấu xác minh, nhãn đậm, tên vàng) và chạm
 * được sang mặt tiền. Chủ xe cá nhân không có mặt tiền doanh nghiệp nên không chạm được (ADR 0038).
 */
function TripHost({ trip }: { trip: CustomerTrip }) {
  const colors = useColors();
  const t = useTranslations('Listings.card');
  const navigateOnce = useNavigateOnce();
  const isShop = trip.shop.shopKind === STOREFRONT_KIND.SHOP;

  const body = (
    <XStack ai="center" gap={space.xs}>
      {/* Cùng khối chủ xe của thẻ trang chủ (`HomeCardAvatar`): dấu xanh ở góc avatar, KHÔNG lặp sau tên. */}
      <HomeCardAvatar
        name={trip.shop.name}
        url={trip.shop.avatarUrl ?? null}
        size={HOST_AVATAR}
        verified={isShop}
        markDisc={12}
        markIcon={9}
      />
      <YStack f={1} gap={0}>
        <Text
          col={isShop ? colors.text : colors.placeholder}
          fos={fontSize.label}
          fow={isShop ? fontWeight.semibold : fontWeight.regular}
        >
          {t(isShop ? 'shop' : 'owner')}
        </Text>
        <Text
          col={isShop ? colors.primaryHover : colors.text}
          fos={fontSize.body}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {trip.shop.name}
        </Text>
      </YStack>
    </XStack>
  );

  if (!isShop) return <YStack f={1}>{body}</YStack>;
  return (
    <Pressable
      onPress={() => navigateOnce(ROUTES.explore.shopDetail(trip.shop.slug))}
      accessibilityRole="button"
      accessibilityLabel={t('shopVerifiedAria', { name: trip.shop.name })}
      style={hostStyles.link}
    >
      {body}
    </Pressable>
  );
}

/**
 * Một cột tiền — `MoneyCell` + `.moneyCell` web: căn giữa, nhãn `text-tertiary` cỡ label, số
 * `color-text` body medium 22px không xuống dòng; `highlight` tô `color-primary` ("Còn lại").
 */
function MoneyCell({
  label,
  highlight = false,
  children,
}: {
  label: string;
  highlight?: boolean;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack f={1} minWidth={0} ai="center" gap={2}>
      <Text col={colors.placeholder} fos={fontSize.label} numberOfLines={1}>
        {label}
      </Text>
      {typeof children === 'string' ? (
        <Text
          col={highlight ? colors.primary : colors.text}
          fos={fontSize.body}
          fow={fontWeight.medium}
          lh={22}
          numberOfLines={1}
        >
          {children}
        </Text>
      ) : (
        children
      )}
    </YStack>
  );
}
