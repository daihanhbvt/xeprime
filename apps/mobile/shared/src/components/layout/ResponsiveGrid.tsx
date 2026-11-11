import { Children, type ReactNode } from 'react';
import { XStack, YStack } from 'tamagui';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';
import { useContentWidth } from '@/theme/use-content-width';

/**
 * Lưới N cột chia đều BỀ NGANG NỘI DUNG của màn (cột trừ lề `layout.screenX` hai bên) — bản
 * native của `grid-template-columns: repeat(N, 1fr)` mà website dùng ở bố cục tablet.
 *
 * Bề ngang ô tính bằng số (không `%` + `flexBasis`): thẻ con nhiều khi tự suy chiều cao từ bề
 * ngang (`aspectRatio`, ảnh minh hoạ theo tỉ lệ), và một bề ngang phần trăm lồng trong `flexWrap`
 * là chỗ Yoga đo lệch giữa iOS và Android. `cellWidth` cũng được trả qua render-prop cho thẻ cần
 * biết con số (thẻ địa điểm vẽ ảnh theo bề ngang thẻ).
 */
export function ResponsiveGrid({
  columns,
  gap = space.md,
  children,
}: {
  columns: number;
  gap?: number;
  children: ReactNode | ((cellWidth: number) => ReactNode);
}) {
  const contentWidth = useContentWidth() - layout.screenX * 2;
  const cellWidth = gridCellWidth(contentWidth, columns, gap);
  const items = Children.toArray(typeof children === 'function' ? children(cellWidth) : children);

  return (
    <XStack flexWrap="wrap" gap={gap}>
      {items.map((child, index) => (
        <YStack key={index} w={cellWidth}>
          {child}
        </YStack>
      ))}
    </XStack>
  );
}

/** Bề ngang một ô của lưới `columns` cột trong `contentWidth`, có khe `gap` giữa các ô. */
export function gridCellWidth(contentWidth: number, columns: number, gap: number): number {
  const n = Math.max(1, columns);
  return Math.floor((contentWidth - gap * (n - 1)) / n);
}
