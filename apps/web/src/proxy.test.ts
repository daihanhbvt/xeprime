import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { proxy } from './proxy';

/**
 * Proxy quyết định điều hướng TRƯỚC khi render, nên sai ở đây là vòng lặp redirect hoặc lộ
 * route. Ba điều được khoá lại:
 *  - `/manage/login` công khai (không thì chưa đăng nhập bị đá về chính nó → loop);
 *  - route `/manage` giữ đúng đích trong `next`, kể cả route con của `/manage/admin`;
 *  - `/login` `/register` cũ KHÔNG còn dẫn vào `/manage` — đó chính là bug gốc.
 */
const ORIGIN = 'https://xeprime.test';

function request(path: string, opts: { session?: boolean } = {}): NextRequest {
  const req = new NextRequest(new URL(path, ORIGIN));
  if (opts.session) req.cookies.set('xp_session', 'token');
  return req;
}

function locationOf(path: string, opts: { session?: boolean } = {}): string | null {
  const res = proxy(request(path, opts));
  const location = res.headers.get('location');
  return location ? location.replace(ORIGIN, '') : null;
}

describe('proxy — cổng quản lý', () => {
  it('/manage/login luôn đi qua, kể cả khi CÓ cookie (chống loop với phiên hết hạn)', () => {
    expect(locationOf('/manage/login')).toBeNull();
    expect(locationOf('/manage/login', { session: true })).toBeNull();
    expect(locationOf('/manage/login?next=%2Fmanage', { session: true })).toBeNull();
  });

  it('/manage chưa đăng nhập → portal login giữ next', () => {
    expect(locationOf('/manage')).toBe('/manage/login?next=%2Fmanage');
  });

  it('route con của /manage/admin giữ NGUYÊN đích (kể cả query) trong next', () => {
    expect(locationOf('/manage/admin')).toBe('/manage/login?next=%2Fmanage%2Fadmin');
    expect(locationOf('/manage/admin/tenants?status=active')).toBe(
      '/manage/login?next=%2Fmanage%2Fadmin%2Ftenants%3Fstatus%3Dactive',
    );
  });

  it('/manage/onboarding chưa đăng nhập → portal login kèm intent=owner', () => {
    const location = locationOf('/manage/onboarding');
    expect(location).toContain('/manage/login');
    expect(location).toContain('next=%2Fmanage%2Fonboarding');
    expect(location).toContain('intent=owner');
  });

  it('/manage có cookie → đi tiếp (verify thật do /auth/me + guard backend)', () => {
    expect(locationOf('/manage', { session: true })).toBeNull();
    expect(locationOf('/manage/admin/tenants', { session: true })).toBeNull();
  });
});

describe('proxy — route auth cũ', () => {
  it('/login chưa đăng nhập → trang chủ + mở modal, KHÔNG vào /manage', () => {
    const location = locationOf('/login');
    expect(location).toBe('/?auth=login');
    expect(location).not.toContain('/manage');
  });

  it('/register chưa đăng nhập → trang chủ + modal đăng ký', () => {
    expect(locationOf('/register')).toBe('/?auth=register');
  });

  it('giữ next nội bộ, loại next ra ngoài domain', () => {
    expect(locationOf('/login?next=%2Ftrips')).toBe('/?auth=login&next=%2Ftrips');
    expect(locationOf('/login?next=https%3A%2F%2Fevil.example')).toBe('/?auth=login');
    expect(locationOf('/login?next=%2F%2Fevil.example')).toBe('/?auth=login');
  });

  it('đã đăng nhập mở /login → về next an toàn hoặc trang chủ, KHÔNG mặc định /manage', () => {
    expect(locationOf('/login', { session: true })).toBe('/');
    expect(locationOf('/login?next=%2Ftrips', { session: true })).toBe('/trips');
    expect(locationOf('/login?next=https%3A%2F%2Fevil.example', { session: true })).toBe('/');
  });
});
