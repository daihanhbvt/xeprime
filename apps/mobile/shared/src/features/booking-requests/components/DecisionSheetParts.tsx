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

/** Chân tấm: "Quay lại" (viền) + nút chính, chia đôi bề ngang như web. */
export function DecisionFooter({
  backLabel,
  onBack,
  confirm,
}: {
  backLabel: string;
  onBack: () => void;
  confirm: ReactNode;
}) {
  return (
    <XStack gap={space.sm}>
      <YStack flex={1}>
        <Button label={backLabel} variant="neutral" onPress={onBack} />
      </YStack>
      <YStack flex={1}>{confirm}</YStack>
    </XStack>
  );
}
