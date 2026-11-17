import type { ReactNode } from 'react';
import { XStack, YStack } from 'tamagui';

/**
 * Lưới HAI cột kiểu CSS `grid-template-columns: repeat(2, minmax(0, 1fr))`:
 *
 *  - mỗi hàng đúng hai ô, hai ô trong một hàng CAO BẰNG NHAU (con dùng `Card fill`);
 *  - số ô lẻ thì ô cuối vẫn rộng NỬA khổ - `flexWrap` + `flexGrow` sẽ kéo nó ra hết khổ, sai web.
 *
 * Dùng cho các lưới hai cột của site partner khổ ≤640 (ô việc cần làm, thẻ KPI Tổng quan).
 */
export function TwoColumnGrid<T>({
  items,
  gap,
  keyOf,
  renderItem,
}: {
  items: readonly T[];
  gap: number;
  keyOf: (item: T) => string;
  renderItem: (item: T) => ReactNode;
}) {
  const rows: T[][] = [];
  for (let i = 0; i < items.length; i += 2) rows.push(items.slice(i, i + 2));
  return (
    <YStack gap={gap}>
      {rows.map((row) => (
        <XStack key={row.map(keyOf).join('|')} gap={gap} ai="stretch">
          {row.map((item) => (
            <YStack key={keyOf(item)} f={1} flexBasis={0} minWidth={0}>
              {renderItem(item)}
            </YStack>
          ))}
          {row.length === 1 ? <YStack f={1} flexBasis={0} /> : null}
        </XStack>
      ))}
    </YStack>
  );
}
