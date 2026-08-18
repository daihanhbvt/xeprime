import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import type { PublicDestination } from '../types';

/**
 * Bản mobile của trải nghiệm tìm kiếm (≤640px).
 *
 * Điều cần khoá: mobile giữ NGUYÊN phân tầng của desktop (loại xe → dịch vụ → tiêu chí) nhưng
 * KHÔNG bê nguyên bố cục — mỗi ô mở bottom sheet thay vì popover, và dài hạn vẫn chỉ có địa
 * điểm. Đây là file riêng vì `useIsMobile` được mock ở tầng module.
 */

const DESTINATIONS: PublicDestination[] = [
  { provinceCode: '48', provinceName: 'Đà Nẵng', vehicleCount: 42 },
  { provinceCode: '79', provinceName: 'TP. Hồ Chí Minh', vehicleCount: 120 },
];

const nav = vi.hoisted(() => ({
  push: vi.fn(),
  replace: vi.fn(),
  searchParams: new URLSearchParams(),
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: nav.push, replace: nav.replace }),
  usePathname: () => '/',
  useSearchParams: () => nav.searchParams,
}));

vi.mock('../hooks/use-destinations', () => ({
  useDestinations: () => ({ data: DESTINATIONS, isLoading: false, error: null }),
}));

vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => true }));

const observers: Array<(entries: Array<{ isIntersecting: boolean }>) => void> = [];

class TestIntersectionObserver {
  constructor(callback: (entries: Array<{ isIntersecting: boolean }>) => void) {
    observers.push(callback);
  }
  observe() {}
  unobserve() {}
  disconnect() {}
  takeRecords() {
    return [];
  }
}

const realIntersectionObserver = window.IntersectionObserver;

beforeEach(() => {
  nav.push.mockClear();
  nav.searchParams = new URLSearchParams();
  observers.length = 0;
  window.history.replaceState(null, '', '/');
  window.IntersectionObserver = TestIntersectionObserver as unknown as typeof IntersectionObserver;
});

afterEach(() => {
  cleanup();
  window.IntersectionObserver = realIntersectionObserver;
});

async function renderExperience() {
  const { SearchExperience } = await import('./SearchExperience');
  render(<SearchExperience />);
}

function hero(): HTMLElement {
  return screen.getByRole('tabpanel');
}

async function scrollHeroOutOfView() {
  await act(async () => {
    for (const notify of observers) notify([{ isIntersecting: false }]);
    await new Promise((resolve) => setTimeout(resolve, 60));
  });
}

describe('hero mobile', () => {
  it('giữ nguyên phân tầng: hai nhóm chọn rồi mới tới tiêu chí', async () => {
    await renderExperience();

    expect(screen.getByRole('tablist', { name: 'Loại xe' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' })).toBeTruthy();
    expect(within(hero()).getByRole('button', { name: /Địa điểm nhận xe/ })).toBeTruthy();
    expect(within(hero()).getByRole('button', { name: 'Tìm xe' })).toBeTruthy();
  });

  it('nhãn dịch vụ dùng bản NGẮN — không nhồi chữ dài rồi cắt cụt', async () => {
    await renderExperience();
    const services = screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' });

    expect(within(services).getByRole('tab', { name: 'Dài hạn' })).toBeTruthy();
    expect(within(services).queryByRole('tab', { name: 'Thuê xe dài hạn' })).toBeNull();
  });

  it('địa điểm mở BOTTOM SHEET (không phải popover desktop) và chọn xong thì đóng lại', async () => {
    await renderExperience();
    fireEvent.click(within(hero()).getByRole('button', { name: /Địa điểm nhận xe/ }));

    const sheet = screen.getByRole('dialog', { name: 'Bạn muốn thuê xe ở đâu?' });
    fireEvent.click(within(sheet).getByRole('button', { name: 'Đà Nẵng' }));

    expect(within(hero()).getByRole('button', { name: 'Địa điểm nhận xe: Đà Nẵng' })).toBeTruthy();
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm xe' }));
    const href = nav.push.mock.calls.at(-1)?.[0] as string;
    expect(new URLSearchParams(href.split('?')[1]).get('provinceCode')).toBe('48');
  });

  it('dài hạn trên mobile: chỉ địa điểm + nút tìm + gợi ý, không có lịch', async () => {
    await renderExperience();
    fireEvent.click(
      within(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' })).getByRole('tab', {
        name: 'Dài hạn',
      }),
    );

    expect(within(hero()).queryByRole('button', { name: /Thời gian thuê/ })).toBeNull();
    expect(within(hero()).getByText(/Chọn xe trước, sau đó chọn gói thuê/)).toBeTruthy();
    expect(screen.queryByText(/tối thiểu/i)).toBeNull();
  });
});

describe('thanh thu gọn mobile', () => {
  it('ĐÚNG một hàng: địa điểm · ngày giờ · nút biểu tượng — không có viên ngữ cảnh', async () => {
    await renderExperience();
    await scrollHeroOutOfView();
    const bar = screen.getByRole('search', { name: 'Tìm kiếm nhanh' });

    expect(within(bar).getByRole('button', { name: /Địa điểm nhận xe/ })).toBeTruthy();
    expect(within(bar).getByRole('button', { name: /Thời gian thuê/ })).toBeTruthy();
    // Loại xe/dịch vụ được KẾ THỪA từ thẻ phía trên, không hỏi lại ở thanh cố định chật chội.
    expect(within(bar).queryByRole('button', { name: /Loại xe và dịch vụ/ })).toBeNull();
  });

  it('nút tìm chỉ còn biểu tượng nhưng vẫn có tên khả truy cập', async () => {
    await renderExperience();
    await scrollHeroOutOfView();
    const bar = screen.getByRole('search', { name: 'Tìm kiếm nhanh' });

    const submit = within(bar).getByRole('button', { name: 'Tìm xe' });
    expect(submit.textContent).toBe('');

    fireEvent.click(submit);
    expect(nav.push).toHaveBeenCalled();
  });

  it('dài hạn: thanh thu gọn bỏ luôn ô ngày giờ, còn địa điểm và nút', async () => {
    await renderExperience();
    fireEvent.click(
      within(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' })).getByRole('tab', {
        name: 'Dài hạn',
      }),
    );
    await scrollHeroOutOfView();
    const bar = screen.getByRole('search', { name: 'Tìm kiếm nhanh' });

    expect(within(bar).queryByRole('button', { name: /Thời gian thuê/ })).toBeNull();
    fireEvent.click(within(bar).getByRole('button', { name: 'Tìm xe' }));

    const query = new URLSearchParams(
      (nav.push.mock.calls.at(-1)?.[0] as string).split('?')[1] ?? '',
    );
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.LONG_TERM);
    expect(query.get('vehicleType')).toBe(VEHICLE_TYPE.CAR);
    expect(query.has('pickupAt')).toBe(false);
  });
});
