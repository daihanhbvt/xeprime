import { createContext, createElement, useCallback, useContext, useMemo } from 'react';
import { View, type ListRenderItem } from 'react-native';
import {
  CONTENT_MAX_WIDTH,
  contentGutter,
  layout,
  SHEET_MAX_WIDTH,
  TABLET_MIN_WIDTH,
  WIDE_CARD_MIN_WIDTH,
  WIDE_CONTENT_MAX_WIDTH,
} from './layout';
import { useContentWidth } from './use-content-width';

/**
 * Bề rộng của CỘT nội dung đang bao quanh component (dp), hoặc `null` khi component không nằm
 * trong cột nào (trải theo cửa sổ).
 *
 * `Screen` và `ManageListShell` dựng cột giữa màn trên màn rộng và cấp giá trị này xuống. Nhờ đó
 * mọi `px={layout.screenX}` bên trong cột vẫn đúng - cột đã nằm giữa, lề không phải nở thêm - và
 * thứ đo theo bề rộng (băng chuyền, ảnh tràn viền, số cột lưới) đo theo CỘT chứ không theo cửa sổ.
 */
export const ContentColumnContext = createContext<number | null>(null);

/** Số cột cho lưới thẻ theo bề rộng khả dụng: 1 trên điện thoại, 2 trên màn rộng, 3 khi rất rộng. */
export function cardColumnsFor(width: number): number {
  if (width >= WIDE_CARD_MIN_WIDTH) return 3;
  return width >= TABLET_MIN_WIDTH ? 2 : 1;
}

/**
 * Bố cục theo bề rộng cửa sổ HIỆN TẠI (xoay máy, chia đôi màn iPad đều cập nhật).
 *
 * Đọc qua `useWindowDimensions`, không qua `Dimensions.get` lúc nạp module: bề rộng iPad đổi
 * theo Split View / Slide Over trong lúc app đang chạy. Điện thoại (< `TABLET_MIN_WIDTH`) nhận
 * đúng các giá trị cũ: `gutter = layout.screenX`, `cardColumns = 1`, `contentWidth = width`.
 */
export function useResponsive() {
  /*
   * Đo theo CỘT gốc (`ContentColumn` của develop, gộp 16/11/2026) chứ không theo cửa sổ: cột đã
   * căn giữa và chặn trần, đo cửa sổ thì nội dung bị căn giữa hai lần trên iPad.
   */
  const width = useContentWidth();
  const column = useContext(ContentColumnContext);
  const isTablet = width >= TABLET_MIN_WIDTH;
  /** Bề rộng thật của vùng nội dung: cột (nếu đang trong cột) hoặc cả cửa sổ. */
  const contentWidth = column ?? width;
  return {
    width,
    isTablet,
    contentWidth,
    /**
     * Lề ngang cho nội dung tự dựng lề. Trong cột thì cột đã nằm giữa nên lề giữ `layout.screenX`;
     * ngoài cột thì lề nở ra để nội dung thành một cột giữa màn.
     */
    gutter: column != null ? layout.screenX : contentGutter(width),
    /** Lề cho màn duyệt lưới không bọc `<Screen>` (cột RỘNG 1200). */
    wideGutter: column != null ? layout.screenX : contentGutter(width, WIDE_CONTENT_MAX_WIDTH),
    /** Bề rộng tấm trượt / hộp thoại: cả màn trên điện thoại, có trần trên màn rộng. */
    sheetWidth: isTablet ? Math.min(width, SHEET_MAX_WIDTH) : width,
    /** Số cột cho danh sách thẻ, theo bề rộng nội dung (trừ lề). */
    cardColumns: cardColumnsFor(contentWidth),
  } as const;
}

/**
 * Bề rộng cột mà `<Screen>` sẽ dựng - cho component tự đo TRƯỚC khi vào trong `<Screen>` (nên
 * chưa đọc được `ContentColumnContext`).
 */
export function screenColumnWidth(width: number, maxWidth: number = CONTENT_MAX_WIDTH): number {
  return width >= TABLET_MIN_WIDTH ? Math.min(width, maxWidth) : width;
}

/** Style của cột giữa màn trên màn rộng; `null` trên điện thoại (giữ nguyên bố cục cũ). */
export function columnStyle(width: number, maxWidth: number = CONTENT_MAX_WIDTH) {
  if (width < TABLET_MIN_WIDTH) return null;
  return { width: '100%', maxWidth, alignSelf: 'center' } as const;
}

/**
 * Lưới thẻ cho `FlatList` trên màn rộng: 1 cột trên điện thoại (không đổi gì), 2-3 cột trên iPad.
 *
 * Trả `key` (gắn tường minh) + `listProps` (trải vào `FlatList`):
 * - `key` ĐỔI theo số cột - React Native cấm đổi `numColumns` trên một `FlatList` đang sống, nên
 *   xoay máy / Split View phải dựng lại danh sách.
 * - `numColumns`, `columnWrapperStyle` (khoảng cách ngang = `gap`) chỉ có khi > 1 cột.
 * - `renderItem` đã bọc mỗi thẻ trong một ô rộng cố định, để hàng cuối lẻ không bị giãn hết hàng.
 *
 * `gap` phải khớp khoảng cách dọc của danh sách (`layout.inline` ở `ManageListShell`).
 */
export function useCardGrid<T>(
  renderItem: ListRenderItem<T>,
  opts: { gap?: number; listKey?: string; gutter?: number } = {},
) {
  const responsive = useResponsive();
  const contentWidth = responsive.contentWidth;
  /** Lề ngang thật của danh sách - màn tự dựng lề rộng (cột 1200) truyền vào. */
  const gutter = opts.gutter ?? responsive.gutter;
  const gap = opts.gap ?? layout.inline;
  const inner = contentWidth - 2 * gutter;
  const columns = cardColumnsFor(inner + 2 * layout.screenX);
  const cellWidth = columns > 1 ? Math.floor((inner - gap * (columns - 1)) / columns) : 0;

  const wrapped = useCallback<ListRenderItem<T>>(
    (info) =>
      columns > 1
        ? createElement(View, { style: { width: cellWidth } }, renderItem(info))
        : renderItem(info),
    [columns, cellWidth, renderItem],
  );

  return useMemo(
    () => ({
      /** Truyền TƯỜNG MINH `key={grid.key}` - React 19 cảnh báo khi `key` nằm trong object trải. */
      key: `${opts.listKey ?? 'grid'}-${columns}`,
      columns,
      listProps: {
        numColumns: columns,
        renderItem: wrapped,
        ...(columns > 1 ? { columnWrapperStyle: { gap } } : {}),
      },
    }),
    [opts.listKey, columns, wrapped, gap],
  );
}
