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
  const match =
    /^(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+(-?[\d.]+)(?:px)?\s+rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)$/.exec(
      value.trim(),
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
const ANDROID_ELEVATION = { card: 2, raised: 6, overlay: 12 } as const;

function shadow(level: keyof typeof ANDROID_ELEVATION, token: `shadow-${string}`): ViewStyle {
  return Platform.select<ViewStyle>({
    ios: parseBoxShadow(XP_TOKENS[token as keyof typeof XP_TOKENS]),
    android: { elevation: ANDROID_ELEVATION[level] },
    default: {},
  }) as ViewStyle;
}

export const elevation = {
  /** Thẻ ở trạng thái nghỉ. */
  card: shadow('card', 'shadow-card'),
  /** Nổi lên: nhấn giữ, dropdown. */
  raised: shadow('raised', 'shadow-raised'),
  /** Lớp phủ: modal, sheet. */
  overlay: shadow('overlay', 'shadow-overlay'),
} as const;
