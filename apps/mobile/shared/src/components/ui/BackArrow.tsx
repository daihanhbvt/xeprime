import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { useTranslations } from 'use-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { sizing } from '@/theme/tokens';

/** Khung icon "Left 1" của Figma. */
const ARROW_SIZE = 24;
/** Bù vùng chạm lên đủ `touchTarget` mà icon vẫn sát lề như bản vẽ. */
const HIT_SLOP = Math.ceil((sizing.touchTarget - ARROW_SIZE) / 2);

/**
 * Mũi tên lui đứng RIÊNG một hàng ở đầu nội dung - khối "Back navigation" của Figma Partner-XePrime
 * (`24464:25569` "Signup - Plan", `24464:25299` "Signup - Personal"): icon "Left 1" khung 24, màu
 * `text/gray/high`, sát lề trái của cột (không nền, không vòng tròn như `IconButton`). Tiêu đề màn
 * nằm trong nội dung ngay dưới, không ở thanh trên.
 */
export const BackArrow = memo(function BackArrow({ onPress }: { onPress: () => void }) {
  const colors = useColors();
  const t = useTranslations('Common.actions');
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={t('back')}
      hitSlop={HIT_SLOP}
      style={({ pressed }) => [styles.box, pressed ? styles.pressed : null]}
    >
      <LineIcon name="arrow-left" size={ARROW_SIZE} color={colors.text} />
    </Pressable>
  );
});

const styles = StyleSheet.create({
  box: { alignSelf: 'flex-start' },
  pressed: { opacity: 0.6 },
});
