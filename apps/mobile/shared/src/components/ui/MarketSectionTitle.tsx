import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space } from '@/theme/tokens';

/** Vạch vàng dẫn đầu tiêu đề — 3 × 16 (cao bằng cỡ chữ, nằm giữa dòng 24), bo tròn. */
const BAR = { width: 3, height: 16 };
/** Cỡ + dòng của chữ tiêu đề — dòng khai TƯỜNG MINH để vạch đứng đúng giữa chữ (không theo ascent font). */
const TITLE = { size: 16, line: 24 };

/**
 * Tiêu đề khối của các bề mặt KHÁCH (trang chi tiết xe, luồng gửi yêu cầu, thanh toán giữ chỗ) —
 * `.sectionTitle` của web ở ≤640px (Figma `19771:71482`, `21850:71030`): vạch vàng 3×18 + chữ
 * 16/24 Semibold, khe 8 (hạ từ 18 — người dùng chốt 28/10/2026).
 *
 * Khác `BlockTitle` (khu quản lý: chữ hoa nhỏ mờ + đường kẻ) — hai ngôn ngữ của hai khu, đừng gộp.
 *
 * `action` là ô bên phải cùng hàng ("Mở bản đồ", điểm đánh giá…) — web `.sectionHeaderRow`.
 */
export function MarketSectionTitle({
  children,
  action,
}: {
  children: string;
  action?: ReactNode;
}) {
  const colors = useColors();
  return (
    <XStack ai="center" gap={space.sm}>
      <YStack w={BAR.width} h={BAR.height} br={radius.pill} bg={colors.primary} />
      <Text
        f={1}
        col={colors.text}
        fos={TITLE.size}
        lh={TITLE.line}
        fow={fontWeight.semibold}
        accessibilityRole="header"
      >
        {children}
      </Text>
      {action}
    </XStack>
  );
}
