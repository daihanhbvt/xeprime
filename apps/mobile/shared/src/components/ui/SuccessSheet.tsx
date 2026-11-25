import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { Ionicons } from '@/components/icons/Ionicons';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { BottomSheet } from './BottomSheet';
import { Button } from './Button';

/** Ô dấu tích 56×56 + glyph 26px của hộp thành công web (`.successIcon` / `.doneIcon`). */
const SUCCESS_ICON = 56;
const SUCCESS_GLYPH = 26;
const SUCCESS_RING = 6;

/**
 * Tấm báo THÀNH CÔNG - bản native của hộp thành công web (`PasswordResetDoneDialog`, hộp đổi mật
 * khẩu khu tài khoản): dấu tích tròn vành xanh, tiêu đề, câu báo, MỘT nút trọn bề ngang.
 *
 * Đóng tấm (vuốt / chạm nền) đi CÙNG lối với nút (`onClose` = `onAction` ở nơi gọi khi chỉ có một
 * lối ra) - không có trạng thái "đóng rồi đứng lại ở màn đã xong".
 */
export function SuccessSheet({
  open,
  title,
  body,
  actionLabel,
  onAction,
  onClose,
}: {
  open: boolean;
  title: string;
  body: ReactNode;
  actionLabel: string;
  onAction: () => void;
  /** Vắng = đóng tấm cũng là `onAction`. */
  onClose?: () => void;
}) {
  const colors = useColors();
  return (
    <BottomSheet
      open={open}
      onClose={onClose ?? onAction}
      footer={<Button label={actionLabel} variant="gradient" onPress={onAction} />}
    >
      <YStack ai="center" gap={space.md} pt={space.xs} accessibilityRole="summary">
        <YStack
          w={SUCCESS_ICON}
          h={SUCCESS_ICON}
          br={radius.pill}
          bw={SUCCESS_RING}
          bc={colors.successSubtle}
          bg={colors.successSurface}
          ai="center"
          jc="center"
        >
          <Ionicons name="checkmark-circle-outline" size={SUCCESS_GLYPH} color={colors.success} />
        </YStack>
        <YStack gap={2} ai="center">
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.semibold} ta="center">
            {title}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.body} ta="center">
            {body}
          </Text>
        </YStack>
      </YStack>
    </BottomSheet>
  );
}
