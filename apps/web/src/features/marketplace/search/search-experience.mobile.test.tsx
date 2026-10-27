import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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
  useAllDestinations: () => ({ data: DESTINATIONS, isLoading: false, error: null }),
}));

vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => true }));

beforeEach(() => {
  nav.push.mockClear();
  nav.searchParams = new URLSearchParams();
  window.history.replaceState(null, '', '/');
});

afterEach(() => {
  cleanup();
});

async function renderExperience() {
  const { SearchExperience } = await import('./SearchExperience');
  render(<SearchExperience />);
}

function hero(): HTMLElement {
  return screen.getByRole('tabpanel');
}

describe('hero mobile', () => {
  it('giữ nguyên phân tầng: hai nhóm chọn rồi mới tới tiêu chí', async () => {
    await renderExperience();

    expect(within(hero()).getByRole('radiogroup', { name: 'Loại xe' })).toBeTruthy();
    expect(screen.getByRole('tablist', { name: 'Loại dịch vụ thuê xe' })).toBeTruthy();
    expect(within(hero()).getByRole('button', { name: /Địa điểm nhận xe/ })).toBeTruthy();
    expect(within(hero()).getByRole('button', { name: 'Tìm kiếm' })).toBeTruthy();
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
    fireEvent.click(within(hero()).getByRole('button', { name: 'Tìm kiếm' }));
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
