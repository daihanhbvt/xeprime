import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { memo, useCallback } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  canHostCancelTrip,
  canHostDecideTrip,
  CUSTOMER_TRIP_STAGE_META,
  SERVICE_TYPE,
  STATUS_COLOR,
  TRIP_ROLE,
  type CustomerTripStage,
  type TripRole,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { Divider } from '@/components/ui/DataRow';
import { DetailArrow } from '@/components/ui/DetailArrow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { RespondDeadline } from '@/features/booking-requests/components/RespondDeadline';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerTrip } from '../api';

/** Ảnh vuông nhỏ bên trái — thẻ chuyến ưu tiên THỜI GIAN và trạng thái, không phải ảnh xe. */
const THUMB = 72;

/** Không phụ thuộc prop/state — dựng MỘT lần ở module scope, không phải mỗi lần render. */
const THUMB_STYLE = { width: THUMB, height: THUMB, borderRadius: radius.md };

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
  };
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
function TripCardImpl({ trip, onPress, decisions }: TripCardProps) {
  const t = useTranslations('Trips');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const meta = CUSTOMER_TRIP_STAGE_META[trip.stage as CustomerTripStage];
  const isHost = (trip.role as TripRole) === TRIP_ROLE.HOST;
  /*
   * Chặng nào chủ xe còn một nút để bấm — đọc từ `stage`, KHÔNG đọc `respondBy`.
   *
   * Từ ADR 0044, `respondBy` vẫn còn nguyên SAU khi chủ xe đã nhận chuyến, nên hỏi nó là bày
   * nút "Duyệt" cho một chuyến họ vừa duyệt — và cú bấm đó chỉ trả về một lỗi khó hiểu.
   *
   * Hai chặng, hai bộ nút: còn chờ quyết ⇒ Duyệt/Từ chối; đã nhận và đang chờ khách trả tiền ⇒
   * chỉ còn một lối thoát là HUỶ (ADR 0045 điều 1).
   */
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
    <Card onPress={open} accessibilityLabel={trip.vehicle.name} padded={false}>
      <XStack>
        {/* Vạch mép trái mang màu CHẶNG — đọc được nhịp của cả danh sách trước khi đọc chữ. */}
        <CardAccent color={meta.color} />

        <YStack f={1} minWidth={0} p={space.md} gap={space.sm}>
          <DetailArrow label={t('card.viewDetailOf', { name: trip.vehicle.name })} onPress={open} />

          <XStack gap={space.md}>
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
                w={THUMB}
                h={THUMB}
                br={radius.md}
                bg={colors.surfaceMuted}
                ai="center"
                jc="center"
              >
                <Ionicons name="car-outline" size={28} color={colors.placeholder} />
              </YStack>
            )}

            <YStack f={1} gap={space.xs}>
              <XStack ai="center" gap={space.xs} rowGap={space.xs} flexWrap="wrap">
                <StatusBadge
                  label={domainLabel('customerTripStage', trip.stage, meta.label)}
                  color={meta.color}
                  size="sm"
                />
                {/*
                NHÃN VAI — thứ hai người đọc cần để biết mình đang nhìn gì. Không có nó, một chủ
                xe mở danh sách thấy chuyến của CHÍNH MÌNH ghi "Chủ xe: cửa hàng của tôi" và không
                hiểu vì sao mình lại đi thuê xe mình.
              */}
                <StatusBadge
                  label={t(isHost ? 'card.roleHost' : 'card.roleRenter')}
                  color={STATUS_COLOR.INFO}
                  size="sm"
                />
                {/* Hạn trả lời chỉ có nghĩa với người PHẢI trả lời — khách nhìn nó không làm gì được. */}
                {/*
                Đồng hồ hạn phản hồi CHỈ có nghĩa khi chủ xe còn phải trả lời — và điều kiện đó
                là CHẶNG, không phải sự tồn tại của `respondBy`.

                `respondBy` KHÔNG bị xoá sau khi duyệt (ADR 0044), nên hỏi mình nó là bày một
                đồng hồ "hạn phản hồi" trên chuyến đã `ready`, đã `active`, thậm chí đã xong —
                giục chủ xe cho một việc không còn tồn tại. Loại thêm `cancelOnly` vì ở
                `awaiting_hold` mốc đang chạy là hạn THANH TOÁN của khách: một đồng hồ khác, của
                người khác.
              */}
                {isHost && canHostDecideTrip(stage) && !cancelOnly && trip.respondBy ? (
                  <RespondDeadline respondBy={trip.respondBy} />
                ) : null}
              </XStack>

              {/* Tên xe là NHÂN VẬT CHÍNH: cùng cỡ với dòng "Chủ xe" thì phải đọc mới biết đâu là xe. */}
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold} numberOfLines={2}>
                {trip.vehicle.name}
              </Text>
              {/*
              Người ĐỐI DIỆN, đổi theo vai. Chủ xe cần tên khách thuê — đó là thứ họ dùng để gọi
              một chuyến; khách cần tên gian hàng.
            */}
              <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                {isHost
                  ? `${t('card.renter')}: ${trip.renter?.name ?? t('card.renterUnknown')}`
                  : `${t('card.owner')}: ${trip.shop.name}`}
              </Text>
              {/*
              Biển số và mã đơn — hai mẩu chỉ tồn tại SAU khi chuyến được nhận, và là thứ duy nhất
              phân biệt hai chiếc cùng đời trong một danh sách.
            */}
              {trip.vehicle.plateNumber || trip.code ? (
                <Text col={colors.placeholder} fos={fontSize.label} numberOfLines={1}>
                  {[trip.vehicle.plateNumber, trip.code ? `#${trip.code}` : null]
                    .filter(Boolean)
                    .join(LIST_SEPARATOR)}
                </Text>
              ) : null}
            </YStack>
          </XStack>

          <Divider />

          <YStack gap={space.xs}>
            <ScheduleLine trip={trip} />
            <PickupLine trip={trip} />
          </YStack>

          <XStack
            ai="center"
            jc="space-between"
            gap={space.sm}
            pt={space.sm}
            borderTopWidth={1}
            borderColor={colors.borderSubtle}
          >
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('card.total')}
            </Text>
            {/*
            Chuyến chưa duyệt CHƯA có giá chốt: gian hàng báo giá lúc duyệt (ADR 0014). Hiện một
            con số ở đây là hứa một mức giá chưa ai cam kết — nên chỗ đó là CHỮ, và chữ thì tô
            mờ chứ không tô màu tiền: màu tiền dành cho con số thật.
          */}
            {trip.totalAmount ? (
              <YStack ai="flex-end">
                <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
                  {fmt.money(trip.totalAmount)}
                </Text>
                {/*
                Tạm tính trưng ra như giá chốt là một lời hứa hệ thống không giữ (ADR 0024): giá
                chỉ đóng băng lúc tạo đơn, và trước đó con số này còn đổi được.
              */}
                {trip.totalIsEstimate ? (
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {t('card.estimated')}
                  </Text>
                ) : null}
              </YStack>
            ) : (
              <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
                {t('card.awaitingQuote')}
              </Text>
            )}
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
                    onPress={() => decisions.onReject(trip)}
                  />
                </YStack>
                <YStack f={1}>
                  <Button
                    label={t('card.approve')}
                    size="sm"
                    icon="checkmark-circle-outline"
                    onPress={() => decisions.onApprove(trip)}
                  />
                </YStack>
              </XStack>
            )
          ) : null}
        </YStack>
      </XStack>
    </Card>
  );
}

