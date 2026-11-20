import { memo, type ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { STATUS_COLOR, type StatusColor } from '@xeprime/types';
import { themed } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';

export type PillTone =
  | 'brand'
  | 'brandSoft'
  | 'danger'
  | 'neutral'
  | 'success'
  | 'info'
  | 'warning'
  | 'purple'
  | 'pink';
/** `caption` = đệm 2/8, chữ 10/14 (viên "Sẵn sàng vận hành" của thẻ xe - Figma Vehicle List MB). */
export type PillSize = 'lg' | 'md' | 'sm' | 'caption';
/** `round` = bo 16 (viên đếm, viên dịch vụ); `tag` = bo 6 (nhãn trạng thái thẻ đơn - Figma "_Badge" vuông). */
export type PillShape = 'round' | 'tag';

/**
 * Bộ màu của "_Badge" v2 - mỗi tông là bộ ba nền nhạt · viền 300 · chữ đậm (Figma Overview MB):
 * vàng `#fff9e5/#fbdf85/#996f0e`, đỏ `#fef3f2/#fda29b/#b42318`, trung tính `#fafafa/#e9eaeb/#0e0f12`,
 * xanh lá `#ecfdf3/#6ce9a6/#039855`, xanh dương `#ebf6ff/#84caff/#1570ef`, tím `#f4f3ff/#bdb4fe`,
 * hồng `#fdf2fa/#faa7e0/#dd2590` (viên dịch vụ của thẻ đơn - Rental Request MB).
 */
export const usePillSkin = themed<Record<PillTone, { bg: string; border: string; fg: string }>>((colors) => ({
  brand: { bg: colors.brandLow, border: colors.brandBorder, fg: colors.brandHigh },
  /** Viên vàng chữ `text/brand/primary-2` ("3 cơ sở" của hàng phạm vi chi nhánh). */
  brandSoft: { bg: colors.brandLow, border: colors.brandBorder, fg: colors.brandLink },
  danger: { bg: colors.dangerSurface, border: colors.dangerBorder, fg: colors.dangerStrong },
  neutral: { bg: colors.background, border: colors.border, fg: colors.text },
  success: { bg: colors.successSurface, border: colors.successBorder, fg: colors.success },
  info: { bg: colors.infoLow, border: colors.infoBorder, fg: colors.infoStrong },
  warning: { bg: colors.warningSubtle, border: colors.warningBorder, fg: colors.warningHigh },
  purple: { bg: colors.purpleSurface, border: colors.purpleBorder, fg: colors.purpleStrong },
  pink: { bg: colors.pinkSurface, border: colors.pinkBorder, fg: colors.pink },
}));

/** Tông viên theo màu trạng thái dùng chung (`STATUS_COLOR` của `@xeprime/types`). */
export function pillToneOfStatusColor(color: StatusColor): PillTone {
  switch (color) {
    case STATUS_COLOR.INFO:
    case STATUS_COLOR.PROCESSING:
      return 'info';
    case STATUS_COLOR.SUCCESS:
      return 'success';
    case STATUS_COLOR.WAITING:
      return 'brand';
    case STATUS_COLOR.WARNING:
      return 'warning';
    case STATUS_COLOR.DANGER:
      return 'danger';
    case STATUS_COLOR.SPECIAL:
      return 'purple';
    case STATUS_COLOR.ACCENT:
      return 'pink';
    default:
      return 'neutral';
  }
}

/**
 * Viên nhãn v2 ("_Badge"): LUÔN có viền (luật chip của app, chốt 28/10/2026).
 * `lg` = đệm 2/8, chữ 14/20 (viên dịch vụ của thẻ đơn); `md` = đệm 2/8, chữ 12/18 đậm vừa (viên
 * đếm tab, "Nhận xe"); `sm` = đệm 2/4, chữ 10/14 (viên "Trễ 3 ngày" ở mép dòng lịch). `borderless`
 * cho viên đặt trong ô việc (Figma "7 quá hạn" không viền).
 */
export const Pill = memo(function Pill({
  label,
  tone = 'neutral',
  size = 'md',
  shape = 'round',
  borderless = false,
  leading,
}: {
  label: string;
  tone?: PillTone;
  size?: PillSize;
  shape?: PillShape;
  borderless?: boolean;
  /** Biểu tượng đứng TRƯỚC chữ, cùng trong viên (vd. ✓ "Đã kiểm duyệt"). Nơi gọi tô màu theo tông. */
  leading?: ReactNode;
}) {
  const skin = usePillSkin()[tone];
  const type = size === 'sm' || size === 'caption' ? typeScale.caption : size === 'lg' ? typeScale.body : typeScale.label;
  return (
    <YStack
      alignSelf="flex-start"
      flexShrink={0}
      px={size === 'sm' ? PAD_X_SM : PAD_X_MD}
      py={PAD_Y}
      br={shape === 'tag' ? TAG_RADIUS : radius.card}
      bg={skin.bg}
      bw={borderless ? 0 : 1}
      bc={skin.border}
      ai="center"
      jc="center"
    >
      <XStack ai="center" gap={LEADING_GAP}>
        {leading}
        <Text col={skin.fg} fos={type.fontSize} lh={type.lineHeight} fow={fontWeight.medium} numberOfLines={1}>
          {label}
        </Text>
      </XStack>
    </YStack>
  );
});

/** Figma "_Badge": `px 8 · py 2` (cỡ thường), `px 4` (cỡ nhỏ); dạng nhãn bo `num/6`. */
const PAD_X_MD = 8;
const PAD_X_SM = 4;
const PAD_Y = 2;
const TAG_RADIUS = 6;
/** Khe giữa biểu tượng `leading` và chữ. */
const LEADING_GAP = 4;
