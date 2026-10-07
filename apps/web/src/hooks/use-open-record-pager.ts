'use client';

import { useState } from 'react';

function sameOrder(a: readonly string[], b: readonly string[]): boolean {
  return a.length === b.length && a.every((id, index) => id === b[index]);
}

export interface OpenRecordPager {
  /** Bản ghi liền trước / liền sau trong trang đang xem — `null` ở hai đầu hoặc khi chưa mở gì. */
  previousId: string | null;
  nextId: string | null;
  /**
   * Gọi NGAY TRƯỚC khi mở một bản ghi (bấm "Xem chi tiết", trước/sau) để ghim thứ tự hiện tại —
   * xem phần "duyệt xong, bản ghi rời trang" bên dưới.
   */
  remember: () => void;
}

/**
 * Trước/sau của bản ghi đang mở trong một panel làm việc, theo thứ tự người dùng ĐANG NHÌN THẤY
 * trên bảng (`WorkDrawerPager`).
 *
 * Quyết định xong một bản ghi ở hàng đợi lọc sẵn (phiếu CHỜ, xe ĐANG HIỂN THỊ…) ⇒ danh sách nạp
 * lại và bản ghi đó rời trang — nếu chỉ đọc trang hiện tại thì "Bản ghi sau" tắt ngay đúng lúc
 * người dùng cần nó nhất. Nên thứ tự lần cuối thấy bản ghi đang mở trên trang được giữ lại, và
 * chỉ dùng thay khi bản ghi đó KHÔNG còn trên trang.
 *
 * Ghi nhớ ngay trong lúc render (mẫu "chỉnh state theo props" của React), không chỉ lúc bấm
 * "Xem chi tiết": vào thẳng bằng link hay F5 với `?open=` cũng phải có thứ tự để giữ.
 *
 * Dùng chung cho màn Duyệt xe và Xe toàn hệ thống — hai hàng đợi có cùng một cách rời trang.
 */
export function useOpenRecordPager(
  liveOrder: readonly string[],
  openId: string | null | undefined,
): OpenRecordPager {
  const [openedOrder, setOpenedOrder] = useState<readonly string[]>([]);
  if (openId && liveOrder.includes(openId) && !sameOrder(openedOrder, liveOrder)) {
    setOpenedOrder(liveOrder);
  }
  const order =
    openId && !liveOrder.includes(openId) && openedOrder.includes(openId)
      ? openedOrder
      : liveOrder;
  const openIndex = openId ? order.indexOf(openId) : -1;
  const previousId = openIndex > 0 ? order[openIndex - 1]! : null;
  const nextId = openIndex >= 0 && openIndex < order.length - 1 ? order[openIndex + 1]! : null;

  return { previousId, nextId, remember: () => setOpenedOrder(order) };
}