/**
 * Hình thức nhận xe — thứ khách phải biết trước khi tới ngày: **tự đi lấy hay xe mang tới**.
 *
 * Cùng ba nhánh với màn chi tiết và với web: có tài xế → xe đón tận nơi; còn lại → giao tận nơi
 * hoặc nhận tại đại lý.
 */
function PickupLine({ trip }: { trip: CustomerTrip }) {
  const t = useTranslations('Trips.pickup');
  const withDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;

  const label = withDriver
    ? t('driverPickup')
    : trip.deliveryRequested
      ? t('delivery')
      : t('agency');

  return (
    <XStack ai="center" gap={space.xs}>
      <Ionicons name="location-outline" size={14} color={colors.textMuted} />
      <Text f={1} col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
        {label}
      </Text>
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
  const fmt = useAppFormat();

  if (trip.pickupAt && trip.returnAt) {
    return (
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="time-outline" size={14} color={colors.textMuted} />
        <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
          {fmt.shortDateTimeRange(trip.pickupAt, trip.returnAt)}
        </Text>
      </XStack>
    );
  }

  if (trip.serviceType === SERVICE_TYPE.LONG_TERM) {
    return (
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="calendar-outline" size={14} color={colors.textMuted} />
        <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
          {fmt.pickupWish(trip)}
        </Text>
      </XStack>
    );
  }

  return null;
}

export const TripCard = memo(TripCardImpl);
