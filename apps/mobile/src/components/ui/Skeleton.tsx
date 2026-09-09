import { useEffect } from 'react';
import { StyleSheet } from 'react-native';
import Animated, {
  Easing,
  useAnimatedStyle,
  useSharedValue,
  withRepeat,
  withTiming,
} from 'react-native-reanimated';
import { XStack, YStack } from 'tamagui';
import { SHOP_COVER_RATIO, SHOP_LOGO } from './ShopCover';
import { colors, radius, space } from '@/theme/tokens';
import { duration } from '@/theme/motion';

interface SkeletonProps {
  width?: number | `${number}%`;
  height?: number;
  /**
   * Cao theo TỈ LỆ với bề rộng thật, thay cho `height` — dùng cho khối ảnh, thứ mà chiều cao phụ
   * thuộc bề ngang màn. Một con số cứng ở đây là đúng trên máy này và lệch trên máy khác, và
   * lệch chiều cao khung chờ nghĩa là danh sách nhảy đúng lúc dữ liệu về.
   */
  aspectRatio?: number;
  /**
   * Phủ kín ô đựng, bất kể ô đó cao rộng bao nhiêu — cho khung chờ nằm DƯỚI một tấm ảnh.
   *
   * Không dùng `height: '100%'` được: khối thở nằm trong một `Animated.View` cao tự động, mà
   * phần trăm thì quy theo cha đã resolve — kết quả là chiều cao 0.
   */
  fill?: boolean;
  round?: boolean;
}

/**
 * Khung chờ có nhịp thở — dùng thay `ActivityIndicator` ở mọi chỗ đã biết trước HÌNH DẠNG nội
 * dung: khối xám đúng kích thước giữ nguyên bố cục nên trang không nhảy khi dữ liệu về.
 */
export function Skeleton({
  width = '100%',
  height = 16,
  aspectRatio,
  fill = false,
  round = false,
}: SkeletonProps) {
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
    /* `alignSelf: stretch` là thứ cho khối theo tỉ lệ một bề rộng để mà suy ra chiều cao. */
    <Animated.View style={fill ? [style, absoluteFill] : aspectRatio ? [style, stretch] : style}>
      <YStack
        {...(fill ? { f: 1 } : { w: width, ...(aspectRatio ? { aspectRatio } : { h: height }) })}
        br={round ? radius.pill : radius.sm}
        bg={colors.surfaceMuted}
      />
    </Animated.View>
  );
}

const stretch = { alignSelf: 'stretch' } as const;
const absoluteFill = StyleSheet.absoluteFillObject;

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

/**
 * Khung chờ cho thẻ xe của ĐỘI XE — ảnh 16:9, hai dòng định danh, dải nhãn, hàng ba chỉ số và
 * thanh thao tác.
 *
 * Riêng khỏi {@link VehicleCardSkeleton} (thẻ xe ngoài chợ) vì hai thẻ khác hẳn phần chân: thẻ
 * quản lý có hàng chỉ số và thanh thao tác, thiếu chúng thì danh sách nhảy đúng 90pt khi dữ liệu
 * về.
 */
