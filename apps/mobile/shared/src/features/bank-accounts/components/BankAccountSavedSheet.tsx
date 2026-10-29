import { Ionicons } from '@expo/vector-icons';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** `.icon` web: vòng 48px, viền 6px. */
const ICON_RING = 48;
const ICON_RING_BORDER = 6;

/**
 * Hộp "Thành công" sau khi thêm/đổi tài khoản nhận tiền — bản native của `BankAccountSavedDialog`
 * web (Figma `19973:52952`). Trên điện thoại `ResponsiveDialog` của web cũng là tấm trượt đáy, nên
 * đây là `BottomSheet` không tiêu đề.
 *
 * Chỉ dùng ở tài khoản KHÁCH (dáng `account`). Câu thân là CHÍNH câu toast của gian hàng
 * ("Đã thêm…" / "Đã đổi…") để hai bên không kể hai điều khác nhau về cùng một việc.
 */
export function BankAccountSavedSheet({
  open,
  message,
  onClose,
}: {
  open: boolean;
  message: string;
  onClose: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('BankAccounts.form.saved');
  const tCommon = useTranslations('Common.actions');

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      footer={
        // `CtaButton block` (gradient vàng hết hàng) — nút chính bề mặt khách.
        <Button variant="gradient" label={tCommon('confirm')} onPress={onClose} />
      }
    >
      {/* `.body`: căn giữa, gap `space-xs`, đệm trên `space-sm`. */}
      <YStack ai="center" gap={space.xs} pt={space.sm}>
        {/*
          `.icon`: vòng 48px, viền 6px `success-subtle`, nền `success-bg`, tích `color-success`
          cỡ h3; cách tiêu đề thêm `space-sm`.
        */}
        <YStack
          w={ICON_RING}
          h={ICON_RING}
          mb={space.sm}
          br={radius.pill}
          bw={ICON_RING_BORDER}
          bc={colors.successSubtle}
          bg={colors.successSurface}
          ai="center"
          jc="center"
        >
          <Ionicons name="checkmark-circle-outline" size={fontSize.h3} color={colors.success} />
        </YStack>
        {/* `.title` h3 semibold `color-text`. */}
        <Text
          col={colors.text}
          fos={fontSize.h3}
          fow={fontWeight.semibold}
          ta="center"
          accessibilityRole="header"
        >
          {t('title')}
        </Text>
        {/* `.message` body `text-secondary`. */}
        <Text col={colors.textMuted} fos={fontSize.body} ta="center">
          {message}
        </Text>
      </YStack>
    </BottomSheet>
  );
}
