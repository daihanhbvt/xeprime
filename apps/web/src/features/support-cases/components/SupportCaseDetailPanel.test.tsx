import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_CASE_CATEGORY, SUPPORT_CASE_STATUS, TRIP_VERDICT } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import type { SupportCaseDetail } from '../types';
import { SUPPORT_SURFACE, type SupportSurface } from '../types';

import { SupportCaseDetailPanel } from './SupportCaseDetailPanel';

/**
 * Nút đổi trạng thái của chi tiết case. Điều khoá ở đây: case GIỮ tiền của chuyến (`dispute`,
 * `handover_unconfirmed` — ADR 0066) chỉ nền tảng đóng/kết luận; gian hàng/khách không thấy nút
 * "Đã đóng" trên chúng (server từ chối `SUPPORT_CASE_PLATFORM_RESOLVE_ONLY`). Case thường thì vẫn
 * đóng được.
 */
const detail = vi.hoisted(() => ({ data: undefined as unknown }));
const verdict = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const preview = vi.hoisted(() => ({
  data: undefined as unknown,
  isLoading: false,
  isError: false,
}));

vi.mock('../hooks/use-support-cases', () => ({
  useSupportCase: () => ({
    data: detail.data,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
  usePostSupportMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useTransitionSupportCase: () => ({ mutate: vi.fn(), isPending: false }),
  useResolveSupportCase: () => ({ mutate: vi.fn(), isPending: false }),
  useTripVerdict: () => verdict,
  useTripVerdictPreview: () => preview,
  useCanWriteSupportCase: () => true,
}));

function caseDetail(category: string, tripVerdicts: string[] = []): SupportCaseDetail {
  return {
    id: '01CASE',
    code: 'SC000123',
    category,
    status: SUPPORT_CASE_STATUS.OPEN,
    priority: 'urgent',
    subject: 'Chủ đề',
    description: 'Mô tả',
    tenantId: '01TENANT',
    tenantName: 'Gian hàng A',
    bookingId: '01BOOKING',
    bookingCode: 'DH000123',
    bookingRequestId: null,
    openedByScope: 'tenant',
    openedByName: 'Chủ xe',
    assigneeName: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-10-22T03:00:00.000Z',
    updatedAt: '2026-10-22T03:00:00.000Z',
    events: [],
    tripVerdicts,
    // Server suy: tranh chấp có kết luận nhưng không bắt buộc (ADR 0095).
    tripVerdictRequired: category !== SUPPORT_CASE_CATEGORY.DISPUTE && tripVerdicts.length > 0,
  } as unknown as SupportCaseDetail;
}

function renderPanel(surface: SupportSurface) {
  return renderWithIntl(
    <App>
      <SupportCaseDetailPanel surface={surface} id="01CASE" />
    </App>,
  );
}

const CLOSE = { name: 'Chuyển sang Đã đóng' };

beforeEach(() => {
  detail.data = undefined;
  preview.data = undefined;
});

afterEach(cleanup);

describe('SupportCaseDetailPanel - case giữ tiền chỉ nền tảng đóng', () => {
  it.each([SUPPORT_CASE_CATEGORY.DISPUTE, SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED])(
    'gian hàng xem case %s ⇒ không có nút đóng',
    (category) => {
      detail.data = caseDetail(category);
      renderPanel(SUPPORT_SURFACE.TENANT);
      expect(screen.queryByRole('button', CLOSE)).toBeNull();
    },
  );

  it('gian hàng xem case thường ⇒ vẫn đóng được', () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.OTHER);
    renderPanel(SUPPORT_SURFACE.TENANT);
    expect(screen.getByRole('button', CLOSE)).toBeTruthy();
  });

  it('nền tảng xem tranh chấp ⇒ đóng được', () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.DISPUTE);
    renderPanel(SUPPORT_SURFACE.PLATFORM);
    expect(screen.getByRole('button', CLOSE)).toBeTruthy();
  });
});

/**
 * ADR 0094: case xác minh bàn giao mà đơn còn treo chỉ kết thúc bằng kết luận CHUYẾN — server trả
 * `tripVerdicts`, panel ẩn nút đóng / kết luận trần và bày đúng các kết luận đó.
 */
