import { createAnimations } from '@tamagui/animations-react-native';
import { createTamagui, createFont, createTokens } from 'tamagui';
import { FONT_FAMILY } from './fonts';
import { duration } from './motion';
import { colors, fontSize, fontWeight, radius, sizing, space } from './tokens';

/**
 * Tamagui đọc CHÍNH bảng token native ở `./tokens.ts`, tức vẫn là `XP_TOKENS` của
 * `@xeprime/ui` (ADR 0003). Không có bảng màu thứ hai ở đây: `$primary` trong một component
 * Tamagui và `colors.primary` trong một `StyleSheet` phải luôn ra cùng một mã màu, nếu không
 * app sẽ trôi dần thành hai giao diện trong cùng một màn hình.
 *
 * Đổi màu/khoảng cách thì sửa ở `@xeprime/ui`, không sửa file này.
 */

const size = {
  0: 0,
  xs: space.xs,
  sm: space.sm,
  md: space.md,
  lg: space.lg,
  xl: space.xl,
  /** Sàn vùng chạm 44pt/48dp — dùng cho chiều cao control, không gõ số. */
  touch: sizing.touchTarget,
  true: space.md,
};

const tokens = createTokens({
  color: colors,
  space: { 0: 0, xs: space.xs, sm: space.sm, md: space.md, lg: space.lg, xl: space.xl, true: space.md },
  size,
  radius: { 0: 0, sm: radius.sm, md: radius.md, lg: radius.lg, pill: radius.pill, true: radius.md },
  zIndex: { 0: 0, sticky: 10, overlay: 100, modal: 200, toast: 300 },
});

/**
 * Một theme duy nhất (sáng). `app.json` khoá `userInterfaceStyle: "light"` vì `@xeprime/ui`
 * chưa có palette tối — mở dark mode phải làm ở package dùng chung trước, không phải ở đây.
 */
const light = {
  background: colors.background,
  backgroundHover: colors.surfaceMuted,
  backgroundPress: colors.surfaceSelected,
  backgroundFocus: colors.surfaceSelected,
  color: colors.text,
  colorHover: colors.text,
  colorPress: colors.text,
  colorFocus: colors.text,
  borderColor: colors.border,
  borderColorHover: colors.borderInput,
  borderColorFocus: colors.primary,
  borderColorPress: colors.borderInput,
  placeholderColor: colors.placeholder,
  shadowColor: 'rgba(0,0,0,0.12)',
};

const bodyFont = createFont({
  family: FONT_FAMILY.body,
  face: {
    [fontWeight.regular]: { normal: FONT_FAMILY.body },
    [fontWeight.medium]: { normal: FONT_FAMILY.medium },
    [fontWeight.semibold]: { normal: FONT_FAMILY.semibold },
    [fontWeight.bold]: { normal: FONT_FAMILY.bold },
  },
  size: {
    1: fontSize.label,
    2: fontSize.bodySm,
    3: fontSize.body,
    4: fontSize.bodyLg,
    5: fontSize.h4,
    6: fontSize.h3,
    7: fontSize.h2,
    8: fontSize.h1,
    true: fontSize.body,
  },
  lineHeight: {
    1: fontSize.label * 1.5,
    2: fontSize.bodySm * 1.5,
    3: fontSize.body * 1.5,
    4: fontSize.bodyLg * 1.5,
    5: fontSize.h4 * 1.4,
    6: fontSize.h3 * 1.35,
    7: fontSize.h2 * 1.3,
    8: fontSize.h1 * 1.25,
    true: fontSize.body * 1.5,
  },
  weight: {
    1: fontWeight.regular,
    4: fontWeight.regular,
    5: fontWeight.medium,
    6: fontWeight.semibold,
    7: fontWeight.bold,
    true: fontWeight.regular,
  },
});

const animations = createAnimations({
  fast: { type: 'timing', duration: duration.fast },
  medium: { type: 'timing', duration: duration.base },
  slow: { type: 'timing', duration: duration.slow },
});

const displayFont = createFont({
  family: FONT_FAMILY.display,
  face: { [fontWeight.bold]: { normal: FONT_FAMILY.display } },
  size: bodyFont.size,
  lineHeight: bodyFont.lineHeight,
  weight: { true: fontWeight.bold },
});

export const tamaguiConfig = createTamagui({
  animations,
  tokens,
  themes: { light, dark: light },
  fonts: { body: bodyFont, heading: displayFont },
  defaultTheme: 'light',
  shorthands: {
    bg: 'backgroundColor',
    br: 'borderRadius',
    bw: 'borderWidth',
    bc: 'borderColor',
    f: 'flex',
    fd: 'flexDirection',
    ai: 'alignItems',
    jc: 'justifyContent',
    p: 'padding',
    px: 'paddingHorizontal',
    py: 'paddingVertical',
    pt: 'paddingTop',
    pb: 'paddingBottom',
    m: 'margin',
    mx: 'marginHorizontal',
    my: 'marginVertical',
    mt: 'marginTop',
    mb: 'marginBottom',
    w: 'width',
    h: 'height',
    ta: 'textAlign',
    fos: 'fontSize',
    fow: 'fontWeight',
    lh: 'lineHeight',
    col: 'color',
    ov: 'overflow',
    pos: 'position',
    zi: 'zIndex',
    gap: 'gap',
  } as const,
  media: {
    /** Điện thoại nhỏ (iPhone SE ≈ 320pt): chỗ duy nhất lưới trang chủ phải rơi về 1 cột. */
    short: { maxWidth: 360 },
    tall: { minWidth: 361 },
  },
});

/**
 * `@tamagui/babel-plugin` NẠP CHÍNH FILE NÀY lúc build và chỉ nhận `export default` hoặc
 * `export const config` — một export đặt tên khác thì nó báo "Missing themes… Got config: null"
 * và làm chết cả jest worker, chứ không phải cảnh báo bỏ qua được.
 */
export const config = tamaguiConfig;
export default tamaguiConfig;

export type AppTamaguiConfig = typeof tamaguiConfig;

declare module 'tamagui' {
  // eslint-disable-next-line @typescript-eslint/no-empty-object-type
  interface TamaguiCustomConfig extends AppTamaguiConfig {}
}
