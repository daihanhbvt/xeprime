import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VehicleDetail, VehicleSource } from '../types';
import { VehicleCapitalCard } from './VehicleCapitalCard';

/**
 * Thẻ "Nghĩa vụ nguồn xe" - ghép hồ sơ nguồn xe với lợi nhuận kỳ. Không bịa số: chưa khai ngày
 * đóng tiền thì mời khai, chưa có hồ sơ thì mời khai hồ sơ.
 */

const state = vi.hoisted(() => ({
  source: { data: undefined as unknown, isLoading: false, isError: false },
  canSource: true,
}));

vi.mock('../hooks/use-vehicle-source', () => ({
  useVehicleSource: () => state.source,
}));

vi.mock('../hooks/use-vehicle-capabilities', () => ({
  useVehicleCapabilities: () => ({ source: state.canSource }),
}));

vi.mock('@/features/tenant-support/support-session', () => ({
  useAvailableHref: () => (href: string | null) => href,
}));

vi.mock('@/hooks/use-workspace', () => ({
  useWorkspace: () => ({
    vehicles: { part: (id: string, tab: string) => `/manage/vehicles/${id}/edit?tab=${tab}` },
  }),
}));

const vehicle = { id: 'v1', sourceType: 'financed' } as unknown as VehicleDetail;

function detail(over: Partial<NonNullable<VehicleSource['detail']>>) {
  return {
    sourceType: 'financed',
    contractFiles: [],
    obligationReady: true,
    updatedAt: '2026-11-01T00:00:00.000Z',
    ...over,
  } as NonNullable<VehicleSource['detail']>;
}

function renderCard(props: Partial<{ revenue: string | null; profit: string | null }> = {}) {
  return render(
    <VehicleCapitalCard
      vehicle={vehicle}
      filters={{ from: '2026-07-01', to: '2026-09-30' }}
      revenue={props.revenue ?? '24800000'}
      profit={props.profit ?? '21150000'}
      allTime={false}
      moneyLoading={false}
    />,
  );
}

beforeEach(() => {
  state.canSource = true;
  state.source = { data: undefined, isLoading: false, isError: false };
});

afterEach(cleanup);

describe('VehicleCapitalCard', () => {
  it('trả góp: phải đóng = mỗi tháng × số ngày đóng trong kỳ, rồi dư sau trả góp', () => {
    state.source.data = {
      sourceType: 'financed',
      detail: detail({ bankName: 'VPBank', monthlyTotal: '11500000', paymentDay: 15 }),
    };
    renderCard();
    expect(screen.getByText('VPBank')).toBeTruthy();
    expect(screen.getByText('Gốc + lãi mỗi tháng (ngày 15)')).toBeTruthy();
    expect(screen.getByText('Đã tới hạn đóng trong kỳ (3 kỳ)')).toBeTruthy();
    expect(screen.getByText('34.500.000 ₫')).toBeTruthy();
    // 21.150.000 − 34.500.000 = −13.350.000 ⇒ xe chưa tự nuôi được khoản vay trong kỳ.
    expect(screen.getByText('-13.350.000 ₫')).toBeTruthy();
  });

  it('kỳ đang chạy: chỉ đếm kỳ đóng đã tới hạn tính tới hôm nay', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-11-26T03:00:00.000Z'));
    try {
      state.source.data = {
        sourceType: 'financed',
        detail: detail({ monthlyTotal: '1000000', paymentDay: 15 }),
      };
      render(
        <VehicleCapitalCard
          vehicle={vehicle}
          filters={{ from: '2026-01-01', to: '2026-12-31' }}
          revenue="0"
          profit="0"
          allTime={false}
          moneyLoading={false}
        />,
      );
      // 15/01 … 15/11 - kỳ 15/12 chưa tới hạn.
      expect(screen.getByText('Đã tới hạn đóng trong kỳ (11 kỳ)')).toBeTruthy();
      expect(screen.getByText('11.000.000 ₫')).toBeTruthy();
    } finally {
      vi.useRealTimers();
    }
  });

  it('trả góp chưa khai ngày đóng: mời khai, không đoán số phải đóng', () => {
    state.source.data = {
      sourceType: 'financed',
      detail: detail({ monthlyTotal: '11500000', paymentDay: null }),
    };
    renderCard();
    expect(screen.getByText(/Khai ngày đóng tiền hằng tháng/)).toBeTruthy();
    expect(screen.queryByText(/tới hạn đóng trong kỳ/)).toBeNull();
  });

  it('hợp tác: phần chia chủ xe ƯỚC TÍNH trên doanh thu, phần còn lại của gian hàng', () => {
    state.source.data = {
      sourceType: 'partnership',
      detail: detail({
        sourceType: 'partnership',
        ownerName: 'Nguyễn Văn A',
        commissionPercent: '75',
      }),
    };
    renderCard();
    expect(screen.getByText('Chủ xe ký gửi: Nguyễn Văn A')).toBeTruthy();
    expect(screen.getByText('75% doanh thu')).toBeTruthy();
    expect(screen.getByText('18.600.000 ₫')).toBeTruthy();
    expect(screen.getByText('Phần gian hàng giữ lại (25%)')).toBeTruthy();
    expect(screen.getByText('6.200.000 ₫')).toBeTruthy();
  });

  it('sở hữu: giá mua và lợi nhuận kỳ trên giá mua', () => {
    state.source.data = {
      sourceType: 'owned',
      detail: detail({ sourceType: 'owned', purchasePrice: '780000000' }),
    };
    renderCard();
    expect(screen.getByText('780.000.000 ₫')).toBeTruthy();
    expect(screen.getByText(/^2[.,]7%$/)).toBeTruthy();
  });

  it('chưa có hồ sơ: mời khai, có lối "Khai nguồn xe"', () => {
    state.source.data = { sourceType: 'financed', detail: null };
    renderCard();
    expect(screen.getByText(/Chưa khai hồ sơ nguồn xe/)).toBeTruthy();
    expect(
      screen
        .getByText(/Khai nguồn xe/)
        .closest('a')
        ?.getAttribute('href'),
    ).toContain('tab=source');
  });

  it('không có quyền xem sổ nguồn xe ⇒ không dựng thẻ', () => {
    state.canSource = false;
    const { container } = renderCard();
    expect(container.innerHTML).toBe('');
  });
});
