import { Platform, type ViewStyle } from 'react-native';

/**
 * iOS dùng `shadow*`, Android chỉ nhận `elevation` — viết tay ở từng component thì một
 * trong hai nền tảng luôn bị bỏ quên.
 *
 * Quy ước code lệch nền tảng: khác biệt nhỏ dùng `Platform.select` tại chỗ; khác biệt lớn
 * (cả cây JSX, API native riêng) tách `<Tên>.ios.tsx` / `<Tên>.android.tsx` cho Metro tự chọn.
 */
export const elevation = {
  card: Platform.select<ViewStyle>({
    ios: {
      shadowColor: '#000000',
      shadowOffset: { width: 0, height: 1 },
      shadowOpacity: 0.06,
      shadowRadius: 3,
    },
    android: { elevation: 2 },
    default: {},
  }) as ViewStyle,
} as const;
