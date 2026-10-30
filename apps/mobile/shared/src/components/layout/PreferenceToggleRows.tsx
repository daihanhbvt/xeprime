import { XP_TOKENS, toPx } from '@xeprime/ui';
import type { ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { elevation } from '@/theme/elevation';
import { LOCALES } from '@/i18n/config';
import { useAppLocale } from '@/i18n/I18nProvider';
import { makeStyles, useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space, type ColorScheme } from '@/theme/tokens';

/* Token lẻ của `MarketAccountMenu.module.css` quy ra số. */
const SPACE_2 = toPx(XP_TOKENS['space-2']);
const SPACE_12 = toPx(XP_TOKENS['space-12']);
/** `.row { min-height: 40px }`, `.toggleButton` 32×32, icon 20 (`.rowIcon`/`.toggleIcon`). */
const ROW_MIN_HEIGHT = 40;
const TOGGLE_SIZE = 32;
const ICON = 20;

const THEME_OPTIONS: readonly {
  mode: ColorScheme;
  icon: LineIconName;
  labelKey: 'themeLight' | 'themeDark';
}[] = [
  { mode: 'light', icon: 'sun', labelKey: 'themeLight' },
  { mode: 'dark', icon: 'moon', labelKey: 'themeDark' },
];

/**
 * Hai hàng tuỳ chọn THIẾT BỊ dùng chung cho menu avatar (`AccountMenuSheet`) và thẻ hồ sơ ở tab
 * Tài khoản (`AccountProfileCard`) — người dùng chốt 27/10/2026 đặt ở CẢ HAI chỗ, cùng một kiểu
 * hàng, nên một bản vẽ duy nhất ở đây thay vì hai bản lệch nhau.
 *
 * Hình theo `.row` + `.toggle` của `MarketAccountMenu` web: icon nét tertiary 20 · nhãn body 14
 * medium `text-secondary` · nhóm nút gạt bên phải. Cả dòng KHÔNG bấm được — chỉ các nút gạt.
 */

/** Hàng "Giao diện" — palette + hai nút ☀ / ☾ (web `THEME_OPTIONS`, chỉ sáng/tối). */
/**
 * `onBeforeChange`: hàng nằm trong một `Modal` (menu avatar) thì ĐÓNG tấm trước rồi mới đổi theme —
 * `Appearance.setColorScheme` lúc Modal đang mở làm Android dựng lại cửa sổ Modal và nội dung tấm
 * thành màn trắng (người dùng báo 28/10/2026: tối → sáng thì trắng màn).
 */
export function AppearanceToggleRow({
  onBeforeChange,
}: { onBeforeChange?: (apply: () => void) => void } = {}) {
  const colors = useColors();
  const t = useTranslations('Navigation.public');
  const { scheme, setScheme } = useAppScheme();
  return (
    <PreferenceRow icon="palette" label={t('appearance')}>
      <Toggle label={t('toggleTheme')}>
        {THEME_OPTIONS.map((option) => {
          const active = scheme === option.mode;
          return (
            <ToggleButton
              key={option.mode}
              active={active}
              label={t(option.labelKey)}
              onPress={() => {
                if (active) return;
                const apply = () => setScheme(option.mode);
                if (onBeforeChange) onBeforeChange(apply);
                else apply();
              }}
            >
              <LineIcon
                name={option.icon}
                size={ICON}
                color={active ? colors.primary : colors.placeholder}
              />
            </ToggleButton>
          );
        })}
      </Toggle>
    </PreferenceRow>
  );
}

/** Hàng "Ngôn ngữ" — globe + VI / EN dạng chữ (`.toggleText` body 14 medium). */
export function LocaleToggleRow() {
  const colors = useColors();
  const tLocale = useTranslations('Common.locale');
  const { locale, setLocale } = useAppLocale();
  return (
    <PreferenceRow icon="globe" label={tLocale('switchLabel')}>
      <Toggle label={tLocale('switchLabel')}>
        {LOCALES.map((value) => {
          const active = value === locale;
          return (
            <ToggleButton
              key={value}
              active={active}
              label={tLocale(value)}
              onPress={() => setLocale(value)}
            >
              <Text
                col={active ? colors.primary : colors.placeholder}
                fos={fontSize.body}
                fow={fontWeight.medium}
              >
                {tLocale(`${value}Short`)}
              </Text>
            </ToggleButton>
          );
        })}
      </Toggle>
    </PreferenceRow>
  );
}

/** `.row` — min-h 40, đệm sm/sm/sm/12, khe sm, bo `radius-sm`; icon tertiary 20 + `.rowLabel`. */
function PreferenceRow({
  icon,
  label,
  children,
}: {
  icon: LineIconName;
  label: string;
  children: ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <XStack style={styles.row}>
      <LineIcon name={icon} size={ICON} color={colors.placeholder} />
      <Text
        f={1}
        minWidth={0}
        col={colors.textMuted}
        fos={fontSize.body}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {label}
      </Text>
      {children}
    </XStack>
  );
}

/** `.toggle` — viền `color-border` 1px, bo control, nền `color-bg`, khe 2. */
function Toggle({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <XStack
      ai="center"
      gap={SPACE_2}
      bw={1}
      bc={colors.border}
      br={radius.control}
      bg={colors.background}
      accessibilityRole="radiogroup"
      accessibilityLabel={label}
    >
      {children}
    </XStack>
  );
}

/**
 * `.toggleButton` 32×32, viền trong suốt (đổi lựa chọn không làm nhóm nhích 1px).
 * `.toggleActive` — viền `border-strong`, nền `bg-container`, bóng xs; icon/chữ `primary`.
 */
function ToggleButton({
  active,
  label,
  onPress,
  children,
}: {
  active: boolean;
  label: string;
  onPress: () => void;
  children: ReactNode;
}) {
  const styles = useStyles();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="radio"
      accessibilityState={{ selected: active }}
      accessibilityLabel={label}
      style={[styles.toggleButton, active ? styles.toggleActive : null]}
    >
      {children}
    </Pressable>
  );
}

const useStyles = makeStyles((colors) => ({
  row: {
    alignItems: 'center',
    borderRadius: radius.sm,
    flexDirection: 'row',
    gap: space.sm,
    minHeight: ROW_MIN_HEIGHT,
    paddingBottom: space.sm,
    paddingLeft: SPACE_12,
    paddingRight: space.sm,
    paddingTop: space.sm,
  },
  toggleButton: {
    alignItems: 'center',
    borderColor: 'transparent',
    borderRadius: radius.control,
    borderWidth: 1,
    height: TOGGLE_SIZE,
    justifyContent: 'center',
    width: TOGGLE_SIZE,
  },
  toggleActive: {
    ...elevation.xs,
    backgroundColor: colors.surface,
    borderColor: colors.borderInput,
  },
}));
