import { memo, useCallback, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_STATUS,
  BOOKING_STATUS_META,
  isCancellationParty,
  DRIVER_ASSIGNMENT_STATUS_META,
  HANDOVER_STATUS,
  HANDOVER_STATUS_META,
  SERVICE_TYPE,
  STATUS_COLOR,
  DRIVER_SOURCE,
  type BookingStatus,
  type StatusColor,
} from '@xeprime/types';
import {
  isLateReturn,
  LIST_SEPARATOR,
  PICKUP_URGENCY,
  pickupUrgency,
  rentalProgress,
  telHref,
  zaloHref,
  type PickupUrgency,
} from '@xeprime/domain';
import { IconButton } from '@/components/ui/IconButton';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { BookingListItem } from '../api';

/** Màu của mức khẩn — quá giờ là việc phải xử lý ngay, không phải một lỗi của khách. */
const URGENCY_COLOR: Readonly<Record<PickupUrgency, StatusColor>> = {
  [PICKUP_URGENCY.OVERDUE]: STATUS_COLOR.DANGER,
  [PICKUP_URGENCY.TODAY]: STATUS_COLOR.WAITING,
  [PICKUP_URGENCY.UPCOMING]: STATUS_COLOR.NEUTRAL,
};

/**
 * Ba trạng thái biên bản GIAO XE mà nhóm việc "Chờ giao xe" có thể thấy: chưa có biên bản nào,
 * `draft`, `ready`. Biên bản đã xác nhận thì đơn đã rời danh sách, còn bản huỷ thì API đọc thành
 * `null`.
 *
 * Nhãn RIÊNG cho nhóm việc này, KHÔNG dùng chung `Domain.handoverStatus.*`: khoá đó đúng nghĩa
 * hơn ở màn chi tiết biên bản ("Bản nháp"/"Chờ xác nhận"), còn ở đây câu hỏi là "việc chuẩn bị xe
 * tới đâu rồi". Màu vẫn mượn từ `HANDOVER_STATUS_META` để nhất quán với mọi nơi khác.
 */
const AWAITING_PICKUP_HANDOVER_LABEL_KEY = {
  none: 'awaitingPickup.handoverNotStarted',
  [HANDOVER_STATUS.DRAFT]: 'awaitingPickup.handoverPreparing',
  [HANDOVER_STATUS.READY]: 'awaitingPickup.handoverReady',
} as const;

/**
 * MỘT ĐƠN trong danh sách đơn thuê — bản native của `BookingTable`, mang đúng năm cột của nó:
 * khách (tên + mã đơn · SĐT) · xe · thời gian thuê · TỔNG TIỀN · trạng thái.
 *
 * Tổng tiền chứ không phải công nợ: tổng tiền là giá trị của đơn và là thứ người ta quét khi lướt
 * danh sách; công nợ là việc còn phải làm, nó thuộc màn chi tiết.
 *
 * KHÔNG dùng `DataRow`: cột nhãn cố định của nó tiêu một phần ba bề ngang cho hai từ mà người đọc
 * đã biết trước. Icon dẫn dòng thay cột nhãn nên mỗi dữ kiện gói trong ĐÚNG một dòng.
 *
 * **Vạch màu trạng thái ở mép trái** — cùng ngôn ngữ với thẻ Chi nhánh · Tài xế · Nhân sự · Khách
 * hàng. Trên một danh sách đơn, thứ người vận hành tìm là CỤM: đơn nào đang chạy, đơn nào quá hạn
 * trả, đơn nào vừa huỷ. Một mép màu liền mạch cho phép lướt bắt cụm đó mà không phải đọc từng
 * viên nhãn ở đầu bên kia thẻ. Viên nhãn vẫn còn nguyên — vạch là lối vào nhanh, KHÔNG thay chữ.
 *
 * `awaitingPickup` đổi cả hai kênh đó sang MỨC KHẨN (ADR 0047) — xem prop.
 */
