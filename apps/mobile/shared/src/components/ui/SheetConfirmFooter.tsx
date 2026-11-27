import type { ReactNode } from 'react';
import { XStack, YStack } from 'tamagui';
import { Button, type ButtonVariant } from './Button';

/**
 * Chân tấm XÁC NHẬN chuẩn của app - khuôn của tấm "Từ chối yêu cầu" (Figma `24145:97092`, người
 * dùng chốt 20/11/2026 cho MỌI tấm có cặp hành động này: huỷ đơn, khách không đến, huỷ yêu cầu,
 * huỷ chuyến…):
 *
 *   [ Quay lại ]  [ ======== Hành động chính ======== ]
 *
 * Nút trái viền xám co vừa chữ, KHÔNG icon; nút phải trải phần còn lại (nhãn quá dài thì xếp dọc) - đỏ đặc cho việc nguy
 * hiểm (`danger`), gradient cho việc thường (`primary`). Hai nút cách 12. Đang gửi thì khoá nút trái.
 */
export function SheetConfirmFooter({
  backLabel,
  onBack,
  confirmLabel,
  onConfirm,
  tone = 'danger',
  loading = false,
  disabled = false,
  below,
}: {
  backLabel: string;
  onBack: () => void;
  confirmLabel: string;
  onConfirm: () => void;
  tone?: 'danger' | 'primary';
  loading?: boolean;
  disabled?: boolean;
  /** Dòng phụ dưới nút chính (vd gợi ý mất mạng). */
  below?: ReactNode;
}) {
  const variant: ButtonVariant = tone === 'danger' ? 'dangerSolid' : 'gradient';
  // Nhãn dài thì hai nút cùng một hàng bóp chữ: xếp dọc, nút chính ở trên (người dùng 26/11/2026).
  if (backLabel.length + confirmLabel.length > STACK_LABEL_LENGTH) {
    return (
      <YStack gap={GAP}>
        <Button
          label={confirmLabel}
          variant={variant}
          loading={loading}
          disabled={disabled}
          onPress={onConfirm}
        />
        {below}
        <Button label={backLabel} variant="secondary" disabled={loading} onPress={onBack} />
      </YStack>
    );
  }
  return (
    <XStack gap={GAP}>
      <YStack flexShrink={0}>
        <Button label={backLabel} variant="secondary" block={false} disabled={loading} onPress={onBack} />
      </YStack>
      <YStack f={1}>
        <Button
          label={confirmLabel}
          variant={variant}
          loading={loading}
          disabled={disabled}
          onPress={onConfirm}
        />
        {below}
      </YStack>
    </XStack>
  );
}

const GAP = 12;
/** Tổng độ dài hai nhãn quá ngưỡng này thì xếp dọc thay vì một hàng. */
const STACK_LABEL_LENGTH = 30;
