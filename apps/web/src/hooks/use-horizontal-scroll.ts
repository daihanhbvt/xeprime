'use client';

import { useEffect, useState, type RefCallback } from 'react';

/** Dưới ngưỡng này một cú nhấn chuột vẫn là CÚ BẤM, không phải kéo. */
const DRAG_THRESHOLD_PX = 6;
/** Khoảng chừa ở mép khi đưa mục đang chọn vào khung — đủ để thấy còn mục kế bên. */
const REVEAL_MARGIN_PX = 32;

/**
 * Dải cuộn ngang (tab trạng thái, chip, menu mục) dùng được bằng CHUỘT, không chỉ bằng tay.
 *
 * Các dải này ẩn thanh cuộn cho gọn như design, nên trên điện thoại thật vuốt là đủ, nhưng ở cửa
 * sổ hẹp hay khung giả lập điện thoại trên PC thì con lăn chỉ cuộn DỌC và không có gì để kéo: các
 * mục bên phải coi như mất. Hook gắn vào phần tử cuộn:
 * - con lăn dọc thành cuộn ngang khi dải còn đường đi; hết đường thì nhường cho trang cuộn dọc;
 * - kéo bằng chuột để trượt dải (cú kéo không biến thành cú bấm vào mục dưới con trỏ);
 * - mục khớp `activeSelector` tự trượt vào khung mỗi khi `activeKey` đổi;
 * - gắn `data-hscroll-start` / `data-hscroll-end` khi còn nội dung khuất ở mép đó — `globals.css`
 *   làm mờ mép tương ứng để người dùng biết còn mục phía sau.
 *
 * Dải không tràn (ví dụ cột dọc trên desktop) thì hook không làm gì.
 */
export function useHorizontalScroll<T extends HTMLElement>({
  activeSelector,
  activeKey,
}: {
  activeSelector?: string;
  activeKey?: unknown;
} = {}): RefCallback<T> {
  const [node, setNode] = useState<T | null>(null);

  useEffect(() => {
    if (!node) return undefined;
    node.setAttribute('data-hscroll', '');
    const maxLeft = () => node.scrollWidth - node.clientWidth;
    const overflowing = () => maxLeft() > 1;

    const syncEdges = () => {
      const overflow = overflowing();
      node.toggleAttribute('data-hscroll-start', overflow && node.scrollLeft > 1);
      node.toggleAttribute('data-hscroll-end', overflow && node.scrollLeft < maxLeft() - 1);
    };

    const onWheel = (event: WheelEvent) => {
      if (event.ctrlKey || !overflowing()) return;
      // Bàn di chuột vuốt ngang: trình duyệt đã tự cuộn đúng trục.
      if (Math.abs(event.deltaX) >= Math.abs(event.deltaY)) return;
      const unit =
        event.deltaMode === WheelEvent.DOM_DELTA_LINE
          ? 16
          : event.deltaMode === WheelEvent.DOM_DELTA_PAGE
            ? node.clientWidth
            : 1;
      const next = Math.min(maxLeft(), Math.max(0, node.scrollLeft + event.deltaY * unit));
      if (Math.abs(next - node.scrollLeft) < 1) return;
      event.preventDefault();
      node.scrollLeft = next;
    };

    let drag: { pointerId: number; startX: number; startLeft: number; moved: boolean } | null =
      null;
    let swallowClick = false;

    const onPointerDown = (event: PointerEvent) => {
      if (event.pointerType !== 'mouse' || event.button !== 0 || !overflowing()) return;
      drag = {
        pointerId: event.pointerId,
        startX: event.clientX,
        startLeft: node.scrollLeft,
        moved: false,
      };
    };
    const onPointerMove = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const dx = event.clientX - drag.startX;
      if (!drag.moved) {
        if (Math.abs(dx) < DRAG_THRESHOLD_PX) return;
        drag.moved = true;
        node.setPointerCapture(event.pointerId);
        node.setAttribute('data-hscroll-dragging', '');
      }
      node.scrollLeft = drag.startLeft - dx;
    };
    const onPointerEnd = (event: PointerEvent) => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      if (drag.moved) {
        swallowClick = true;
        // Không có cú bấm nào theo sau (thả ngoài dải) thì đừng nuốt cú bấm THẬT kế tiếp.
        window.setTimeout(() => {
          swallowClick = false;
        }, 0);
      }
      drag = null;
      node.removeAttribute('data-hscroll-dragging');
    };
    const onClickCapture = (event: MouseEvent) => {
      if (!swallowClick) return;
      swallowClick = false;
      event.preventDefault();
      event.stopPropagation();
    };

    syncEdges();
    const resize = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(syncEdges);
    resize?.observe(node);
    node.addEventListener('scroll', syncEdges, { passive: true });
    node.addEventListener('wheel', onWheel, { passive: false });
    node.addEventListener('pointerdown', onPointerDown);
    node.addEventListener('pointermove', onPointerMove);
    node.addEventListener('pointerup', onPointerEnd);
    node.addEventListener('pointercancel', onPointerEnd);
    node.addEventListener('click', onClickCapture, true);
    return () => {
      resize?.disconnect();
      node.removeEventListener('scroll', syncEdges);
      node.removeEventListener('wheel', onWheel);
      node.removeEventListener('pointerdown', onPointerDown);
      node.removeEventListener('pointermove', onPointerMove);
      node.removeEventListener('pointerup', onPointerEnd);
      node.removeEventListener('pointercancel', onPointerEnd);
      node.removeEventListener('click', onClickCapture, true);
    };
  }, [node]);

  useEffect(() => {
    if (!node || !activeSelector) return;
    const item = node.querySelector<HTMLElement>(activeSelector);
    if (item) revealHorizontally(node, item);
  }, [node, activeSelector, activeKey]);

  return setNode;
}

/**
 * Trượt `scroller` theo chiều NGANG cho tới khi `item` nằm trọn trong khung. Không dùng
 * `scrollIntoView`: nó kéo cả trang theo chiều dọc.
 */
function revealHorizontally(scroller: HTMLElement, item: HTMLElement) {
  if (scroller.scrollWidth - scroller.clientWidth <= 1) return;
  const box = scroller.getBoundingClientRect();
  const rect = item.getBoundingClientRect();
  let delta = 0;
  if (rect.left < box.left + REVEAL_MARGIN_PX) delta = rect.left - box.left - REVEAL_MARGIN_PX;
  else if (rect.right > box.right - REVEAL_MARGIN_PX)
    delta = rect.right - box.right + REVEAL_MARGIN_PX;
  if (Math.abs(delta) < 1) return;
  const smooth = !window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  scroller.scrollBy({ left: delta, behavior: smooth ? 'smooth' : 'auto' });
}