function BookingCardImpl({
  booking,
  onPress,
  onExtend,
  awaitingPickup = false,
}: {
  booking: BookingListItem;
  onPress: (booking: BookingListItem) => void;
  /**
   * "Gia hạn" (ADR 0077) — nơi gọi chỉ truyền khi người dùng có `bookings.update`. Thẻ tự soát
   * phần còn lại: đơn DÀI HẠN đang thuê, đặt qua chợ (web `BookingCard.extendable`).
   */
  onExtend?: (booking: BookingListItem) => void;
  /**
   * Thẻ đang phục vụ nhóm việc "Chờ giao xe".
   *
   * Đổi DỮ KIỆN, không chỉ thêm: một hàng đợi giao xe cần giờ hẹn + mức khẩn, nơi giao và trạng
   * thái biên bản. Tổng tiền, khoảng thuê và viên TRẠNG THÁI ĐƠN là câu hỏi của màn tra cứu,
   * không phải của người đang đứng ở quầy — và sau ADR 0047 mọi hàng ở đây chỉ còn đúng MỘT giá
   * trị trạng thái (`reserved`), nên một viên luôn hiện cùng một chữ không phải thông tin.
   */
  awaitingPickup?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const status = booking.status as BookingStatus;
  const meta = BOOKING_STATUS_META[status];

  /*
   * Mức khẩn quyết CẢ vạch màu mép trái lẫn viên góc phải — hai kênh phải nói cùng một điều
   * (ngôn ngữ thẻ của khu quản lý). Ở nhóm việc này "việc gấp tới đâu" mới là thứ người trực
   * lướt tìm, không phải "đơn đang ở trạng thái nào".
   */
  const urgency = awaitingPickup ? pickupUrgency(booking.pickupAt) : null;

  // Mã đơn và SĐT đứng cùng dòng dưới tên — đúng cột "khách" của web.
  const identity = [booking.code, booking.customerPhone].filter(Boolean).join(LIST_SEPARATOR);

  /*
   * MỘT hàm mở cho cả thẻ lẫn mũi tên — cùng khuôn với `TripCard`. Viết `() => onPress(booking)`
   * hai chỗ là hai closure mới ở mỗi lần render, tức `memo` của `Card` không bao giờ ăn, mà thẻ
   * này nằm trong một danh sách dài.
   */
  const open = useCallback(() => onPress(booking), [onPress, booking]);
  const extend = useCallback(() => onExtend?.(booking), [onExtend, booking]);
  const tBoard = useTranslations('Bookings.board');
  const tExtension = useTranslations('Bookings.extension');
  const tContact = useTranslations('BookingRequests.actions');
  const extendable =
    onExtend !== undefined &&
    status === BOOKING_STATUS.ACTIVE &&
    booking.serviceType === SERVICE_TYPE.LONG_TERM &&
    booking.bookingRequestId != null;
  const timeline = awaitingPickup ? null : timelineOf(booking, status, tBoard, fmt);
  const tel = telHref(booking.customerPhone);
  const zalo = zaloHref(booking.customerPhone);
  const toneColor: Record<TimelineTone, string> = {
    muted: colors.textMuted,
    warning: colors.warning,
    danger: colors.danger,
    success: colors.success,
  };

  return (
    <Card
      padded={false}
      onPress={open}
      /*
        Nhãn chỉ ĐỊNH DANH thẻ. Ở hàng đợi, VIỆC sẽ xảy ra do chính nút "Xử lý giao xe" ở chân thẻ
        tự xưng tên — nhét nó vào đây nữa là trình đọc màn hình đọc cùng một câu hai lần (bắt được
        bằng test 24/09/2026). Trước khi có nút đó thì nhãn này phải gánh, vì một mũi tên trần
        không nói ra chạm vào sẽ ra gì.
      */
      accessibilityLabel={`${booking.customerName}${LIST_SEPARATOR}${booking.code}`}
    >
      <XStack>
        <CardAccent color={urgency ? URGENCY_COLOR[urgency] : meta.color} />

        <YStack f={1} minWidth={0} p={space.md} gap={space.sm}>
          <XStack ai="flex-start" jc="space-between" gap={space.sm}>
            <YStack f={1} gap={2}>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold} numberOfLines={1}>
                {booking.customerName}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
                {identity}
              </Text>
            </YStack>
            {urgency ? (
              <StatusBadge
                label={t(`awaitingPickup.${urgency}`)}
                color={URGENCY_COLOR[urgency]}
                size="sm"
              />
            ) : (
              <StatusBadge
                label={domainLabel('bookingStatus', status, meta.label)}
                color={meta.color}
                size="sm"
              />
            )}
          </XStack>

          <YStack height={1} bg={colors.borderSubtle} />

          <YStack gap={space.xs}>
            <FactLine icon="car-outline">
              {/* Tên xe co lại, BIỂN SỐ thì không — biển số mới là thứ định danh chiếc xe ngoài bãi. */}
              <Text
                col={colors.text}
                fos={fontSize.bodySm}
                fow={fontWeight.medium}
                numberOfLines={1}
                f={1}
              >
                {booking.vehicleName}
              </Text>
              {booking.vehiclePlate ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {booking.vehiclePlate}
                </Text>
              ) : null}
            </FactLine>

            {/* Loại dịch vụ của ĐƠN (đóng băng lúc tạo) — cùng cột "Loại dịch vụ" ở bảng web. */}
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {domainLabel('serviceType', booking.serviceType)}
            </Text>

            <DriverLine booking={booking} />

            {awaitingPickup ? (
              <>
                {/*
                  GIỜ GIAO XE một mình, không phải cả khoảng thuê: ngày trả là chuyện của mấy hôm
                  nữa, còn việc của hàng đợi này là chiếc xe rời bãi đúng giờ nào.
                */}
                <FactLine icon="time-outline">
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium} f={1}>
                    {fmt.shortDateTime(booking.pickupAt)}
                  </Text>
                </FactLine>
                <HandoverPlaceLine booking={booking} />
              </>
            ) : (
              <FactLine icon="time-outline">
                <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1} f={1}>
                  {fmt.shortDateTimeRange(booking.pickupAt, booking.returnAt)}
                </Text>
              </FactLine>
            )}
          </YStack>

          {/*
            Thanh tiến độ chuyến + dòng trạng thái (Figma "All Request", 02/11/2026): đang thuê thì đã
            đi bao nhiêu % / còn bao lâu (đỏ khi quá giờ trả), hoàn tất thì đầy, huỷ thì rỗng.
          */}
          {timeline ? (
            <YStack gap={space.xs}>
              <ProgressBar percent={timeline.percent} tone={timeline.bar} size="sm" />
              <Text col={toneColor[timeline.tone]} fos={fontSize.label} numberOfLines={1}>
                {timeline.text}
              </Text>
            </YStack>
          ) : null}

          {/* Liên hệ khách (gọi / Zalo) + "Gia hạn" — web `CustomerContactButtons` + nút gia hạn. */}
          {tel || zalo || extendable ? (
            <XStack ai="center" gap={space.xs}>
              {tel && booking.customerPhone ? (
                <IconButton
                  icon="call-outline"
                  label={tContact('callAria', {
                    name: booking.customerName,
                    phone: booking.customerPhone,
                  })}
                  tone="accent"
                  onPress={() => void Linking.openURL(tel)}
                />
              ) : null}
              {zalo ? (
                <IconButton
                  icon="chatbubbles-outline"
                  label={tContact('zalo')}
                  tone="accent"
                  onPress={() => void Linking.openURL(zalo)}
                />
              ) : null}
              <YStack f={1} />
              {extendable ? (
                <Button
                  label={tExtension('action')}
                  icon="sync-outline"
                  variant="outline"
                  size="sm"
                  block={false}
                  onPress={extend}
                />
              ) : null}
            </XStack>
          ) : null}

          <YStack height={1} bg={colors.borderSubtle} />

          {/*
            Mũi tên `>` cuối hàng — DẤU HIỆU thẻ mở ra được, không phải một nút nữa.

            Cả thẻ đã là đích chạm, nên một nút "Xem chi tiết" ở chân thẻ chỉ là lối vào thứ hai cho
            đúng một việc, lại còn nặng bằng một hành động chính. Mũi tên đứng ở đây chứ không nổi
            tuyệt đối ở góc trên: góc trên là chỗ của nhãn trạng thái, hai thứ chồng nhau.

            Hàng đợi giao xe đổi nội dung hàng này sang TRẠNG THÁI BIÊN BẢN: ở đó tổng tiền không
            phải câu hỏi, "xe đã chuẩn bị tới đâu" mới là.
          */}
          {awaitingPickup ? (
            <YStack gap={space.sm}>
              {/*
                Trạng thái biên bản là thông tin; thao tác giao xe là hành động chính. Tách thành
                hai hàng để badge không ép CTA thành một viên nhỏ khó bấm trên màn 360dp.
              */}
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('awaitingPickup.handoverColumn')}
                </Text>
                <HandoverStatusBadge status={booking.pickupHandoverStatus} />
              </XStack>
              {/*
                Đích trùng với chạm cả thẻ: cả hai cùng mở trang chi tiết để đi qua biên bản,
                số KM và ảnh hiện trạng. Nút vàng full-width làm rõ việc chính của hàng đợi.
              */}
              <Button
                label={t('awaitingPickup.action')}
                icon="key-outline"
                size="sm"
                onPress={open}
              />
            </YStack>
          ) : (
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('card.total')}
                </Text>
                <XStack ai="center" gap={space.xs}>
                  <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
                    {fmt.money(booking.totalAmount)}
                  </Text>
                  <DetailChevron />
                </XStack>
              </>
            </XStack>
          )}
        </YStack>
      </XStack>
    </Card>
  );
}

