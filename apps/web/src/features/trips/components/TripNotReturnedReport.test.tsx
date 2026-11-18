import { App } from 'antd';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TRIP_ROLE } from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { CustomerTripDetail } from '../types';
import { TripNotReturnedReport } from './TripNotReturnedReport';

/**
 * "Tôi chưa trả xe" (ADR 0105). Luật do SERVER quyết (`notReturnedReportUntil`,
 * `notReturnedReportOpen`), client chỉ canh đồng hồ:
 *  - trong hạn ⇒ thẻ nói rõ luật tiền + nút đỏ; xác nhận ⇒ gọi mutation;
 *  - mốc đóng đã qua ⇒ tự ẩn dù dữ liệu cũ còn mốc;
 *  - đã báo ⇒ khối "đang xử lý" thay cho nút;
 *  - server không cấp mốc ⇒ không vẽ gì.
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
  useReportTripNotReturned: () => state.report,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

const clock = vi.hoisted(() => ({ now: Date.parse('2026-11-20T03:00:00.000Z') }));
vi.mock('@/hooks/use-now', () => ({ useNow: () => clock.now }));

const RETURN_AT = '2026-11-24T03:00:00.000Z';
const UNTIL = '2026-11-24T05:00:00.000Z';

function trip(overrides: Record<string, unknown> = {}): CustomerTripDetail {
  return {
    id: 'RQ1',
    role: TRIP_ROLE.RENTER,
    returnAt: RETURN_AT,
    notReturnedReportOpen: false,
    notReturnedReportUntil: UNTIL,
    ...overrides,
  } as unknown as CustomerTripDetail;
}

function renderReport(data: CustomerTripDetail) {
  return renderWithIntl(
    <App>
      <TripNotReturnedReport trip={data} />
    </App>,
  );
}

beforeEach(() => {
  clock.now = Date.parse('2026-11-20T03:00:00.000Z');
  state.report.mutate.mockReset();
  state.report.isPending = false;
  state.report.isError = false;
  state.report.error = null;
});

afterEach(cleanup);

describe('TripNotReturnedReport', () => {
  it('trong hạn ⇒ thẻ nói tiền giữ nguyên theo đơn, nút mở hộp xác nhận rồi gọi báo', () => {
    renderReport(trip());

    expect(screen.getByText('Chủ xe đã xác nhận nhận lại xe sớm')).toBeTruthy();
    expect(screen.getByText(/Tiền thuê giữ nguyên theo đơn đã đặt/)).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Tôi chưa trả xe' }));
    expect(screen.getByText(/Chỉ báo khi bạn thật sự vẫn đang giữ xe/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Báo chưa trả xe' }));

    expect(state.report.mutate).toHaveBeenCalledTimes(1);
  });

  it('đã quá mốc đóng ⇒ tự ẩn dù dữ liệu cũ còn mốc', () => {
    clock.now = Date.parse('2026-11-24T05:01:00.000Z');
    const { container } = renderReport(trip());

    expect(container.textContent).toBe('');
  });

  it('đã báo ⇒ khối "đang xử lý", không còn nút', () => {
    renderReport(trip({ notReturnedReportOpen: true, notReturnedReportUntil: null }));

    expect(screen.getByText('Đang xử lý báo cáo chưa trả xe')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Tôi chưa trả xe' })).toBeNull();
  });

  it('server không cấp mốc (trả đúng giờ, không phải người đi thuê) ⇒ không vẽ gì', () => {
    const { container } = renderReport(trip({ notReturnedReportUntil: null }));

    expect(container.textContent).toBe('');
  });
});
