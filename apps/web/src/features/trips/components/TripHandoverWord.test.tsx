import { App } from 'antd';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRIP_ROLE } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { CustomerTripDetail } from '../types';
import { TripHandoverWord } from './TripHandoverWord';

/**
 * "Đã nhận xe" / "Đã trả xe" của khách (ADR 0081). Luật do SERVER quyết qua cờ của chi tiết chuyến;
 * client chỉ vẽ và canh đồng hồ cho mốc mở nút "Đã nhận xe". Khoá ở đây:
 *  - cờ nhận xe bật ⇒ nút, bấm ⇒ hộp xác nhận, xác nhận ⇒ gọi đúng lượt `pickup`;
 *  - trang mở trước mốc mở nhưng đồng hồ đã qua mốc ⇒ nút tự hiện;
 *  - cờ trả xe bật ⇒ nút "Đã trả xe" gọi lượt `return`;
 *  - đã báo trả xe ⇒ câu "đang chờ chủ xe, tự hoàn thành lúc…", không còn nút;
 *  - không cờ nào ⇒ không vẽ gì.
 */
const state = vi.hoisted(() => ({
  word: null as 'pickup' | 'return' | null,
  mutation: { mutate: vi.fn(), isPending: false, isError: false, error: null as unknown },
}));

vi.mock('../hooks', () => ({
  useTripHandoverWord: (_id: string, word: 'pickup' | 'return') => {
    state.word = word;
    return state.mutation;
  },
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const NOW = Date.parse('2026-11-05T03:30:00.000Z');
vi.mock('@/hooks/use-now', () => ({ useNow: () => NOW }));

function trip(overrides: Record<string, unknown> = {}): CustomerTripDetail {
  return {
    id: 'RQ1',
    role: TRIP_ROLE.RENTER,
    canConfirmPickup: false,
    pickupConfirmOpensAt: null,
    canReportReturn: false,
    customerReturnedAt: null,
    returnAutoCompleteAt: null,
    ...overrides,
  } as unknown as CustomerTripDetail;
}

function renderWord(data: CustomerTripDetail) {
  return renderWithIntl(
    <App>
      <TripHandoverWord trip={data} />
    </App>,
  );
}

beforeEach(() => {
  state.word = null;
  state.mutation.mutate.mockReset();
  state.mutation.isPending = false;
  state.mutation.isError = false;
});

afterEach(cleanup);

describe('TripHandoverWord', () => {
  it('được xác nhận nhận xe ⇒ nút; xác nhận trong hộp ⇒ gọi lượt pickup', () => {
    renderWord(trip({ canConfirmPickup: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Đã nhận xe' }));
    expect(screen.getByText(/Chuyến sẽ chuyển sang đang thuê từ bây giờ/)).toBeTruthy();
    const confirm = screen.getAllByRole('button', { name: 'Đã nhận xe' }).at(-1)!;
    fireEvent.click(confirm);
    expect(state.word).toBe('pickup');
    expect(state.mutation.mutate).toHaveBeenCalledTimes(1);
  });

  it('trang mở trước mốc mở nút, đồng hồ đã qua mốc ⇒ nút tự hiện', () => {
    renderWord(trip({ pickupConfirmOpensAt: new Date(NOW - 60_000).toISOString() }));
    expect(screen.getByRole('button', { name: 'Đã nhận xe' })).toBeTruthy();
  });

  it('chưa tới mốc mở nút ⇒ không vẽ gì', () => {
    const { container } = renderWord(
      trip({ pickupConfirmOpensAt: new Date(NOW + 30 * 60_000).toISOString() }),
    );
    expect(container.textContent).toBe('');
  });

  it('đang thuê ⇒ "Đã trả xe" gọi lượt return', () => {
    renderWord(trip({ canReportReturn: true }));
    fireEvent.click(screen.getByRole('button', { name: 'Đã trả xe' }));
    fireEvent.click(screen.getAllByRole('button', { name: 'Đã trả xe' }).at(-1)!);
    expect(state.word).toBe('return');
    expect(state.mutation.mutate).toHaveBeenCalledTimes(1);
  });

  it('đã báo trả xe ⇒ câu chờ chủ xe + hạn tự hoàn thành, không còn nút', () => {
    renderWord(
      trip({
        customerReturnedAt: new Date(NOW - 60_000).toISOString(),
        returnAutoCompleteAt: new Date(NOW + 24 * 3_600_000).toISOString(),
      }),
    );
    expect(screen.getByText(/Bạn đã báo trả xe lúc/)).toBeTruthy();
    expect(screen.getByText(/tự hoàn thành lúc/)).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
