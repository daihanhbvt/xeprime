import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_CASE_CATEGORY, SUPPORT_CASE_STATUS } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import type { SupportCase } from '../types';
import { SUPPORT_SURFACE } from '../types';

import { SupportCasesView } from './SupportCasesView';

/**
 * Một view, ba bề mặt (khách / gian hàng / nền tảng).
 *
 * Điều đáng khoá nhất KHÔNG phải bảng, mà là **nền tảng không mở case thay người khác**: một
 * khiếu nại phải có người mở thật để còn biết trả lời cho ai. Cùng lý do, bề mặt được truyền
 * xuống tận query — ba màn không được dùng lẫn cache của nhau, vì cùng một `id` trả về dòng thời
 * gian khác nhau (ghi chú nội bộ chỉ nền tảng thấy).
 */

const query = vi.hoisted(() => ({
  data: undefined as { items: SupportCase[]; meta: unknown } | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
  lastSurface: undefined as unknown,
}));

vi.mock('../hooks/use-support-cases', () => ({
  useSupportCases: (surface: unknown) => {
    query.lastSurface = surface;
    return query;
  },
  useSupportCase: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  usePostSupportMessage: () => ({ mutate: vi.fn(), isPending: false }),
  useTransitionSupportCase: () => ({ mutate: vi.fn(), isPending: false }),
  useResolveSupportCase: () => ({ mutate: vi.fn(), isPending: false }),
  useOpenSupportCase: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function supportCase(over: Partial<SupportCase> = {}): SupportCase {
  return {
    id: '01CASE',
    code: 'SC-000123',
    category: SUPPORT_CASE_CATEGORY.DISPUTE,
    status: SUPPORT_CASE_STATUS.OPEN,
    priority: 'normal',
    subject: 'Xe giao không đúng mô tả',
    description: 'Xe thiếu ghế trẻ em đã đặt.',
    tenantId: '01TENANT',
    tenantName: 'Gian hàng A',
    bookingId: '01BOOKING',
    bookingCode: 'BK-000123',
    bookingRequestId: null,
    openedByScope: 'customer',
    openedByName: 'Nguyen Van A',
    assigneeName: null,
    resolution: null,
    resolvedAt: null,
    closedAt: null,
    createdAt: '2026-09-01T03:00:00.000Z',
    updatedAt: '2026-09-02T03:00:00.000Z',
    ...over,
  } as SupportCase;
}

function renderView(surface: (typeof SUPPORT_SURFACE)[keyof typeof SUPPORT_SURFACE]) {
  return renderWithIntl(
    <App>
      <SupportCasesView surface={surface} />
    </App>,
  );
}

beforeEach(() => {
  query.data = { items: [supportCase()], meta: { page: 1, limit: 20, total: 1, hasNext: false } };
  query.isError = false;
  query.isFetching = false;
  query.refetch.mockReset();
});

afterEach(cleanup);

describe('SupportCasesView — theo bề mặt', () => {
  it('khách mở được yêu cầu mới', () => {
    renderView(SUPPORT_SURFACE.CUSTOMER);

    expect(screen.getByRole('button', { name: /Mở yêu cầu/ })).toBeTruthy();
    expect(query.lastSurface).toBe('customer');
  });

  it('gian hàng cũng mở được yêu cầu mới', () => {
    renderView(SUPPORT_SURFACE.TENANT);

    expect(screen.getByRole('button', { name: /Mở yêu cầu/ })).toBeTruthy();
    expect(query.lastSurface).toBe('tenant');
  });

  it('nền tảng KHÔNG mở case thay người khác', () => {
    renderView(SUPPORT_SURFACE.PLATFORM);

    expect(screen.queryByRole('button', { name: /Mở yêu cầu/ })).toBeNull();
    expect(query.lastSurface).toBe('platform');
  });
});

describe('SupportCasesView — bảng', () => {
  it('hiện mã, tiêu đề và nhãn loại đã dịch', () => {
    renderView(SUPPORT_SURFACE.CUSTOMER);

    expect(screen.getByText('SC-000123')).toBeTruthy();
    expect(screen.getByText('Xe giao không đúng mô tả')).toBeTruthy();
    expect(screen.getAllByText('Tranh chấp chuyến đi').length).toBeGreaterThan(0);
  });

  it('lỗi khi chưa có dữ liệu: câu chữ riêng + Thử lại', () => {
    query.data = undefined;
    query.isError = true;
    renderView(SUPPORT_SURFACE.CUSTOMER);

    expect(screen.getByText('Không tải được danh sách.')).toBeTruthy();
  });
});