describe('SupportCaseDetailPanel - kết luận chuyến', () => {
  const PICKUP_VERDICTS = [
    TRIP_VERDICT.HANDED_OVER,
    TRIP_VERDICT.CUSTOMER_NO_SHOW,
    TRIP_VERDICT.HOST_NOT_DELIVERED,
  ];

  beforeEach(() => {
    verdict.mutate.mockClear();
  });

  it('case chưa xác nhận giao xe ⇒ ba nút kết luận, không có nút đóng / kết luận trần', () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED, PICKUP_VERDICTS);
    renderPanel(SUPPORT_SURFACE.PLATFORM);

    expect(screen.getByRole('button', { name: 'Xe đã giao' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Khách không đến' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chủ xe không giao được xe' })).toBeTruthy();
    expect(screen.queryByRole('button', CLOSE)).toBeNull();
    expect(screen.queryByRole('button', { name: 'Kết luận' })).toBeNull();
  });

  it('chọn kết luận ⇒ hộp xác nhận nói hệ quả, gửi kèm cách đã xác minh', async () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED, PICKUP_VERDICTS);
    renderPanel(SUPPORT_SURFACE.PLATFORM);

    fireEvent.click(screen.getByRole('button', { name: 'Khách không đến' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Đơn chuyển sang Khách không đến/)).toBeTruthy();

    fireEvent.change(within(dialog).getByRole('textbox'), {
      target: { value: 'Đã gọi khách lúc 10:15, khách huỷ chuyến' },
    });
    fireEvent.click(within(dialog).getByRole('button', { name: 'Khách không đến' }));

    await waitFor(() => expect(verdict.mutate).toHaveBeenCalledTimes(1));
    expect(verdict.mutate.mock.calls[0]![0]).toEqual({
      id: '01CASE',
      verdict: TRIP_VERDICT.CUSTOMER_NO_SHOW,
      note: 'Đã gọi khách lúc 10:15, khách huỷ chuyến',
    });
  });

  it('đơn đã đi tiếp (server trả rỗng) ⇒ không nút kết luận, đóng trần được', () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.HANDOVER_UNCONFIRMED, []);
    renderPanel(SUPPORT_SURFACE.PLATFORM);

    expect(screen.queryByRole('button', { name: 'Xe đã giao' })).toBeNull();
    expect(screen.getByRole('button', CLOSE)).toBeTruthy();
  });
});

/**
 * ADR 0095: tranh chấp trước giờ nhận có kết luận chuyến nhưng KHÔNG bắt buộc — panel giữ cả ô
 * kết luận trần; hộp xác nhận nói SỐ TIỀN từng bên theo lượt xem trước của server.
 */
describe('SupportCaseDetailPanel - tranh chấp trước nhận xe', () => {
  const DISPUTE_VERDICTS = [
    TRIP_VERDICT.HANDED_OVER,
    TRIP_VERDICT.CUSTOMER_NO_SHOW,
    TRIP_VERDICT.HOST_NOT_DELIVERED,
    TRIP_VERDICT.PLATFORM_CANCELLED,
  ];

  it('bốn nút kết luận VÀ vẫn đóng trần được', () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.DISPUTE, DISPUTE_VERDICTS);
    renderPanel(SUPPORT_SURFACE.PLATFORM);

    expect(screen.getByRole('button', { name: 'Huỷ, không tính lỗi bên nào' })).toBeTruthy();
    // Không bắt buộc ⇒ nút đóng trần vẫn còn (case `handover_unconfirmed` thì không).
    expect(screen.getByRole('button', CLOSE)).toBeTruthy();
  });

  it('hộp xác nhận hiện số tiền từng bên và cảnh báo khi tiền còn bị giữ', async () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.DISPUTE, DISPUTE_VERDICTS);
    preview.data = {
      items: [
        {
          verdict: TRIP_VERDICT.PLATFORM_CANCELLED,
          outcome: 'refunded',
          paidAmount: '1500000',
          customerAmount: '1500000',
          insuranceRefundAmount: '0',
          ownerAmount: '0',
          platformAmount: '0',
          insurerAmount: '0',
          taxAmount: '0',
          deferred: true,
        },
      ],
    };
    renderPanel(SUPPORT_SURFACE.PLATFORM);

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ, không tính lỗi bên nào' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/Hoàn khách 1\.500\.000/)).toBeTruthy();
    expect(within(dialog).getByText(/tiền chờ người trực chốt tay/)).toBeTruthy();
  });

  /*
   * ADR 0104: lời báo "chưa nhận được xe" trên đơn ĐANG THUÊ - kết luận huỷ gỡ biên bản giao xe, và
   * GCN đã phát hành thì khoản trả hãng do XePrime chịu. Hai câu đến từ bản xem trước của server.
   */
  it('đơn đang thuê ⇒ hộp huỷ nói sẽ gỡ biên bản giao xe và GCN đã phát hành', async () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.DISPUTE, DISPUTE_VERDICTS);
    preview.data = { items: [], revertsHandover: true, insuranceIssued: true };
    renderPanel(SUPPORT_SURFACE.PLATFORM);

    fireEvent.click(screen.getByRole('button', { name: 'Huỷ, không tính lỗi bên nào' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/gỡ biên bản giao xe/)).toBeTruthy();
    expect(within(dialog).getByText(/phí trả hãng do XePrime chịu/)).toBeTruthy();
  });

  it('đơn đang thuê ⇒ "xe đã giao" nói rõ giữ nguyên chuyến', async () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.DISPUTE, DISPUTE_VERDICTS);
    preview.data = { items: [], revertsHandover: true, insuranceIssued: true };
    renderPanel(SUPPORT_SURFACE.PLATFORM);

    fireEvent.click(screen.getByRole('button', { name: 'Xe đã giao' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/giữ nguyên chuyến đang thuê/)).toBeTruthy();
    expect(within(dialog).queryByText(/phí trả hãng/)).toBeNull();
  });

  it('"xe đã giao" ⇒ nói rõ chưa chốt tiền', async () => {
    detail.data = caseDetail(SUPPORT_CASE_CATEGORY.DISPUTE, DISPUTE_VERDICTS);
    preview.data = { items: [] };
    renderPanel(SUPPORT_SURFACE.PLATFORM);

    fireEvent.click(screen.getByRole('button', { name: 'Xe đã giao' }));
    const dialog = await screen.findByRole('dialog');
    expect(within(dialog).getByText(/chưa chốt tiền/)).toBeTruthy();
  });
});
