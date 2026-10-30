import { useTranslations } from 'use-intl';
import { XP_TOKENS } from '@xeprime/ui';
import { HeaderChip } from '@/components/layout/HeaderChip';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';

/**
 * Nút đổi giao diện sáng/tối trên thanh đầu màn — bản native của `.themeToggle` trong
 * `MarketHeader` web, cùng vòng chip với tin nhắn/thông báo (`HeaderChip`). Biểu tượng nói chế
 * độ SẼ chuyển sang (mặt trăng khi đang sáng), như web. Đổi là áp dụng ngay, không tải lại app.
 *
 * Giao diện TỐI (`MarketHeader.module.css`, khối `[data-theme='dark'] .themeToggle`): nền
 * `color-bg-elevated` (#161f2c), viền `color-border` (#333741 — viền mặc định của chip ở palette
 * tối), biểu tượng vàng `color-primary-bright` (#edbb4f). Giao diện sáng giữ vòng chip chung.
 */
export function ThemeToggle() {
  const t = useTranslations('Navigation.public');
  const colors = useColors();
  const { scheme, setScheme } = useAppScheme();
  const dark = scheme === 'dark';

  return (
    <HeaderChip
      // Bộ icon nét design v2 như `MarketHeader` web (`LineIcon` sun/moon).
      icon={{ line: dark ? 'sun' : 'moon' }}
      skin={
        dark
          ? { surface: colors.surfaceElevated, glyph: XP_TOKENS['color-primary-bright'] }
          : undefined
      }
      onPress={() => setScheme(dark ? 'light' : 'dark')}
      accessibilityLabel={t('toggleTheme')}
      accessibilityHint={dark ? t('themeLight') : t('themeDark')}
    />
  );
}