/**
 * Nơi xe đổi tay: MÃ → nhãn ở client (ADR 0012), còn chuỗi địa chỉ/tên chi nhánh là dữ liệu và
 * đi qua nguyên văn.
 *
 * Ba tình huống khác nhau về VIỆC PHẢI LÀM chứ không chỉ khác địa chỉ — giao tận nơi là nhân
 * viên phải lên đường, đón khách là chuyến có tài xế, nhận tại chi nhánh là khách tự tới.
 */
function HandoverPlaceLine({ booking }: { booking: BookingListItem }) {
  const colors = useColors();
  const t = useTranslations('Bookings');
  const domainLabel = useDomainLabel();

  if (!booking.handoverPlaceKind) {
    return (
      <FactLine icon="location-outline">
        <Text col={colors.textMuted} fos={fontSize.bodySm} f={1}>
          {t('awaitingPickup.placeUnknown')}
        </Text>
      </FactLine>
    );
  }

  return (
    <FactLine icon="location-outline">
      <Text col={colors.text} fos={fontSize.bodySm} f={1}>
        <Text col={colors.textMuted}>
          {domainLabel('bookingHandoverPlace', booking.handoverPlaceKind)}
          {': '}
        </Text>
        {booking.handoverPlace ?? t('awaitingPickup.placeUnknown')}
      </Text>
    </FactLine>
  );
}

