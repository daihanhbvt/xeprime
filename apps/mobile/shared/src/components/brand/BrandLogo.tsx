import { SvgXml } from 'react-native-svg';
import { useAppScheme } from '@/theme/ThemeProvider';
import { APP_NAME } from '@/lib/app-name';
import { LOGO_GOLD_DARK, LOGO_GOLD_LIGHT, LOGO_GOLD_RATIO } from './logo-gold-xml';

/**
 * Logo "xe prime" của thanh trên — cùng artwork SVG với header web (`MarketHeader`), đổi bản theo
 * giao diện sáng/tối như web (người dùng chốt 28/10/2026: app trước dùng PNG vàng toàn bộ).
 */
export function BrandLogo({
  height,
  tone = 'auto',
}: {
  height: number;
  /** `dark` = đặt trên nền tối cố định (drawer site partner) — luôn dùng bản cho nền tối. */
  tone?: 'auto' | 'dark';
}) {
  const { scheme } = useAppScheme();
  const dark = tone === 'dark' || scheme === 'dark';
  return (
    <SvgXml
      xml={dark ? LOGO_GOLD_DARK : LOGO_GOLD_LIGHT}
      width={Math.round(height * LOGO_GOLD_RATIO)}
      height={height}
      accessibilityRole="image"
      accessibilityLabel={APP_NAME}
    />
  );
}
