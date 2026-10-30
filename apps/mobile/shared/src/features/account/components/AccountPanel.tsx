import type { ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { Text, YStack } from 'tamagui';
import { Card } from '@/components/ui/Card';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** `--xp-space-12` — khe dọc giữa khối chữ và `extra` khi `extra` xuống dòng (`.head` row-gap). */
const HEAD_ROW_GAP = space.sm + space.xs;
/** `line-height: 22px` của `.subtitle` web (body 14). */
const SUBTITLE_LINE_HEIGHT = 22;

/**
 * Thẻ một mục của khu tài khoản — bản native của `AccountPanel` web (design Account, "Profile
 * Heading", Figma `21636:83664`), lấy đúng thông số ở breakpoint ≤640px của
 * `AccountPanel.module.css`:
 *
 *   - KHUNG (`.panel`): nền `color-bg-container`, viền 1px `color-border`, bo `border-radius-card`
 *     (16). Đệm `space-md` (16) — màn hẹp web hạ `.panel` về `md` kể cả bản `spacious`. Khe giữa
 *     các khối `space-md`, bản `spacious` (`.spacious`) là `space-lg` (24).
 *   - ĐẦU THẺ (`.head`): tiêu đề + mô tả, rồi `extra` xuống dòng trọn bề ngang (`.extra { flex:
 *     1 1 100% }` ở ≤640px), khe dọc 12; gạch 1px `color-border` dưới đầu thẻ, đệm dưới `space-md`.
 *   - TIÊU ĐỀ (`.title`): `font-size-h3` (18) semibold, `color-text`.
 *   - MÔ TẢ (`.subtitle`): `font-size-body` (14) / 22, `color-text-tertiary` (`colors.placeholder`).
 *
 * Một khung cho mọi mục ("Thông tin tài khoản", "Giấy tờ & Xác minh") để các thẻ đứng cạnh nhau
 * đọc ra là CÙNG một trang — không mỗi thẻ một kiểu bo, một cỡ chữ.
 *
 * `onLayout`: đích cuộn tới (`#anchor` của web) — màn cha đo vị trí thẻ để cuộn thẳng tới nó.
 */
export function AccountPanel({
  title,
  subtitle,
  extra,
  spacious = false,
  onLayout,
  children,
}: {
  title: string;
  subtitle?: string;
  extra?: ReactNode;
  spacious?: boolean;
  onLayout?: (event: LayoutChangeEvent) => void;
  children: ReactNode;
}) {
  const colors = useColors();
  return (
    <YStack onLayout={onLayout}>
      <Card padded={false} radius={radius.card}>
        <YStack p={space.md} gap={spacious ? space.lg : space.md}>
          {/* `.head` — khối chữ, rồi `extra` trọn hàng; gạch `color-border` ngăn với nội dung. */}
          <YStack
            gap={HEAD_ROW_GAP}
            pb={space.md}
            borderBottomWidth={1}
            borderBottomColor={colors.border}
          >
            {/* `.text` — tiêu đề và mô tả cách nhau `space-2`. */}
            <YStack gap={2}>
              <Text
                col={colors.text}
                fos={fontSize.h3}
                fow={fontWeight.semibold}
                accessibilityRole="header"
              >
                {title}
              </Text>
              {subtitle ? (
                <Text col={colors.placeholder} fos={fontSize.body} lh={SUBTITLE_LINE_HEIGHT}>
                  {subtitle}
                </Text>
              ) : null}
            </YStack>
            {extra ?? null}
          </YStack>
          {children}
        </YStack>
      </Card>
    </YStack>
  );
}
