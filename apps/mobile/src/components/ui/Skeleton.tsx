import { useEffect } from 'react';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { XStack, YStack } from 'tamagui';
import { colors, radius, space } from '@/theme/tokens';
import { duration } from '@/theme/motion';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  round?: boolean;
}

/**
 * Khung chờ có nhịp thở — dùng thay `ActivityIndicator` ở mọi chỗ đã biết trước HÌNH DẠNG nội
 * dung: khối xám đúng kích thước giữ nguyên bố cục nên trang không nhảy khi dữ liệu về.
 */
export function Skeleton({ width = '100%', height = 16, round = false }: SkeletonProps) {
  const pulse = useSharedValue(0.5);

  useEffect(() => {
    pulse.value = withRepeat(
      withTiming(1, { duration: duration.pulse, easing: Easing.inOut(Easing.ease) }),
      -1,
      true,
    );
  }, [pulse]);

  const style = useAnimatedStyle(() => ({ opacity: pulse.value }));

  return (
    <Animated.View style={style}>
      <YStack w={width} h={height} br={round ? radius.pill : radius.sm} bg={colors.surfaceMuted} />
    </Animated.View>
  );
}

/** Mấy dòng chữ giả, dòng cuối ngắn lại — các dòng bằng nhau trông như bảng, không như đoạn văn. */
export function SkeletonText({ lines = 3, height = 13 }: { lines?: number; height?: number }) {
  const widths: `${number}%`[] = ['100%', '92%', '96%', '88%'];

  return (
    <YStack gap={space.xs}>
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton
          key={i}
          height={height}
          width={i === lines - 1 ? '60%' : (widths[i % widths.length] as `${number}%`)}
        />
      ))}
    </YStack>
  );
}

/** Khung chờ cho một thẻ xe — cùng tỉ lệ ảnh và cùng số dòng với thẻ thật. */
export function VehicleCardSkeleton() {
  return (
    <YStack bg={colors.surface} br={radius.lg} bw={1} bc={colors.border} ov="hidden">
      <Skeleton height={190} />
      <YStack p={space.md} gap={space.sm}>
        <Skeleton width="70%" height={18} />
        <Skeleton width="45%" height={14} />
        <Skeleton width="60%" height={14} />
        <Skeleton width="35%" height={22} />
      </YStack>
    </YStack>
  );
}

/** Khung chờ cho một dòng danh sách có avatar (địa điểm, gian hàng). */
export function ListRowSkeleton() {
  return (
    <YStack bg={colors.surface} br={radius.md} bw={1} bc={colors.border} p={space.md}>
      <YStack gap={space.xs}>
        <Skeleton width="55%" height={16} />
        <Skeleton width="30%" height={12} />
      </YStack>
    </YStack>
  );
}

/** Khung chờ cho một thẻ chuyến — ảnh vuông trái, ba dòng phải, hàng tiền dưới cùng. */
export function TripCardSkeleton() {
  return (
    <YStack
      bg={colors.surface}
      br={radius.lg}
      bw={1}
      bc={colors.border}
      p={space.md}
      gap={space.sm}
    >
      <XStack gap={space.md}>
        <Skeleton width={72} height={72} />
        <YStack f={1} gap={space.xs}>
          <Skeleton width="35%" height={14} />
          <Skeleton width="80%" height={18} />
          <Skeleton width="50%" height={12} />
        </YStack>
      </XStack>
      <Skeleton width="65%" height={14} />
      <Skeleton width="40%" height={16} />
    </YStack>
  );
}

/** Khung chờ cho một thẻ đơn/yêu cầu ở khu quản lý — hàng trạng thái + hai cột thông tin. */
export function RecordCardSkeleton() {
  return (
    <YStack
      bg={colors.surface}
      br={radius.lg}
      bw={1}
      bc={colors.border}
      p={space.md}
      gap={space.sm}
    >
      <XStack jc="space-between" gap={space.sm}>
        <Skeleton width="30%" height={14} />
        <Skeleton width="22%" height={14} />
      </XStack>
      <Skeleton width="70%" height={18} />
      <Skeleton width="55%" height={13} />
      <Skeleton width="45%" height={13} />
    </YStack>
  );
}

/** Khung chờ cho trang chi tiết xe — dựng đúng hình dạng thật để nội dung về không đẩy trang. */
export function ListingDetailSkeleton() {
  return (
    <YStack f={1} bg={colors.background}>
      <Skeleton height={260} />

      <YStack
        bg={colors.background}
        borderTopLeftRadius={radius.lg}
        borderTopRightRadius={radius.lg}
        mt={-space.lg}
        p={space.md}
        gap={space.lg}
      >
        <YStack gap={space.sm}>
          <Skeleton width="80%" height={24} />
          <Skeleton width="50%" height={14} />
          <Skeleton width="35%" height={14} />
        </YStack>

        <XStack gap={space.sm}>
          <Skeleton width="30%" height={36} round />
          <Skeleton width="30%" height={36} round />
          <Skeleton width="30%" height={36} round />
        </XStack>

        <YStack
          bg={colors.surface}
          br={radius.lg}
          bw={1}
          bc={colors.border}
          p={space.md}
          gap={space.sm}
        >
          <Skeleton width="40%" height={26} />
          <Skeleton width="65%" height={14} />
        </YStack>

        <YStack gap={space.sm}>
          <Skeleton width="30%" height={18} />
          {Array.from({ length: 4 }, (_, i) => (
            <XStack key={i} jc="space-between" gap={space.md}>
              <Skeleton width="35%" height={14} />
              <Skeleton width="30%" height={14} />
            </XStack>
          ))}
        </YStack>

        <YStack gap={space.sm}>
          <Skeleton width="25%" height={18} />
          <SkeletonText lines={3} />
        </YStack>

        <XStack ai="center" gap={space.sm}>
          <Skeleton width={44} height={44} round />
          <YStack f={1} gap={space.xs}>
            <Skeleton width="55%" height={16} />
            <Skeleton width="35%" height={12} />
          </YStack>
        </XStack>
      </YStack>
    </YStack>
  );
}

/** Khung chờ cho màn tài khoản: avatar + tên/email, rồi các hàng thiết lập. */
export function ProfileSkeleton() {
  return (
    <YStack gap={space.lg}>
      <XStack ai="center" gap={space.md}>
        <Skeleton width={64} height={64} round />
        <YStack f={1} gap={space.xs}>
          <Skeleton width="60%" height={20} />
          <Skeleton width="45%" height={13} />
        </YStack>
      </XStack>

      {Array.from({ length: 3 }, (_, i) => (
        <YStack
          key={i}
          bg={colors.surface}
          br={radius.lg}
          bw={1}
          bc={colors.borderSubtle}
          p={space.md}
        >
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Skeleton width="40%" height={16} />
            <Skeleton width={72} height={28} round />
          </XStack>
        </YStack>
      ))}
    </YStack>
  );
}
