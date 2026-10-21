import { useTranslations } from 'use-intl';
import { HeaderChip } from '@/components/layout/HeaderChip';
import { useAppScheme } from '@/theme/ThemeProvider';

/**
 * Nút đổi giao diện sáng/tối trên thanh đầu màn — bản native của `.themeToggle` trong
 * `MarketHeader` web, cùng vòng chip với tin nhắn/thông báo (`HeaderChip`). Biểu tượng nói chế
 * độ SẼ chuyển sang (mặt trăng khi đang sáng), như web. Đổi là áp dụng ngay, không tải lại app.
 */
export function ThemeToggle() {
  const t = useTranslations('Navigation.public');
  const { scheme, setScheme } = useAppScheme();
  const dark = scheme === 'dark';

  return (
    <HeaderChip
      icon={dark ? 'sunny-outline' : 'moon-outline'}
      onPress={() => setScheme(dark ? 'light' : 'dark')}
      accessibilityLabel={t('toggleTheme')}
      accessibilityHint={dark ? t('themeLight') : t('themeDark')}
    />
  );
}
