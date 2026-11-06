import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';

/** Gạch vàng dưới tiêu đề — 68 × 2 của bản vẽ v2. */
const DIVIDER_WIDTH = 68;

interface HomeSectionHeadingProps {
  /** Dòng nhỏ viết hoa phía trên ("TẠI SAO LẠI CHỌN XEPRIME"). */
  kicker: string;
  /** Chuỗi, hoặc node có định dạng (`t.rich` — cụm chữ vàng của "Lý do nên chọn XePrime"). */
  title?: ReactNode;
  /** Mặc định `true` — bản vẽ mobile v2 canh giữa và kẻ gạch vàng dưới MỌI tiêu đề khối. */
  divider?: boolean;
}

/**
 * Tiêu đề khối trang chủ v2 — bản native của `SectionHeading` bên web (kicker · tiêu đề · gạch).
 *
 * Canh GIỮA ở mọi khối như bản vẽ mobile (Figma `19771:51664`); web canh trái ở vài khối vì bên đó
 * nút "Xem tất cả" đứng cùng hàng — ở mobile web lẫn app nút đó xuống dưới nội dung.
 */
export function HomeSectionHeading({ kicker, title, divider = true }: HomeSectionHeadingProps) {
  const colors = useColors();
  return (
    // Figma MB `19879:67458`: kicker 12/18 semibold `primary-hover`, tiêu đề 20/30 semibold, cách 4.
    <YStack ai="center" gap={space.xs} accessibilityRole="header">
      <Text col={colors.primaryHover} fos={fontSize.label} lh={18} fow={fontWeight.semibold} ta="center">
        {kicker.toLocaleUpperCase()}
      </Text>
      {title == null ? null : (
        <Text col={colors.text} fos={fontSize.lead} lh={30} fow={fontWeight.semibold} ta="center">
          {title}
        </Text>
      )}
      {divider ? <YStack w={DIVIDER_WIDTH} h={2} bg={colors.primary} /> : null}
    </YStack>
  );
}
