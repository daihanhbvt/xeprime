import { useEffect } from 'react';
import { BackHandler, StyleSheet } from 'react-native';
import Animated, { SlideInRight, SlideOutRight } from 'react-native-reanimated';
import type { LegalDoc } from '@xeprime/domain';
import { useColors } from '@/theme/ThemeProvider';
import { LegalDocScreen } from './LegalDocScreen';

/**
 * Văn bản pháp lý mở ĐÈ LÊN tấm trượt đang mở (vd "Chính sách huỷ" trong tấm Phê duyệt): cùng
 * màn `LegalDocScreen`, vẽ toàn màn ở host của tấm, tầng TRÊN tấm gọi. Lui (← hoặc nút Back
 * Android) chỉ gỡ lớp này - tấm bên dưới vẫn nguyên, không đóng rồi mở lại (người dùng 20/11/2026).
 */
export function LegalDocOverlay({ doc, onClose }: { doc: LegalDoc; onClose: () => void }) {
  const colors = useColors();

  // Đăng ký SAU tấm bên dưới ⇒ được gọi TRƯỚC: Back gỡ lớp văn bản, không đóng tấm.
  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      onClose();
      return true;
    });
    return () => sub.remove();
  }, [onClose]);

  return (
    <Animated.View
      entering={SlideInRight.duration(220)}
      exiting={SlideOutRight.duration(180)}
      style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]}
    >
      <LegalDocScreen doc={doc} onBack={onClose} />
    </Animated.View>
  );
}