/**
 * Tài xế của đơn (ADR 0063) — gương cột "Tài xế" của `BookingTable` bên web. Đơn không phải
 * `with_driver` (và không còn tài xế cũ) thì bỏ hẳn dòng: một dòng "—" trên thẻ là nhiễu.
 * Chưa phân công ⇒ chữ màu cảnh báo, vì đơn đó chưa chạy được. Tài xế ngoài hệ thống ⇒ "Ngoài hệ thống".
 */
function DriverLine({ booking }: { booking: BookingListItem }) {
  const colors = useColors();
  const t = useTranslations('Bookings.driver');
  const domainLabel = useDomainLabel();
  const driver = booking.driver ?? null;
  if (!driver && booking.serviceType !== SERVICE_TYPE.WITH_DRIVER) return null;
  if (!driver) {
    return (
      <FactLine icon="person-outline">
        <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium} f={1}>
          {t('noneWithDriver')}
        </Text>
      </FactLine>
    );
  }
  const meta = DRIVER_ASSIGNMENT_STATUS_META[driver.assignmentStatus];
  return (
    <FactLine icon="person-outline">
      <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1} f={1}>
        {driver.name}
      </Text>
      {/* Tài xế NGOÀI HỆ THỐNG (ADR 0067) đã phủ chuyến, không có lượt chờ — nhãn riêng như web. */}
      {driver.source === DRIVER_SOURCE.EXTERNAL ? (
        <StatusBadge label={t('external')} color={STATUS_COLOR.NEUTRAL} size="sm" />
      ) : (
        <StatusBadge
          label={domainLabel('driverAssignmentStatus', driver.assignmentStatus, meta.label)}
          color={meta.color}
          size="sm"
        />
      )}
    </FactLine>
  );
}

/**
 * Viên trạng thái biên bản giao xe cho hàng đợi.
 *
 * Phòng thủ: `pickupHandoverStatus` không đáng lẽ khác `null`/`draft`/`ready` ở đây (biên bản đã
 * xác nhận thì đơn đã rời danh sách), nhưng đọc dữ liệu server không nên GIẢ ĐỊNH điều đó bằng
 * một phép ép kiểu — rơi về nhãn "Chưa chuẩn bị" thay vì vẽ một khoá dịch không tồn tại nếu một
 * ngày nào đó điều kiện lọc đổi.
 */
