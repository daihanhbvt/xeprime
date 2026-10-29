import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { InteractionManager, StyleSheet } from 'react-native';
import { mixHex } from './color-mix';
import { readStoredScheme, saveScheme, syncNativeScheme } from './color-scheme';
import { PALETTES, type AppChartColors, type AppColors, type ColorScheme } from './tokens';

/**
 * Giao diện sáng/tối ĐỔI TỨC THÌ — bản native của `data-theme` bên web.
 *
 * Màu không còn là hằng số module: component đọc `useColors()`, style tĩnh đi qua `makeStyles()`.
 * Đổi giao diện là đổi một state ở đây; mọi màn đang mở vẽ lại với bảng kia, không tải lại app,
 * không mất form đang gõ hay vị trí cuộn.
 */
type ThemeContextValue = {
  scheme: ColorScheme;
  setScheme: (scheme: ColorScheme) => void;
};

const ThemeContext = createContext<ThemeContextValue | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [scheme, setSchemeState] = useState<ColorScheme>(() => {
    const initial = readStoredScheme();
    syncNativeScheme(initial);
    return initial;
  });

  const setScheme = useCallback((next: ColorScheme) => {
    setSchemeState(next);
    /*
     * Đồng bộ phần native và ghi Keystore SAU khung hình đổi màu: cả hai không đổi gì người dùng
     * thấy ngay, không đáng chen vào lượt render đang chạy. Ghi hỏng chỉ có nghĩa lần mở sau quay
     * về giao diện cũ.
     */
    InteractionManager.runAfterInteractions(() => {
      syncNativeScheme(next);
      void saveScheme(next).catch(() => undefined);
    });
  }, []);

  const value = useMemo(() => ({ scheme, setScheme }), [scheme, setScheme]);
  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

/** Ngoài provider (test, story) ⇒ sáng, như mặc định của app. */
export function useAppScheme(): ThemeContextValue {
  return useContext(ThemeContext) ?? FALLBACK;
}

const FALLBACK: ThemeContextValue = { scheme: 'light', setScheme: () => undefined };

export function useColors(): AppColors {
  return PALETTES[useAppScheme().scheme].colors;
}

export function useChartColors(): AppChartColors {
  return PALETTES[useAppScheme().scheme].chartColors;
}

/**
 * Một giá trị cấp module dựng TỪ màu (bảng tông, style chữ…) — như `makeStyles` nhưng không qua
 * `StyleSheet.create`. Dựng một lần cho mỗi giao diện, tham chiếu ổn định.
 */
export function themed<T>(factory: (colors: AppColors) => T): () => T {
  const ofPalette = byPalette(factory);
  return function useThemed() {
    return ofPalette(useColors());
  };
}

/**
 * Bản KHÔNG-hook của `themed` — cho hàm thuần (bảng tông lịch, tông nhãn) nhận bảng màu làm tham
 * số. Mỗi bảng màu dựng đúng một lần.
 */
export function byPalette<T>(factory: (colors: AppColors) => T): (colors: AppColors) => T {
  const cache = new WeakMap<AppColors, T>();
  return (colors) => {
    if (!cache.has(colors)) cache.set(colors, factory(colors));
    return cache.get(colors) as T;
  };
}

/**
 * `StyleSheet.create` theo giao diện — dựng MỘT lần cho mỗi bảng màu rồi giữ lại, nên tham chiếu
 * style ổn định giữa các lần render (không phá `memo`) mà vẫn đổi khi đổi giao diện.
 *
 * ```ts
 * const useStyles = makeStyles((colors) => ({ card: { backgroundColor: colors.surface } }));
 * // trong component:
 * const styles = useStyles();
 * ```
 */
export function makeStyles<T extends StyleSheet.NamedStyles<T>>(
  factory: (colors: AppColors) => T,
): () => T {
  const cache: Partial<Record<ColorScheme, T>> = {};
  return function useStyles() {
    const { scheme } = useAppScheme();
    return (cache[scheme] ??= StyleSheet.create(factory(PALETTES[scheme].colors)));
  };
}

/**
 * Viền cho bề mặt NỔI (tấm trượt, hộp thoại, menu, toast) — CHỈ ở giao diện tối.
 *
 * Ở nền tối, `surface` của tấm nổi gần như trùng nền màn phía sau, nên tấm trượt mất mép. Một
 * đường viền vàng thương hiệu dịu (45% primary trộn trên surface) vẽ lại mép đó mà không gắt như
 * primary đặc. Giao diện sáng giữ nguyên — trả object rỗng.
 *
 * - `sheet`: tấm neo đáy màn — viền trên + hai bên (đáy chạm mép màn, viền ở đó thừa).
 * - `all`: tấm trôi tự do (toast, popover) — viền bốn cạnh.
 *
 * Trải thẳng vào khung, SAU các prop viền sẵn có: `<YStack … {...floatingBorder} />`.
 */
export type FloatingBorderStyle = {
  borderTopWidth?: number;
  borderLeftWidth?: number;
  borderRightWidth?: number;
  borderBottomWidth?: number;
  borderColor?: string;
};

const FLOATING_BORDER_RATIO = 0.45;
const NO_BORDER: FloatingBorderStyle = {};
const floatingBorders = byPalette((colors): Record<'sheet' | 'all', FloatingBorderStyle> => {
  const borderColor = mixHex(colors.primary, colors.surface, FLOATING_BORDER_RATIO);
  const sides = { borderTopWidth: 1, borderLeftWidth: 1, borderRightWidth: 1, borderColor };
  return { sheet: sides, all: { ...sides, borderBottomWidth: 1 } };
});

export function useFloatingSurfaceBorder(shape: 'sheet' | 'all' = 'sheet'): FloatingBorderStyle {
  const { scheme } = useAppScheme();
  return scheme === 'dark' ? floatingBorders(PALETTES.dark.colors)[shape] : NO_BORDER;
}

/**
 * Chỉ MÀU viền bề mặt nổi (`null` ở giao diện sáng) — cho khung đã dùng `borderColor` vào việc
 * khác (toast: vạch nhấn mép trái) và phải tô từng cạnh riêng.
 */
export function useFloatingBorderColor(): string | null {
  return useFloatingSurfaceBorder('all').borderColor ?? null;
}

/**
 * Viền vàng NHẠT cho thẻ trong trang tách các mục danh sách (giao diện tối). Nhạt hơn bề mặt
 * nổi để danh sách dài không thành lưới vạch vàng. `{}` ở giao diện sáng. Chỉ đặt `borderColor`
 * (+ `borderWidth` 1) — thẻ tự giữ bo góc của mình.
 */
const CARD_BORDER_RATIO = 0.25;
const cardBorders = byPalette((colors): CardBorderStyle => ({
  borderWidth: 1,
  borderColor: mixHex(colors.primary, colors.surface, CARD_BORDER_RATIO),
}));

export type CardBorderStyle = { borderWidth?: number; borderColor?: string };
const NO_CARD_BORDER: CardBorderStyle = {};

export function useDarkAccentBorder(): CardBorderStyle {
  const { scheme } = useAppScheme();
  return scheme === 'dark' ? cardBorders(PALETTES.dark.colors) : NO_CARD_BORDER;
}
