import { renderHook } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { ZONE } from '@/zones';

import { useZoneQueryClient } from './query-client';

/**
 * MỘT cache dữ liệu cho MỖI khu (ADR 0053). Bug mà bộ này khoá: ở chế độ `path` (máy dev) bấm "Trở
 * thành chủ xe" chuyển trang phía client sang `/manage/register`, và trang đó đọc `/auth/me` của
 * tài khoản KHÁCH trong cache dùng chung — tưởng là tài khoản đối tác chưa có gian hàng, bỏ qua form
 * đăng ký tài khoản đối tác.
 */
const nav = vi.hoisted(() => ({ pathname: '/' }));
vi.mock('next/navigation', () => ({ usePathname: () => nav.pathname }));

afterEach(() => {
  vi.unstubAllEnvs();
  nav.pathname = '/';
});

describe('useZoneQueryClient — chế độ path', () => {
  it('site khách và site partner dùng HAI cache khác nhau', () => {
    const { result, rerender } = renderHook(() => useZoneQueryClient(ZONE.MARKET));
    const market = result.current;
    market.setQueryData(['auth', 'me'], { id: 'customer-account' });

    nav.pathname = '/manage/register';
    rerender();

    expect(result.current).not.toBe(market);
    expect(result.current.getQueryData(['auth', 'me'])).toBeUndefined();
  });

  it('quay lại một khu thì cache của khu đó vẫn còn', () => {
    const { result, rerender } = renderHook(() => useZoneQueryClient(ZONE.MARKET));
    const market = result.current;

    nav.pathname = '/admin/tenants';
    rerender();
    const admin = result.current;
    nav.pathname = '/trips';
    rerender();

    expect(result.current).toBe(market);
    expect(admin).not.toBe(market);
  });

  it('trong cùng một khu, chuyển trang không đổi cache', () => {
    nav.pathname = '/manage/vehicles';
    const { result, rerender } = renderHook(() => useZoneQueryClient(ZONE.MARKET));
    const partner = result.current;

    nav.pathname = '/manage/bookings';
    rerender();

    expect(result.current).toBe(partner);
  });
});

describe('useZoneQueryClient — chế độ host', () => {
  it('khu cố định theo host của request, không suy từ đường dẫn', () => {
    vi.stubEnv('NEXT_PUBLIC_XP_ZONE_MODE', 'host');
    nav.pathname = '/vehicles';
    const { result, rerender } = renderHook(() => useZoneQueryClient(ZONE.PARTNER));
    const partner = result.current;

    nav.pathname = '/admin';
    rerender();

    expect(result.current).toBe(partner);
  });
});
