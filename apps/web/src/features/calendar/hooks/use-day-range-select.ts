'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { orderedSpan } from '../utils/calendar-event-model';

/** Một đoạn ngày đang/đã chọn trên MỘT hàng xe (chỉ số cột, hai đầu tính cả). */
export interface DaySpanSelection {
  resourceId: string;
  start: number;
  end: number;
}

/** Bề rộng dải mép vùng cuộn mà con trỏ chạm vào thì lưới tự cuộn ngang khi đang kéo. */
const AUTO_SCROLL_EDGE = 48;
const AUTO_SCROLL_STEP = 24;

/**
 * Kéo chuột trái qua các ô trống của MỘT hàng xe để chọn nhiều ngày (thiết kế lại 25/11/2026) —
 * thả chuột là mở bảng thao tác (Đặt xe · Khoá xe · Đặt giá riêng) cho cả khoảng.
 *
 * Chỉ CHUỘT mới kéo: trên cảm ứng một cú vuốt là cuộn lưới, không được thành một lượt chọn nhầm.
 * Chạm và bàn phím vẫn mở bảng cho đúng một ngày qua `click` như trước — bàn phím đổi khoảng ngay
 * trong hộp thoại.
 *
 * Cột dưới con trỏ tính theo TOẠ ĐỘ X so với dải ô của hàng, không theo `pointerenter` của từng
 * ô: thanh event nằm đè lên ô, kéo ngang qua một chuyến thì ô bên dưới không nhận được sự kiện.
 * Nghe trên `window` để kéo lệch khỏi hàng (lên/xuống) vẫn tiếp tục đúng hàng đã bắt đầu.
 */
export function useDayRangeSelect({
  dayWidth,
  dayCount,
  viewport,
  onCommit,
}: {
  dayWidth: number;
  dayCount: number;
  /** Vùng cuộn của lưới — tự cuộn ngang khi kéo chạm mép. */
  viewport: HTMLElement | null;
  onCommit: (selection: DaySpanSelection) => void;
}) {
  const [dragging, setDragging] = useState<DaySpanSelection | null>(null);
  /** Lượt kéo đang chạy — ref để listener trên `window` đọc giá trị mới nhất mà không gắn lại. */
  const dragRef = useRef<{
    resourceId: string;
    anchor: number;
    current: number;
    track: HTMLElement;
  } | null>(null);
  /** Cú `click` theo sau một lượt thả chuột là của chính lượt đó — không mở bảng lần hai. */
  const suppressClickRef = useRef(false);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  });
  const isDragging = dragging !== null;

  const indexAt = useCallback(
    (track: HTMLElement, clientX: number) => {
      const left = track.getBoundingClientRect().left;
      return Math.min(dayCount - 1, Math.max(0, Math.floor((clientX - left) / dayWidth)));
    },
    [dayCount, dayWidth],
  );

  useEffect(() => {
    if (!isDragging) return;

    function onMove(event: PointerEvent) {
      const drag = dragRef.current;
      if (!drag) return;
      if (viewport) {
        const box = viewport.getBoundingClientRect();
        if (event.clientX > box.right - AUTO_SCROLL_EDGE) viewport.scrollLeft += AUTO_SCROLL_STEP;
        else if (event.clientX < box.left + AUTO_SCROLL_EDGE)
          viewport.scrollLeft -= AUTO_SCROLL_STEP;
      }
      const next = indexAt(drag.track, event.clientX);
      if (next === drag.current) return;
      drag.current = next;
      setDragging({ resourceId: drag.resourceId, ...orderedSpan(drag.anchor, next) });
    }

    function onUp() {
      const drag = dragRef.current;
      dragRef.current = null;
      setDragging(null);
      if (!drag) return;
      suppressClickRef.current = true;
      commitRef.current({ resourceId: drag.resourceId, ...orderedSpan(drag.anchor, drag.current) });
    }

    function onCancel() {
      dragRef.current = null;
      setDragging(null);
    }

    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onCancel();
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onCancel);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onCancel);
      window.removeEventListener('keydown', onKey);
    };
    // Gắn MỘT lần cho mỗi lượt kéo — `dragging` đổi liên tục nhưng chỉ cần biết có/không.
  }, [isDragging, indexAt, viewport]);

  /** Gắn vào `onPointerDown` của một ô trống. */
  const startDrag = useCallback(
    (resourceId: string, dayIndex: number, event: React.PointerEvent<HTMLElement>) => {
      if (event.pointerType !== 'mouse' || event.button !== 0) return;
      const track = event.currentTarget.parentElement;
      if (!track) return;
      // Chặn bôi đen chữ khi kéo; `click` của ô vẫn được trình duyệt phát như thường.
      event.preventDefault();
      dragRef.current = { resourceId, anchor: dayIndex, current: dayIndex, track };
      setDragging({ resourceId, start: dayIndex, end: dayIndex });
    },
    [],
  );

  /**
   * Gọi đầu `onClick` của ô: `true` nghĩa là cú click này chỉ là đuôi của một lượt kéo bằng chuột
   * (đã mở bảng ở `pointerup`) — bỏ qua. Click từ bàn phím/chạm luôn trả `false`.
   */
  const consumeClick = useCallback(() => {
    if (!suppressClickRef.current) return false;
    suppressClickRef.current = false;
    return true;
  }, []);

  return { dragging, startDrag, consumeClick };
}
