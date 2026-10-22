import { App } from 'antd';
import { act, cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRIP_ROLE } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { CustomerTripDetail } from '../types';
import { TripNotReceivedReport } from './TripNotReceivedReport';

/**
 * Nút "Chưa nhận được xe" (ADR 0066, lớp 1). Luật do SERVER quyết (`notReceivedReportUntil`,
 * `openDispute`), client canh đồng hồ; khoá ở đây:
 *  - trong cửa sổ ⇒ nút đỏ, bấm ⇒ hộp xác nhận nói rõ hệ quả, xác nhận ⇒ gọi mutation;
 *  - mốc đóng đã qua ⇒ tự ẩn dù cờ server còn bật (dữ liệu cũ trong cache);
 *  - trang mở trước giờ nhận ⇒ nút tự hiện đúng `pickupAt` mà không tải lại (fake timers);
 *  - đã có tranh chấp mở ⇒ khối "đang xử lý" thay cho nút (sống qua tải lại trang);
 *  - chủ xe xem cùng chuyến ⇒ câu riêng của phía họ.
 */
const state = vi.hoisted(() => ({
  report: {
    mutate: vi.fn(),
    isPending: false,
    isError: false,
    error: null as unknown,
  },
}));

vi.mock('../hooks', () => ({
  useReportTripNotReceived: () => state.report,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const NOW = Date.parse('2026-10-22T03:30:00.000Z');
const clock = vi.hoisted(() => ({ fixed: null as number | null }));
/*
 * Mặc định ghim "bây giờ" = `NOW`; nhóm test theo đồng hồ đặt `clock.fixed = null` để chạy
 * `useNow` THẬT trên fake timers. Hook thật luôn được gọi — thứ tự hook không đổi giữa hai chế độ.
 */
vi.mock('@/hooks/use-now', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/hooks/use-now')>();
  return {
    useNow: (intervalMs?: number) => {
      const live = actual.useNow(intervalMs);
      return clock.fixed ?? live;
    },
  };
});

const PICKUP_AT = '2026-10-22T03:00:00.000Z';
const WINDOW_ENDS_AT = '2026-10-22T05:00:00.000Z';

function trip(overrides: Record<string, unknown> = {}): CustomerTripDetail {
  return {
    id: 'RQ1',
    role: TRIP_ROLE.RENTER,
    pickupAt: PICKUP_AT,
    openDispute: false,
    canReportNotReceived: true,
    notReceivedReportUntil: WINDOW_ENDS_AT,
    ...overrides,
  } as unknown as CustomerTripDetail;
}

function renderReport(data: CustomerTripDetail) {
  return renderWithIntl(
    <App>
      <TripNotReceivedReport trip={data} />
    </App>,
  );
}

beforeEach(() => {
  clock.fixed = NOW;
  state.report.mutate.mockReset();
  state.report.isPending = false;
  state.report.isError = false;
  state.report.error = null;
});

afterEach(cleanup);

describe('TripNotReceivedReport', () => {
  it('trong cửa sổ ⇒ nút đỏ; xác nhận trong hộp thoại ⇒ gọi báo cáo', () => {
    renderReport(trip());

    const button = screen.getByRole('button', { name: 'Chưa nhận được xe' });
    expect(button.className).toContain('ant-btn-dangerous');
    fireEvent.click(button);

    expect(screen.getByText(/XePrime sẽ tạm giữ toàn bộ tiền của chuyến này/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Báo chưa nhận được xe' }));
    expect(state.report.mutate).toHaveBeenCalledTimes(1);
  });

  it('mốc đóng cửa sổ đã qua ⇒ không vẽ nút dù cờ trong cache còn bật', () => {
    renderReport(
      trip({
        pickupAt: '2026-10-22T01:00:00.000Z',
        notReceivedReportUntil: '2026-10-22T03:00:00.000Z',
      }),
    );
    expect(screen.queryByRole('button', { name: 'Chưa nhận được xe' })).toBeNull();
  });

  it('server không bật cờ (ngoài cửa sổ / sai trạng thái) ⇒ không vẽ gì', () => {
    const { container } = renderReport(
      trip({ canReportNotReceived: false, notReceivedReportUntil: null }),
    );
    expect(container.textContent).toBe('');
  });

  it('đã có tranh chấp mở ⇒ khối đang xử lý, không còn nút', () => {
    renderReport(trip({ openDispute: true, canReportNotReceived: false }));
    expect(screen.getByText('Đang xử lý khiếu nại chưa nhận được xe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Chưa nhận được xe' })).toBeNull();
  });

  it('chủ xe xem chuyến có khiếu nại ⇒ câu của phía chủ xe', () => {
    renderReport(trip({ role: TRIP_ROLE.HOST, openDispute: true, canReportNotReceived: false }));
    expect(screen.getByText('Chuyến này đang có khiếu nại')).toBeTruthy();
  });

  describe('theo đồng hồ — trang mở TRƯỚC giờ nhận xe, không tải lại', () => {
    beforeEach(() => {
      clock.fixed = null;
      vi.useFakeTimers({
        now: Date.parse('2026-10-22T02:50:00.000Z'),
        toFake: ['Date', 'setInterval', 'clearInterval'],
      });
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it('nút tự hiện lúc tới giờ nhận và tự ẩn lúc đóng cửa sổ', () => {
      // Đúng như server trả lúc tải trang trước giờ nhận: chưa báo được, nhưng còn mốc đóng.
      renderReport(trip({ canReportNotReceived: false }));
      expect(screen.queryByRole('button', { name: 'Chưa nhận được xe' })).toBeNull();

      act(() => {
        vi.advanceTimersByTime(11 * 60_000); // 03:01 — đã qua `pickupAt`
      });
      expect(screen.getByRole('button', { name: 'Chưa nhận được xe' })).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(120 * 60_000); // 05:01 — quá `pickupAt + 120′`
      });
      expect(screen.queryByRole('button', { name: 'Chưa nhận được xe' })).toBeNull();
    });

    it('server đã thôi cho báo (không có mốc đóng) ⇒ tới giờ cũng không hiện', () => {
      renderReport(trip({ canReportNotReceived: false, notReceivedReportUntil: null }));
      act(() => {
        vi.advanceTimersByTime(20 * 60_000);
      });
      expect(screen.queryByRole('button', { name: 'Chưa nhận được xe' })).toBeNull();
    });
  });

  it('báo lỗi từ server hiện theo MÃ lỗi trong hộp thoại', () => {
    state.report.isError = true;
    state.report.error = {
      code: 'TRIP_NOT_RECEIVED_WINDOW_CLOSED',
      status: 409,
      message: 'x',
    };
    renderReport(trip());
    fireEvent.click(screen.getByRole('button', { name: 'Chưa nhận được xe' }));
    expect(screen.getByRole('alert').textContent).toBeTruthy();
  });
});