function HandoverStatusBadge({ status }: { status: string | null }) {
  const t = useTranslations('Bookings');

  const labelKey =
    status && status in AWAITING_PICKUP_HANDOVER_LABEL_KEY
      ? AWAITING_PICKUP_HANDOVER_LABEL_KEY[status as 'draft' | 'ready']
      : AWAITING_PICKUP_HANDOVER_LABEL_KEY.none;
  const color = status
    ? (HANDOVER_STATUS_META[status as keyof typeof HANDOVER_STATUS_META]?.color ??
      STATUS_COLOR.NEUTRAL)
    : STATUS_COLOR.NEUTRAL;

  return <StatusBadge label={t(labelKey)} color={color} size="sm" />;
}

/** Một dữ kiện = một icon dẫn dòng + nội dung. Icon thay cho cột nhãn — xem chú thích ở trên. */
function FactLine({
  icon,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} />
      {children}
    </XStack>
  );
}

export const BookingCard = memo(BookingCardImpl);

type TimelineTone = 'muted' | 'warning' | 'danger' | 'success';

/** Lượt "sắp trả" — dòng trạng thái chuyển cam khi còn dưới 2 giờ (web `RETURN_SOON_MINUTES`). */
const RETURN_SOON_MINUTES = 120;

/**
 * Thanh + dòng trạng thái của thẻ — chép `progressOf` / `statusLine` của web `BookingCard`, chia
 * theo TRẠNG THÁI đơn (app không chia thẻ theo ngăn như cột trái web).
 */
function timelineOf(
  booking: BookingListItem,
  status: BookingStatus,
  t: ReturnType<typeof useTranslations<'Bookings.board'>>,
  fmt: ReturnType<typeof useAppFormat>,
): {
  percent: number;
  bar: 'active' | 'success' | 'exception';
  text: string;
  tone: TimelineTone;
} {
  if (status === BOOKING_STATUS.ACTIVE) {
    const { percent, remainingMinutes, overdueMinutes } = rentalProgress(
      booking.actualPickupAt ?? booking.pickupAt,
      booking.returnAt,
    );
    if (overdueMinutes > 0) {
      return {
        percent: 100,
        bar: 'exception',
        text: t('overdueReturn', { duration: fmt.minutesDuration(overdueMinutes) }),
        tone: 'danger',
      };
    }
    return {
      percent,
      bar: 'active',
      // `progress` gỡ ở web 05/11/2026 — thẻ mới chỉ nói phần còn lại, thanh tiến độ nói phần trăm.
      text: t('remaining', { remaining: fmt.minutesDuration(remainingMinutes) }),
      tone: remainingMinutes <= RETURN_SOON_MINUTES ? 'warning' : 'muted',
    };
  }
  if (status === BOOKING_STATUS.COMPLETED) {
    const late = isLateReturn(booking.returnAt, booking.actualReturnAt);
    return {
      percent: 100,
      bar: 'success',
      text: late ? t('returnedLate') : t('returnedOnTime'),
      tone: late ? 'warning' : 'success',
    };
  }
  if (status === BOOKING_STATUS.CANCELLED || status === BOOKING_STATUS.NO_SHOW) {
    const party = booking.cancellationParty;
    return {
      percent: 0,
      bar: 'exception',
      text:
        status === BOOKING_STATUS.NO_SHOW
          ? t('noShow')
          : party && isCancellationParty(party)
            ? t(`cancelledBy.${party}`)
            : t('cancelled'),
      tone: 'danger',
    };
  }
  const urgency = pickupUrgency(booking.pickupAt);
  const time = fmt.time(booking.pickupAt);
  return {
    percent: 0,
    bar: 'active',
    text:
      urgency === PICKUP_URGENCY.OVERDUE
        ? t('pickupOverdue', { time })
        : urgency === PICKUP_URGENCY.TODAY
          ? t('pickupToday', { time })
          : t('pickupUpcoming', { date: fmt.dayMonth(booking.pickupAt), time }),
    tone:
      urgency === PICKUP_URGENCY.OVERDUE
        ? 'danger'
        : urgency === PICKUP_URGENCY.TODAY
          ? 'warning'
          : 'muted',
  };
}
