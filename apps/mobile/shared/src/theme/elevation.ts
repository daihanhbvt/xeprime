import { XP_TOKENS } from '@xeprime/ui';
import { Platform, type ViewStyle } from 'react-native';

/**
 * iOS dùng `shadow*`, Android chỉ nhận `elevation` — viết tay ở từng component thì một
 * trong hai nền tảng luôn bị bỏ quên.
 *
 * Quy ước code lệch nền tảng: khác biệt nhỏ dùng `Platform.select` tại chỗ; khác biệt lớn
 * (cả cây JSX, API native riêng) tách `<Tên>.ios.tsx` / `<Tên>.android.tsx` cho Metro tự chọn.
 *
 * Giá trị đến từ token `shadow-*` của `@xeprime/ui` — cùng bóng với web, tông nâu ấm
 * `rgba(41,31,15,…)` chứ không phải đen. Gõ lại số ở đây là tạo nguồn thứ hai, và bóng của
 * app sẽ lặng lẽ trôi khỏi bóng của web.
 */

/**
 * `0 2px 4px 0 rgba(41, 31, 15, 0.06)` → phần iOS hiểu được.
 *
 * `px` là TUỲ CHỌN vì CSS cho phép viết `0` trần cho số không — và token của hệ đang viết
 * đúng như vậy ở offset đầu lẫn spread.
 */
function parseBoxShadow(value: string): {
  shadowColor: string;
  shadowOffset: { width: number; height: number };
  shadowOpacity: number;
  shadowRadius: number;
} {
  /*
   * iOS chỉ vẽ MỘT lớp bóng. Token nhiều lớp (`elevation-panel` = bóng lớn + viền tóc 1px) giữ lớp
   * ĐẦU — lớp tạo cảm giác nổi; dấu phẩy trong `rgba(...)` không phải chỗ tách.
   */
  const first = value.split(/,(?![^(]*\))/)[0] ?? value;
  const match =
    /^(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(
      first.trim(),
    );

  if (!match) {
    throw new Error(
      `Token bóng '${value}' không đúng dạng '<x> <y> <blur> <spread> rgba(r, g, b, a)' (đơn vị px tuỳ chọn) — cập nhật parser ở theme/elevation.ts.`,
    );
  }

  const [, x, y, blur, , r, g, b, alpha] = match as unknown as string[];

  return {
    // RN không nhận rgba trong `shadowColor`; độ mờ đi riêng qua `shadowOpacity`.
    shadowColor: `rgb(${r}, ${g}, ${b})`,
    shadowOffset: { width: Number(x), height: Number(y) },
    shadowOpacity: Number(alpha),
    // CSS blur là đường kính vùng mờ, `shadowRadius` của iOS là bán kính.
    shadowRadius: Number(blur) / 2,
  };
}

/**
 * Android không có khái niệm offset/blur riêng — chỉ một số `elevation`. Ánh xạ thủ công theo
 * ba bậc bóng của hệ thiết kế (Elevation 1/2/3 trong Figma).
 */
// Thẻ ở trạng thái nghỉ đổ bóng MẢNH (người dùng chốt 28/10/2026: giảm bóng các thẻ) — card = xs.
const ANDROID_ELEVATION = { xs: 1, card: 1, raised: 6, panel: 8, overlay: 12 } as const;

function shadow(
  level: keyof typeof ANDROID_ELEVATION,
  token: `shadow-${string}` | `elevation-${string}`,
): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: parseBoxShadow(XP_TOKENS[token as keyof typeof XP_TOKENS]),
    android: { elevation: ANDROID_ELEVATION[level] },
    default: {},
  }) as ViewStyle;
}

export const elevation = {
  /** `--xp-elevation-xs` — bóng mảnh của viên lọc / dải chọn (web `box-shadow: var(--xp-elevation-xs)`). */
  xs: shadow('xs', 'elevation-xs'),
  /** Thẻ ở trạng thái nghỉ. */
  // Thẻ nghỉ: bóng NHẠT HƠN nữa (người dùng chốt 28/10/2026, hai lần) — Android elevation 1 với màu bóng
  // nhạt (Android 9+ tôn trọng `shadowColor`), iOS nửa độ đậm của `elevation-xs`. Thẻ có viền nên vẫn tách nền.
  card: Platform.select<ViewStyle>({
    ios: { ...parseBoxShadow(XP_TOKENS['elevation-xs']), shadowOpacity: parseBoxShadow(XP_TOKENS['elevation-xs']).shadowOpacity / 2 },
    android: { elevation: 1, shadowColor: 'rgba(16, 24, 40, 0.35)' },
    default: {},
  }) as ViewStyle,
  /** Nổi lên: nhấn giữ, dropdown. */
  raised: shadow('raised', 'shadow-raised'),
  /** `--xp-elevation-panel` — bảng ô nhập của thẻ tìm kiếm trang chủ (`SearchCard .panel`). */
  panel: shadow('panel', 'elevation-panel'),
  /** Lớp phủ: modal, sheet. */
  overlay: shadow('overlay', 'shadow-overlay'),
} as const;
