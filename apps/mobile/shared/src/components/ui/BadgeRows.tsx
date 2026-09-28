import { Fragment, useCallback, useState, type ReactNode } from 'react';
import type { LayoutChangeEvent } from 'react-native';
import { XStack, YStack } from 'tamagui';
import { space } from '@/theme/tokens';
import { estimateStatusBadgeWidth, type BadgeSize } from './StatusBadge';
import { packRows } from './text-fit';

export interface BadgeRowItem {
  /** Khoá React — dùng định danh của chính viên nhãn, đừng lấy chỉ số mảng. */
  readonly key: string;
  /** Chữ hiện trên viên — nguồn của phép đo áng chừng. */
  readonly label: string;
  readonly node: ReactNode;
}

/**
 * Một dải viên nhãn được XẾP HÀNG cho khít, thay vì thả cho `flexWrap` tự ngắt.
 *
 * `flexWrap` ngắt dòng theo đúng thứ tự vào: gặp một viên dài là xuống dòng, kể cả khi hàng đang
 * còn thừa chỗ cho viên kế tiếp. Trên thẻ xe, "Sẵn sàng · Chờ duyệt công khai · Sắp bảo dưỡng"
 * ra hai hàng với một khoảng trống rộng ở cuối hàng đầu — thẻ cao thêm một dòng mà chẳng chở
 * thêm thông tin nào.
 *
 * Ở đây bề rộng khả dụng đo bằng `onLayout` (một lần cho mỗi thẻ), bề rộng từng viên áng chừng
 * theo chữ ({@link estimateStatusBadgeWidth}), rồi `packRows` xếp — GIỮ thứ tự ưu tiên, chỉ kéo
 * viên sau lên khi nó lấp vừa chỗ trống.
 *
 * Mỗi hàng vẫn là một `flexWrap`: phép đo là ước lượng, nên khi nó đoán hụt thì hàng đó tự xuống
 * dòng đúng như hôm nay — hỏng về THẨM MỸ, không hỏng về bố cục. Cùng lý do cho lượt render đầu
 * tiên (chưa đo được): dựng đúng một hàng `flexWrap` như cũ.
 */
export function BadgeRows({
  items,
  size = 'sm',
  gap = space.xs,
}: {
  items: readonly BadgeRowItem[];
  size?: BadgeSize;
  gap?: number;
}) {
  const [width, setWidth] = useState(0);

  const measure = useCallback((event: LayoutChangeEvent) => {
    const next = event.nativeEvent.layout.width;
    /* Làm tròn: `onLayout` trả số thực và một chênh lệch 0,3pt sẽ dựng lại cả cây con vô ích. */
    setWidth((current) => (Math.abs(current - next) < 1 ? current : Math.round(next)));
  }, []);

  if (items.length === 0) return null;

  const rows =
    width > 0
      ? packRows(
          items.map((item) => estimateStatusBadgeWidth(item.label, size)),
          width,
          gap,
        )
      : [items.map((_, index) => index)];

  return (
    <YStack gap={gap} onLayout={measure}>
      {rows.map((row) => (
        <XStack key={row.map((index) => items[index]?.key).join('-')} flexWrap="wrap" gap={gap}>
          {/*
            Khoá đặt ở đây chứ không trông vào phần tử nơi gọi dựng: `node` là một `ReactNode` tuỳ
            ý, và nơi gọi nào quên `key` thì React cảnh báo từ TRONG lòng component này — chỗ mà
            người đọc cảnh báo không có cách nào lần ra ai là thủ phạm.
          */}
          {row.map((index) => {
            const item = items[index];
            return item ? <Fragment key={item.key}>{item.node}</Fragment> : null;
          })}
        </XStack>
      ))}
    </YStack>
  );
}
