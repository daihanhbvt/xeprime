'use client';

import type { MouseEvent } from 'react';

/**
 * Chuyển trang bằng View Transitions API: ảnh nguồn (thẻ xe) "bay" thành ảnh đầu trang đích.
 *
 * Cơ chế: lúc bấm, gắn `data-vt-source` lên ảnh nguồn — CSS (`viewTransitionSourceClass` ở chỗ
 * dùng) cho nó `view-transition-name: xp-listing-photo`; trang đích đặt CÙNG tên cố định lên ảnh
 * đầu. Gắn lúc bấm (không gắn sẵn) vì một trang có thể hiện cùng một xe ở nhiều khối — tên trùng
 * thì trình duyệt huỷ cả hiệu ứng.
 *
 * Không hỗ trợ / giảm chuyển động / mở tab mới (Ctrl, Cmd, Shift, chuột giữa) ⇒ trả `false`, để
 * `<Link>` điều hướng bình thường. Không bao giờ chặn điều hướng: chờ trang đích vẽ ảnh tối đa
 * `WAIT_MS`, quá thì cho hiệu ứng kết thúc bằng cross-fade mặc định.
 */
export const LISTING_PHOTO_TRANSITION_TARGET = '[data-vt-listing-target]';
const WAIT_MS = 900;

type StartViewTransition = (callback: () => Promise<void>) => unknown;

export function navigateWithViewTransition(
  event: MouseEvent<HTMLElement>,
  source: HTMLElement | null,
  navigate: () => void,
): boolean {
  if (typeof document === 'undefined' || !source) return false;
  const start = (document as Document & { startViewTransition?: StartViewTransition })
    .startViewTransition;
  if (typeof start !== 'function') return false;
  if (event.defaultPrevented || event.button !== 0) return false;
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return false;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return false;

  event.preventDefault();
  source.dataset.vtSource = '';
  start.call(document, () => {
    navigate();
    return new Promise<void>((resolve) => {
      const startedAt = performance.now();
      const poll = () => {
        if (
          (!source.isConnected && document.querySelector(LISTING_PHOTO_TRANSITION_TARGET)) ||
          performance.now() - startedAt > WAIT_MS
        ) {
          delete source.dataset.vtSource;
          resolve();
          return;
        }
        window.requestAnimationFrame(poll);
      };
      window.requestAnimationFrame(poll);
    });
  });
  return true;
}
