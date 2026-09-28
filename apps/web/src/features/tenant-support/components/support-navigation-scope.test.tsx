import { cleanup, fireEvent, screen } from '@testing-library/react';
import { App } from 'antd';
import { AppRouterContext } from 'next/dist/shared/lib/app-router-context.shared-runtime';
import { useRouter } from 'next/navigation';
import type { ContextType, ReactNode } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ROUTES, adminTenantSupportPath } from '@/constants/routes';
import { renderWithIntl } from '@/i18n/test-utils';
import { SupportSessionScope, supportSessionOf } from '../support-session';
import { CONTEXT_A, CONTEXT_B, supportContextFixture } from '../test-utils';
import { SupportNavigationScope } from './SupportNavigationScope';

/**
 * Lớp giữ điều hướng của phiên (ADR 0050 §12): link và `router.push` của trang DÙNG LẠI viết
 * `/manage/...` như ở gian hàng — trong phiên chúng phải tới trang của phiên, không thoát ra.
 */
vi.mock('next/navigation', async () => {
  const { useContext } = await import('react');
  const ctx = await import('next/dist/shared/lib/app-router-context.shared-runtime');
  // `useRouter()` thật đọc đúng context này — mock giữ nguyên hành vi đó.
  return { useRouter: () => useContext(ctx.AppRouterContext) };
});

type AppRouter = NonNullable<ContextType<typeof AppRouterContext>>;

const base = adminTenantSupportPath.root(CONTEXT_A);
let router: AppRouter;
const openSpy = vi.fn();

beforeEach(() => {
  router = {
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
    back: vi.fn(),
    forward: vi.fn(),
    refresh: vi.fn(),
  } as unknown as AppRouter;
  openSpy.mockReset();
  vi.stubGlobal('open', openSpy);
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function PushButton({ href }: { href: string }) {
  const r = useRouter();
  return (
    <button type="button" onClick={() => r.push(href)}>
      push {href}
    </button>
  );
}

function renderScope(children: ReactNode, inSession = true) {
  const tree = <SupportNavigationScope>{children}</SupportNavigationScope>;
  return renderWithIntl(
    <App>
      <AppRouterContext.Provider value={router}>
        {inSession ? (
          <SupportSessionScope session={supportSessionOf(supportContextFixture())}>
            {tree}
          </SupportSessionScope>
        ) : (
          tree
        )}
      </AppRouterContext.Provider>
    </App>,
  );
}

describe('SupportNavigationScope', () => {
  it('link /manage/... trong card/bảng đi tới trang của PHIÊN', () => {
    renderScope(<a href={ROUTES.MANAGE.VEHICLES}>xe</a>);
    const event = fireEvent.click(screen.getByText('xe'));
    expect(event).toBe(false); // đã preventDefault — trình duyệt không tự đi tới /manage/vehicles
    expect(router.push).toHaveBeenCalledWith(`${base}/vehicles`, undefined);
  });

  it('router.push của trang dùng lại cũng được ánh xạ', () => {
    renderScope(<PushButton href="/manage/bookings/b1" />);
    fireEvent.click(screen.getByRole('button'));
    expect(router.push).toHaveBeenCalledWith(`${base}/bookings/b1`, undefined);
  });

  it('khu bị ẩn (tài chính, chat, tài khoản): không điều hướng đi đâu', () => {
    renderScope(
      <>
        <a href="/manage/finance">tai-chinh</a>
        <a href="/chat">chat</a>
        <PushButton href="/account/wallet" />
      </>,
    );
    expect(fireEvent.click(screen.getByText('tai-chinh'))).toBe(false);
    expect(fireEvent.click(screen.getByText('chat'))).toBe(false);
    fireEvent.click(screen.getByRole('button'));
    expect(router.push).not.toHaveBeenCalled();
  });

  it('bấm vào khu bị ẩn thì NÓI ra, không im lặng', async () => {
    renderScope(<a href="/manage/finance">tai-chinh</a>);
    fireEvent.click(screen.getByText('tai-chinh'));
    await screen.findByText('Màn này không mở trong phiên hỗ trợ gian hàng.');
  });

  it('chuột phải KHÔNG điều hướng (auxclick bắn cho cả nút phải); chuột giữa mở tab mới', () => {
    renderScope(<a href={ROUTES.MANAGE.VEHICLES}>xe</a>);
    const link = screen.getByText('xe');
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 2 }));
    expect(router.push).not.toHaveBeenCalled();
    expect(openSpy).not.toHaveBeenCalled();
    fireEvent(link, new MouseEvent('auxclick', { bubbles: true, cancelable: true, button: 1 }));
    expect(openSpy).toHaveBeenCalledWith(`${base}/vehicles`, '_blank', 'noopener');
  });

  it('tài khoản của CHÍNH nhân sự (Bảo mật) không bị chặn', () => {
    renderScope(<a href={ROUTES.MANAGE.SECURITY}>bao-mat</a>);
    expect(fireEvent.click(screen.getByText('bao-mat'))).toBe(true);
  });

  it('link sang phiên KHÁC bị chặn', () => {
    renderScope(<a href={`${adminTenantSupportPath.root(CONTEXT_B)}/vehicles`}>khac</a>);
    expect(fireEvent.click(screen.getByText('khac'))).toBe(false);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('Ctrl+click mở trang của phiên ở tab mới', () => {
    renderScope(<a href={ROUTES.MANAGE.CUSTOMERS}>khach</a>);
    fireEvent.click(screen.getByText('khach'), { ctrlKey: true });
    expect(openSpy).toHaveBeenCalledWith(`${base}/customers`, '_blank', 'noopener');
    expect(router.push).not.toHaveBeenCalled();
  });

  it('link ra màn nền tảng (thoát phiên) để nguyên', () => {
    renderScope(<a href={ROUTES.MANAGE.ADMIN_TENANTS}>thoat</a>);
    expect(fireEvent.click(screen.getByText('thoat'))).toBe(true);
    expect(router.push).not.toHaveBeenCalled();
  });

  it('ngoài phiên: không chạm vào điều hướng của gian hàng', () => {
    renderScope(
      <>
        <a href={ROUTES.MANAGE.VEHICLES}>xe</a>
        <PushButton href={ROUTES.MANAGE.VEHICLES} />
      </>,
      false,
    );
    expect(fireEvent.click(screen.getByText('xe'))).toBe(true);
    fireEvent.click(screen.getByRole('button'));
    expect(router.push).toHaveBeenCalledWith(ROUTES.MANAGE.VEHICLES);
  });
});
