import { memo, useCallback, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_STATUS_META,
  HANDOVER_STATUS,
  HANDOVER_STATUS_META,
  STATUS_COLOR,
  type BookingStatus,
  type StatusColor,
} from '@xeprime/types';
import { LIST_SEPARATOR, PICKUP_URGENCY, pickupUrgency, type PickupUrgency } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
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
  awaitingPickup = false,
}: {
  booking: BookingListItem;
  onPress: (booking: BookingListItem) => void;
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
  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name={icon} size={iconSize.sm} color={colors.textMuted} />
      {children}
    </XStack>
  );
}

export const BookingCard = memo(BookingCardImpl);
