import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { Button } from '@/components/ui/Button';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Mảnh dùng chung của ba tấm quyết định (Duyệt · Từ chối · Huỷ) — bản native của web
 * `DecisionReasonDialog.module.css` (05/11/2026): một câu dẫn có chữ đậm nói thẻ sẽ sang nhóm nào,
 * và chân tấm hai nút "Quay lại" + nút chính đặt cạnh nhau.
 */

function StrongText({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fow={fontWeight.semibold}>
      {children}
    </Text>
  );
}

/** Thẻ `<b>` của message → chữ đậm native. Truyền thẳng vào `t.rich(key, { b: richBold })`. */
export const richBold = (chunks: ReactNode) => <StrongText>{chunks}</StrongText>;

/** Câu dẫn ngay dưới tiêu đề tấm — `BottomSheet.subtitle` chỉ nhận chuỗi trơn, nên dựng ở thân. */
export function DecisionLead({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}

/** Ô cảnh báo nền vàng (web `.warning`) — chữ chính, không giấu sau tooltip. */
export function DecisionWarning({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <YStack gap={space.xs} p={space.md} br={radius.md} bg={colors.warningSurface}>
      {children}
    </YStack>
  );
}

/**
 * Chân tấm theo khuôn tấm của app KHÁCH (`CancelTripSheet`): "Quay lại" dạng chữ co vừa nội dung
 * bên trái, nút chính lấy phần còn lại - người dùng chốt 10/11/2026 lấy phong cách app khách.
 */
export function DecisionFooter({
  backLabel,
  onBack,
  leading,
  confirm,
}: {
  backLabel?: string;
  onBack?: () => void;
  /**
   * Nút bên TRÁI tự dựng thay cho "Quay lại" dạng chữ - Figma v2 của tấm duyệt ("Từ chối" viền đỏ)
   * và tấm từ chối ("Quay lại" viền xám). `null` = chỉ còn nút chính chiếm trọn hàng.
   */
  leading?: ReactNode;
  confirm: ReactNode;
}) {
  const left =
    leading !== undefined ? (
      leading
    ) : backLabel && onBack ? (
      <Button label={backLabel} variant="ghost" onPress={onBack} />
    ) : null;
  return (
    <XStack gap={leading !== undefined ? FOOTER_GAP : space.sm}>
      {left ? <YStack flexShrink={0}>{left}</YStack> : null}
      <YStack f={1}>{confirm}</YStack>
    </XStack>
  );
}

/** Figma "Hành động" của chân tấm v2: hai nút cách 12. */
const FOOTER_GAP = 12;