export function FleetVehicleCardSkeleton() {
  return (
    <YStack bg={colors.surface} br={radius.lg} bw={1} bc={colors.border} ov="hidden">
      <Skeleton aspectRatio={2} />
      <YStack p={space.md} gap={space.sm}>
        <Skeleton width="65%" height={18} />
        <Skeleton width="80%" height={14} />
        <Skeleton width="55%" height={20} />
        <XStack gap={space.md}>
          <Skeleton width="28%" height={28} />
          <Skeleton width="28%" height={28} />
          <Skeleton width="28%" height={28} />
        </XStack>
      </YStack>
      <Skeleton height={48} />
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

/**
 * Khung chờ cho một dải dòng XEM NHANH trong thẻ — hai dòng chữ bên trái, nhãn + tiền bên phải.
 *
 * Đúng hình của `BookingMiniList` / `ReceiptMiniList` ở màn Tổng quan, kể cả nét kẻ giữa hai
 * dòng: `SkeletonText` chỉ vẽ mấy vạch chữ chạy hết bề ngang nên khi dữ liệu về, cột phải hiện
 * ra và cả khối đổi hình. Số dòng lấy đúng số dòng sắp hiện.
 */
export function MiniRowsSkeleton({ rows = 3 }: { rows?: number }) {
  return (
    <YStack>
      {Array.from({ length: rows }, (_, i) => (
        <YStack key={i}>
          {i > 0 ? <YStack h={1} bg={colors.borderSubtle} /> : null}
          <XStack ai="center" gap={space.sm} px={space.md} py={space.sm}>
            <YStack f={1} gap={space.xs}>
              <Skeleton width="55%" height={13} />
              <Skeleton width="80%" height={11} />
            </YStack>
            <YStack gap={space.xs} ai="flex-end">
              <Skeleton width={56} height={16} round />
              <Skeleton width={72} height={13} />
            </YStack>
          </XStack>
        </YStack>
      ))}
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

/**
 * Khung chờ cho một thẻ bản ghi có THANH THAO TÁC ở chân — chi nhánh, tài xế, người dùng.
 *
 * Riêng khỏi {@link RecordCardSkeleton} vì hai thẻ khác nhau ở chân: thẻ này có vạch trạng thái
 * ở mép trái và một thanh thao tác cao 48pt, còn phần thân thì chật hơn (đệm 8 / khe 4). Dùng
 * khung chờ kia cho nó thì danh sách nhảy đúng lúc dữ liệu về — hỏng đúng thứ mà khung chờ sinh
 * ra để tránh.
 */
export function ActionCardSkeleton() {
  return (
    <YStack bg={colors.surface} br={radius.lg} bw={1} bc={colors.border} ov="hidden">
      <XStack>
        {/* Vạch trạng thái ở mép trái — xám, vì lúc chờ thì chưa biết trạng thái nào. */}
        <YStack w={4} bg={colors.surfaceMuted} />

        <YStack f={1}>
          <YStack p={space.sm} gap={space.xs}>
            {/* Tên · chip · hai mẩu giá trị · dòng ngữ cảnh — đúng thứ tự của thẻ thật. */}
            <Skeleton width="55%" height={18} />
            <XStack gap={space.xs}>
              <Skeleton width={72} height={18} round />
              <Skeleton width={96} height={18} round />
            </XStack>
            <XStack gap={space.sm}>
              <Skeleton width="32%" height={14} />
              <Skeleton width="40%" height={14} />
            </XStack>
            <Skeleton width="70%" height={14} />
          </YStack>

          <YStack h={1} bg={colors.borderSubtle} />
          <Skeleton height={48} />
        </YStack>
      </XStack>
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

/** Khung chờ màn hồ sơ gian hàng: bìa tràn viền · logo tròn đè lên · tên · các khối biểu mẫu. */
export function ShopProfileSkeleton() {
  return (
    <YStack>
      <Skeleton aspectRatio={SHOP_COVER_RATIO} />

      <YStack px={space.md} gap={space.lg} mt={-SHOP_LOGO / 2}>
        <YStack gap={space.sm}>
          <Skeleton width={SHOP_LOGO} height={SHOP_LOGO} round />
          <Skeleton width="55%" height={20} />
          <Skeleton width={96} height={20} round />
          <SkeletonText lines={2} />
        </YStack>

        {Array.from({ length: 2 }, (_, i) => (
          <YStack key={i} gap={space.sm}>
            <Skeleton width="35%" height={13} />
            <YStack bg={colors.surface} br={radius.lg} bw={1} bc={colors.borderSubtle} p={space.md}>
              <SkeletonText lines={3} height={16} />
            </YStack>
          </YStack>
        ))}
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

/**
 * Khung chờ trang gian hàng công khai (MKT-05): bìa tràn viền · logo tròn đè lên · tên · dòng
 * meta · vài thẻ xe.
 *
 * Hai số hình học đọc thẳng từ `ShopCover` — chính component vẽ ảnh bìa và logo thật, ở cả
 * trang công khai lẫn khu quản lý. Khung chờ mà lệch với nó là đầu trang nhảy đúng lúc dữ liệu
 * về, thứ mà khung chờ sinh ra để tránh.
 */
export function ShopDetailSkeleton() {
  return (
    <YStack>
      <Skeleton aspectRatio={SHOP_COVER_RATIO} />

      <YStack px={space.md} gap={space.lg} mt={-SHOP_LOGO / 2}>
        <YStack gap={space.sm}>
          <Skeleton width={SHOP_LOGO} height={SHOP_LOGO} round />
          <Skeleton width="55%" height={20} />
          <Skeleton width="40%" height={13} />
        </YStack>

        <YStack gap={space.md}>
          <Skeleton width="45%" height={18} />
          {Array.from({ length: 2 }, (_, i) => (
            <VehicleCardSkeleton key={i} />
          ))}
        </YStack>
      </YStack>
    </YStack>
  );
}
