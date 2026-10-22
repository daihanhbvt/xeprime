import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SUPPORT_CASE_CATEGORY, SUPPORT_CASE_STATUS } from '@xeprime/types';

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
  useCanWriteSupportCase: () => true,
}));

function caseDetail(category: string): SupportCaseDetail {
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
});

afterEach(cleanup);

describe('SupportCaseDetailPanel — case giữ tiền chỉ nền tảng đóng', () => {
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
