import { fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';

import { IntlTestProvider } from '@/i18n/test-utils';
import type { AppLocale } from '@/i18n/config';
import type { PublicDestination } from '../types';

/**
 * Đổi NGÔN NGỮ không được đổi NGHIỆP VỤ.
 *
 * Bài test này canh đúng ranh giới đó ở khu dễ vỡ nhất — trải nghiệm tìm kiếm trang chủ, nơi
 * trạng thái của thẻ hero chảy thẳng ra URL. Hai nhóm khẳng định:
 *
 *   1. Cùng một thao tác, ở hai ngôn ngữ, phát ra ĐÚNG một query string.
 *   2. Thuê dài hạn ở trang chủ vẫn CHỈ hỏi địa điểm (ADR 0011) — bản dịch không lén mang
 *      ngày, gói thuê hay câu "tối thiểu 7 ngày" quay lại.
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

vi.mock('@/hooks/use-media-query', () => ({ useIsMobile: () => false }));

beforeEach(() => {
  nav.push.mockClear();
  nav.searchParams = new URLSearchParams();
  window.history.replaceState(null, '', '/');
});

/** Nhãn giao diện theo ngôn ngữ — chỉ dùng để TÌM phần tử, không phải thứ đang được khoá. */
const UI = {
  vi: {
    heroSearch: 'Tìm xe cho thuê',
    vehicleTabs: 'Loại xe',
    serviceTabs: 'Loại dịch vụ thuê xe',
    submit: 'Tìm kiếm',
    car: 'Ô tô',
    motorbike: 'Xe máy',
    selfDrive: 'Xe tự lái',
    longTerm: 'Thuê xe dài hạn',
    rentalLabel: 'Thời gian nhận/trả',
    locationLabel: 'Địa điểm',
  },
  en: {
    heroSearch: 'Search vehicles for rent',
    vehicleTabs: 'Vehicle type',
    serviceTabs: 'Rental service',
    submit: 'Search',
    car: 'Car',
    motorbike: 'Motorbike',
    selfDrive: 'Self-drive',
    longTerm: 'Long-term rental',
    rentalLabel: 'Pick-up/return time',
    locationLabel: 'Location',
  },
} as const;

async function renderAt(locale: AppLocale) {
  const { SearchExperience } = await import('./SearchExperience');
  render(
    <IntlTestProvider locale={locale}>
      <SearchExperience />
    </IntlTestProvider>,
  );
  return UI[locale];
}

/**
 * Thẻ hero (landmark `search`) chứa CẢ hai tầng tab lẫn vùng form; `tabpanel` chỉ là vùng
 * form của dịch vụ đang chọn. Hai hàm riêng vì hai bài test hỏi hai câu khác nhau.
 */
function heroCard(name: string): HTMLElement {
  return screen.getByRole('search', { name });
}

function heroFields(): HTMLElement {
  return screen.getByRole('tabpanel');
}

function submittedQuery(): URLSearchParams {
  const href = nav.push.mock.calls.at(-1)?.[0] as string;
  expect(href.startsWith('/search')).toBe(true);
  return new URLSearchParams(href.split('?')[1] ?? '');
}

describe('tham số tìm kiếm KHÔNG đổi theo ngôn ngữ', () => {
  it.each(['vi', 'en'] as const)(
    '%s: chọn xe máy + dài hạn phát ra cùng một bộ tham số',
    async (locale) => {
      const ui = await renderAt(locale);

      fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('radio', { name: ui.motorbike }));
      fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('tab', { name: ui.longTerm }));
      fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('button', { name: ui.submit }));

      const query = submittedQuery();
      expect(query.get('vehicleType')).toBe(VEHICLE_TYPE.MOTORBIKE);
      expect(query.get('serviceType')).toBe(SERVICE_TYPE.LONG_TERM);
      // Giá trị đi trên dây là MÃ, không bao giờ là nhãn đã dịch.
      expect(query.get('serviceType')).not.toBe(ui.longTerm);
    },
  );

  it('hai ngôn ngữ cho ra query string GIỐNG HỆT nhau với cùng thao tác', async () => {
    const queries: string[] = [];
    for (const locale of ['vi', 'en'] as const) {
      const ui = await renderAt(locale);
      fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('radio', { name: ui.motorbike }));
      fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('button', { name: ui.submit }));
      queries.push(submittedQuery().toString());
      screen.getByRole('search', { name: ui.heroSearch });
      // Dọn giữa hai lượt để lượt sau không tìm thấy cây của lượt trước.
      document.body.innerHTML = '';
    }
    expect(queries[0]).toBe(queries[1]);
  });
});

describe('thuê dài hạn ở trang chủ vẫn CHỈ hỏi địa điểm (ADR 0011)', () => {
  it.each(['vi', 'en'] as const)('%s: không có ô thời gian thuê', async (locale) => {
    const ui = await renderAt(locale);

    // Tự lái CÓ ô thời gian…
    expect(within(heroFields()).queryByText(ui.rentalLabel)).not.toBeNull();

    fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('tab', { name: ui.longTerm }));

    // …dài hạn thì KHÔNG.
    expect(within(heroFields()).queryByText(ui.rentalLabel)).toBeNull();
    expect(within(heroFields()).queryByText(ui.locationLabel)).not.toBeNull();
  });

  it.each(['vi', 'en'] as const)(
    '%s: không có bộ chọn gói, không có nguyện vọng ngày nhận, không có câu "7 ngày"',
    async (locale) => {
      const ui = await renderAt(locale);
      fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('tab', { name: ui.longTerm }));
      const text = heroFields().textContent ?? '';

      // Gói thuê và nguyện vọng nhận xe thuộc luồng đặt xe TỪNG XE, không thuộc trang chủ.
      for (const forbidden of [
        '1 tháng',
        '12 tháng',
        '1 month',
        '12 months',
        'Trong 7 ngày tới',
        'Within the next 7 days',
        'tối thiểu 7 ngày',
        'minimum of 7 days',
      ]) {
        expect(text).not.toContain(forbidden);
      }
    },
  );

  it.each(['vi', 'en'] as const)('%s: URL dài hạn KHÔNG mang ngày', async (locale) => {
    const ui = await renderAt(locale);
    fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('tab', { name: ui.longTerm }));
    fireEvent.click(within(heroCard(ui.heroSearch)).getByRole('button', { name: ui.submit }));

    const query = submittedQuery();
    expect(query.get('serviceType')).toBe(SERVICE_TYPE.LONG_TERM);
    expect(query.get('pickupAt')).toBeNull();
    expect(query.get('returnAt')).toBeNull();
    expect(query.get('packageMonths')).toBeNull();
  });
});
