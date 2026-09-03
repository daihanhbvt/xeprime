import { Ionicons } from '@expo/vector-icons';
import { memo, useCallback } from 'react';
import { Image } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { CUSTOMER_TRIP_STAGE_META, SERVICE_TYPE, type CustomerTripStage } from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { DetailArrow } from '@/components/ui/DetailArrow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { CustomerTrip } from '../api';

/** Ảnh vuông nhỏ bên trái — thẻ chuyến ưu tiên THỜI GIAN và trạng thái, không phải ảnh xe. */
const THUMB = 72;

interface TripCardProps {
  trip: CustomerTrip;
  onPress: (trip: CustomerTrip) => void;
}

/**
 * Một chuyến trong danh sách.
 *
 * Khác thẻ xe ở marketplace một cách có chủ đích: ở đó khách đang CHỌN xe nên ảnh lớn là đúng;
 * ở đây khách đã có xe và câu hỏi là "bao giờ, đang tới đâu, bao nhiêu tiền" — nên ảnh thu về
 * một ô vuông và thời gian chiếm chỗ chính.
 */
function TripCardImpl({ trip, onPress }: TripCardProps) {
  const t = useTranslations('Trips');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const meta = CUSTOMER_TRIP_STAGE_META[trip.stage as CustomerTripStage];

  /*
   * MỘT hàm mở cho cả thẻ lẫn mũi tên. Viết `() => onPress(trip)` hai chỗ là hai closure mới ở
   * mỗi lần render, tức `memo` của `Card` và của mũi tên không bao giờ ăn — mà thẻ này nằm trong
   * một danh sách dài.
   */
  const open = useCallback(() => onPress(trip), [onPress, trip]);

  return (
    <Card onPress={open} accessibilityLabel={trip.vehicle.name}>
      <YStack gap={space.sm}>
        <DetailArrow label={t('card.viewDetailOf', { name: trip.vehicle.name })} onPress={open} />

        <XStack gap={space.md}>
          {trip.vehicle.imageUrl ? (
            <Image
              source={{ uri: trip.vehicle.imageUrl }}
              style={{ width: THUMB, height: THUMB, borderRadius: radius.md }}
              resizeMode="cover"
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
            <StatusBadge
              label={domainLabel('customerTripStage', trip.stage, meta.label)}
              color={meta.color}
              size="sm"
            />

            {/* Tên xe là NHÂN VẬT CHÍNH: cùng cỡ với dòng "Chủ xe" thì phải đọc mới biết đâu là xe. */}
            <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold} numberOfLines={2}>
              {trip.vehicle.name}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {t('card.owner')}: {trip.shop.name}
            </Text>
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
            <Text col={colors.price} fos={fontSize.h4} fow={fontWeight.bold}>
              {fmt.money(trip.totalAmount)}
            </Text>
          ) : (
            <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
              {t('card.awaitingQuote')}
            </Text>
          )}
        </XStack>
      </YStack>
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
