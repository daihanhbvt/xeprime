import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { elevation } from '@/theme/elevation';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize, radius } from '@/theme/tokens';

/**
 * Nút tròn "Về đầu trang" nổi góc phải dưới - đi cùng cuộn vô hạn (người dùng 16/11/2026).
 * Chỉ hiện khi đã cuộn quá một màn; mờ vào/ra trên luồng UI.
 */
export const BackToTopButton = memo(function BackToTopButton({
  visible,
  onPress,
  bottom,
}: {
  visible: boolean;
  onPress: () => void;
  /** Khoảng cách tới đáy màn (chừa thanh tab nổi). */
  bottom: number;
}) {
  const colors = useColors();
  const t = useTranslations('Common.actions');
  if (!visible) return null;
  return (
    <Animated.View entering={FadeIn} exiting={FadeOut} style={[styles.wrap, { bottom }]}>
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel={t('backToTop')}
        hitSlop={8}
        style={({ pressed }) => [
          styles.button,
          elevation.raised,
          { backgroundColor: colors.surface, borderColor: colors.border },
          pressed ? styles.pressed : null,
        ]}
      >
        <LineIcon name="caret-up" size={iconSize.lg} color={colors.text} />
      </Pressable>
    </Animated.View>
  );
});

const SIZE = 44;

const styles = StyleSheet.create({
  wrap: { position: 'absolute', right: 16 },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: radius.pill,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: { opacity: 0.7 },
});
