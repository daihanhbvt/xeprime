import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet, View } from 'react-native';
import { IS_PARTNER_APP } from '@/lib/app-kind';
import { useAppScheme } from '@/theme/ThemeProvider';

/**
 * Nền trang app Partner - Figma "Overview MB" `24175:52345` (feedback thiết kế 20/11/2026, dòng 6):
 * nền `#fafafa` (đã là nền trang) phủ hai dải rất nhạt - ấm từ mép TRÁI (`rgba(244,243,232,.6)` tắt
 * ở ~37%), xanh tím từ mép PHẢI (`rgba(227,229,248,.5)` tắt ở ~38%). Góc Figma ~96° / ~-87° gần như
 * ngang nên dựng bằng hai `LinearGradient` ngang.
 *
 * Chỉ app Partner, chỉ nền SÁNG (nền tối giữ màu đặc). Không bắt chạm (`pointerEvents="none"`).
 */
export function PartnerBackdrop() {
  const { scheme } = useAppScheme();
  if (!IS_PARTNER_APP || scheme === 'dark') return null;
  return (
    <View pointerEvents="none" style={StyleSheet.absoluteFill}>
      <LinearGradient
        colors={['rgba(244, 243, 232, 0.6)', 'rgba(255, 255, 255, 0)']}
        locations={[0.005, 0.37]}
        start={{ x: 0, y: 0.5 }}
        end={{ x: 1, y: 0.4 }}
        style={StyleSheet.absoluteFill}
      />
      <LinearGradient
        colors={['rgba(227, 229, 248, 0.5)', 'rgba(255, 255, 255, 0)']}
        locations={[0.088, 0.38]}
        start={{ x: 1, y: 0.5 }}
        end={{ x: 0, y: 0.45 }}
        style={StyleSheet.absoluteFill}
      />
    </View>
  );
}
