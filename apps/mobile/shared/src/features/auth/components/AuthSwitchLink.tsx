import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { FitOneLineText } from '@/components/ui/FitOneLineText';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';

export function AuthSwitchLink({
  prompt,
  actionLabel,
  onPress,
  disabled = false,
  size = 'md',
}: {
  /** `lg` - chữ 16/24 MỘT dòng (Figma `24382:23384` · `24486:79879`, các màn tài khoản app Partner); `md` - chữ thân 14. */
  size?: 'md' | 'lg';
  prompt: string;
  actionLabel: string;
  onPress: () => void;
  disabled?: boolean;
}) {
  const colors = useColors();

  if (size === 'lg') {
    /*
     * Figma `whitespace-nowrap`: "Bạn đã nhớ ra mật khẩu? Quay lại đăng nhập!" là MỘT dòng (người dùng
     * báo rớt hàng 20/11/2026). Một câu duy nhất - phần link là `Text` lồng bấm được - cỡ chữ vừa khít
     * bề ngang (`FitOneLineText`), không bao giờ tách thành hai hàng. Đoạn link khai lại `fow` vì
     * `Text` lồng của Tamagui không giữ độ đậm của cha.
     */
    return (
      <FitOneLineText
        col={colors.textMuted}
        fontSize={typeScale.title.fontSize}
        lineHeight={typeScale.title.lineHeight}
        ta="center"
      >
        {(size) => (
          <>
            {prompt}{' '}
            <Text
              col={disabled ? colors.textDisabled : colors.primary}
              fos={size}
              fow={fontWeight.bold}
              onPress={disabled ? undefined : onPress}
              accessibilityRole="button"
              accessibilityState={{ disabled }}
              suppressHighlighting
            >
              {actionLabel}
            </Text>
          </>
        )}
      </FitOneLineText>
    );
  }

  return (
    <XStack ai="center" jc="center" gap={space.xs} flexWrap="wrap">
      <Text col={colors.textMuted} fos={fontSize.body}>
        {prompt}
      </Text>
      <Pressable
        onPress={onPress}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityState={{ disabled }}
        hitSlop={space.sm}
      >
        <Text
          col={disabled ? colors.textDisabled : colors.primaryActive}
          fos={fontSize.body}
          fow={fontWeight.semibold}
        >
          {actionLabel}
        </Text>
      </Pressable>
    </XStack>
  );
}
