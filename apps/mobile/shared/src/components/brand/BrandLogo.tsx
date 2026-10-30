import { SvgXml } from 'react-native-svg';
import { useAppScheme } from '@/theme/ThemeProvider';
import { APP_NAME } from '@/lib/app-name';
import { LOGO_GOLD_DARK, LOGO_GOLD_LIGHT, LOGO_GOLD_RATIO } from './logo-gold-xml';

/**
 * Logo "xe prime" của thanh trên — cùng artwork SVG với header web (`MarketHeader`), đổi bản theo
 * giao diện sáng/tối như web (người dùng chốt 28/10/2026: app trước dùng PNG vàng toàn bộ).
 */
export function BrandLogo({ height }: { height: number }) {
  const { scheme } = useAppScheme();
  return (
    <SvgXml
      xml={scheme === 'dark' ? LOGO_GOLD_DARK : LOGO_GOLD_LIGHT}
      width={Math.round(height * LOGO_GOLD_RATIO)}
      height={height}
      accessibilityRole="image"
      accessibilityLabel={APP_NAME}
    />
  );
}
