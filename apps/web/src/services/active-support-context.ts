import { isSupportContextId } from '@xeprime/types';

/**
 * Phiên hỗ trợ gian hàng ĐANG MOUNT trong tab này (ADR 0050) — client HTTP đọc để gắn header
 * `x-support-context`.
 *
 * Vì sao không chỉ suy từ `window.location`: khi điều hướng phía client (vào phiên từ drawer, hay
 * thoát phiên), cây component của phiên phát request trong lúc thanh địa chỉ vẫn còn là trang cũ —
 * request đi không header và nhận `NO_TENANT_SCOPE` (smoke test trên trình duyệt thật bắt được,
 * test đơn vị thì không). `SupportSessionBoundary` đăng ký id khi cây phiên COMMIT (layout effect,
 * chạy trước mọi fetch của cây con) và gỡ khi unmount — không đăng ký lúc render, để một lượt
 * render bị bỏ dở không để lại đăng ký mồ côi.
 *
 * CHỈ trên trình duyệt: trạng thái module phía server dùng chung giữa MỌI request SSR, nên một lần
 * đăng ký ở đó sẽ gắn header phiên của người này vào request của người khác.
 */
let active: string | null = null;

export function registerActiveSupportContext(contextId: string): void {
  if (typeof window === 'undefined') return;
  active = isSupportContextId(contextId) ? contextId : null;
}

/** Chỉ gỡ khi còn đúng là id đó — provider của phiên KẾ TIẾP có thể đã đăng ký trước khi cái cũ unmount. */
export function releaseActiveSupportContext(contextId: string): void {
  if (active === contextId) active = null;
}

export function activeSupportContextId(): string | null {
  return typeof window === 'undefined' ? null : active;
}
