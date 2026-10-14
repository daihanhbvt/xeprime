'use client';

import { useSyncExternalStore } from 'react';
import {
  isGoogleMapsAuthFailed,
  isInteractiveMapUsable,
  subscribeGoogleMapsHealth,
} from '@/lib/google-maps-loader';
import { isMapConfigured } from '@/lib/map-embed';

/**
 * Người dùng CÓ đặt được ghim trên bản đồ không — đổi theo lúc chạy, không chỉ theo env.
 *
 * Có key mà Google từ chối (billing hết hạn, referrer sai) hay script không tải được thì trả
 * `false`, và form đặt xe thôi đòi toạ độ thay vì khoá khách ở bước địa chỉ (ADR 0035 điều 6).
 * Phía server chỉ biết env, nên snapshot của server là "có key hay không".
 */
export function useInteractiveMapUsable(): boolean {
  return useSyncExternalStore(subscribeGoogleMapsHealth, isInteractiveMapUsable, isMapConfigured);
}

/** Google đã từ chối key trong lần tải trang này — ô ghim nói một câu thay vì dựng khung xám. */
export function useGoogleMapsAuthFailed(): boolean {
  return useSyncExternalStore(subscribeGoogleMapsHealth, isGoogleMapsAuthFailed, () => false);
}
