import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight } from '@/theme/tokens';

/**
 * Một ô số liệu căn giữa (nhãn nhỏ trên, giá trị dưới) - khuôn "ba cột tiền" của thẻ chuyến app
 * KHÁCH (`MoneyCell` của `TripCard`, Figma "Account / Profile / Trip"). Chuyển ra đây 10/11/2026 để
 * app Partner (thẻ đơn, chi tiết đơn, hồ sơ khách, quyết toán) dùng CÙNG khuôn với app khách.
 *
 * `highlight` tô giá trị màu chủ đạo (ô "Còn lại" / "Còn phải thu"); `tone` cho ô cần nói đúng/sai.
 */
export function StatTile({
  label,
  highlight = false,
  tone,
  children,
}: {
  label: string;
  highlight?: boolean;
  tone?: 'success' | 'danger';
  children: ReactNode;
}) {
  const colors = useColors();
  const valueColor =
    tone === 'success' ? colors.success : tone === 'danger' ? colors.danger : highlight ? colors.primary : colors.text;
  return (
    <YStack f={1} minWidth={0} ai="center" gap={2}>
      <Text col={colors.placeholder} fos={fontSize.label} numberOfLines={1}>
        {label}
      </Text>
      {typeof children === 'string' ? (
        <Text col={valueColor} fos={fontSize.body} fow={fontWeight.medium} lh={22} numberOfLines={1}>
          {children}
        </Text>
      ) : (
        children
      )}
    </YStack>
  );
}
