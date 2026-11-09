import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { gradient } from '@/theme/tokens';

/**
 * Trạng thái "thẻ đang nổi" DÙNG CHUNG cho mọi thẻ bấm được của app (người dùng chốt 27/10/2026):
 * thẻ đang nhấn, và thẻ đang ở GIỮA băng chuyền trang chủ (Xe tiêu biểu · Gian hàng nổi bật · Đánh
 * giá) — bản cảm ứng của hover thẻ danh sách web (`CustomerTripCard.module.css` `.card:hover`):
 *
 * - viền `color-primary-glow` (`useCardHighlightBorder`);
 * - nền `gradient-card-hover` — vàng 20% phủ lên mặt thẻ, 174.5° ≈ trên xuống (`CardHighlightOverlay`).
 *
 * Một chỗ duy nhất: đổi màu ở đây là mọi thẻ đổi theo. Đừng tự pha lại ở từng màn.
 */
/*
 * Token web có HAI lớp: vàng 20% + lớp trắng đặc phía sau (`linear-gradient(...), linear-gradient(90deg,
 * #fff, #fff)`). App phủ lớp này LÊN nền thẻ có sẵn, nên chỉ lấy lớp vàng — hai điểm màu đầu; đọc cả
 * bốn là vẽ luôn dải trắng đục đè mất nội dung thẻ.
 */
const CARD_HOVER_ALL = gradient('gradient-card-hover');
const CARD_HOVER = {
  colors: CARD_HOVER_ALL.colors.slice(0, 2) as [string, string],
  locations: CARD_HOVER_ALL.locations.slice(0, 2) as [number, number],
};
/*
 * Bản TỐI của `--xp-gradient-card-hover` (tokens.css khối `[data-theme=dark]`, Figma dark 19879:66185):
 * vàng trầm 20% trên nền thẻ tối. Dùng lớp sáng ở giao diện tối là phủ be 20% lên #0e0f12 ⇒ thẻ xám đục.
 */
const CARD_HOVER_DARK = {
  colors: ['rgba(56, 41, 17, 0.2)', 'rgba(36, 30, 11, 0.2)'] as [string, string],
  locations: [0.24208, 0.88612] as [number, number],
};
const START = { x: 0.45, y: 0 };
const END = { x: 0.55, y: 1 };

/** Màu viền khi thẻ đang nổi. */
export function useCardHighlightBorder(): string {
  return useColors().primaryGlow;
}

/**
 * Lớp nền vàng phủ kín thẻ — đặt làm con ĐẦU TIÊN của khối thẻ (khối phải `overflow: hidden`
 * hoặc truyền `radius` cho khớp bo góc). Không nhận chạm.
 */
export function CardHighlightOverlay({ radius }: { radius?: number }) {
  const g = useAppScheme().scheme === 'dark' ? CARD_HOVER_DARK : CARD_HOVER;
  return (
    <LinearGradient
      colors={g.colors}
      locations={g.locations}
      start={START}
      end={END}
      style={[StyleSheet.absoluteFill, radius != null ? { borderRadius: radius } : null]}
      pointerEvents="none"
    />
  );
}
