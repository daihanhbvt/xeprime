import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { elevation } from '@/theme/elevation';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Khung một khối nội dung - bản native của web `SectionCard` (`components/layout/SectionCard`):
 * viền `color-border`, bo `border-radius`, nền thẻ, bóng `shadow-card`, đệm `space-lg` (khổ ≤640
 * là `space-md`), các phần cách `space-md`. Đầu khối: tiêu đề h4 đậm dòng 1.4 (+ gợi ý 12 màu phụ)
 * bên trái, `extra` bên phải, tự xuống dòng khi hẹp.
 */
export function SectionCard({
  title,
  hint,
  extra,
  tone = 'default',
  fill = false,
  children,
}: {
  title: string;
  hint?: string;
  extra?: ReactNode;
  /** Khối có thao tác khó lùi lại - viền và tiêu đề đỏ. */
  tone?: 'default' | 'danger';
  /** Giãn hết ô cha - hai khối cạnh nhau cao bằng nhau (web `.fillCard`). */
  fill?: boolean;
  children?: ReactNode;
}) {
  const colors = useColors();
  const dark = useAppScheme().scheme === 'dark';
  return (
    <YStack
      {...(fill ? { f: 1 } : {})}
      minWidth={0}
      p={space.md}
      gap={space.md}
      bw={1}
      bc={tone === 'danger' ? colors.dangerBorder : colors.border}
      // Bo 16 như mọi thẻ Figma ("Nhóm thông tin"), feedback thiết kế 20/11/2026.
      br={radius.card}
      bg={colors.surface}
      style={dark ? undefined : elevation.card}
    >
      <XStack flexWrap="wrap" ai="flex-start" jc="space-between" gap={space.sm} minWidth={0}>
        <YStack f={1} minWidth={0}>
          <Text
            col={tone === 'danger' ? colors.danger : colors.text}
            fos={fontSize.h4}
            fow={fontWeight.bold}
            lh={Math.round(fontSize.h4 * TITLE_LINE_HEIGHT)}
          >
            {title}
          </Text>
          {hint ? (
            <Text mt={space.xs} col={colors.textMuted} fos={fontSize.bodySm}>
              {hint}
            </Text>
          ) : null}
        </YStack>
        {extra ? (
          <XStack flexShrink={0} flexWrap="wrap" gap={space.sm} ai="center">
            {extra}
          </XStack>
        ) : null}
      </XStack>
      {children}
    </YStack>
  );
}

/** Web `.title { line-height: 1.4 }`. */
const TITLE_LINE_HEIGHT = 1.4;
