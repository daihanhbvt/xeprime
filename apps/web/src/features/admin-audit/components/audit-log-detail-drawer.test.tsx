import { App } from 'antd';
import { cleanup, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';
import type { AuditLogDetail } from '../types';
import { AuditLogDetailDrawer } from './AuditLogDetailDrawer';

/**
 * Panel chi tiết nhật ký — khoá cách KỂ một sự kiện gói dịch vụ bằng ngôn ngữ hợp đồng, và việc mã
 * kỹ thuật chỉ còn ở khối "Thông tin kỹ thuật".
 */

const state = vi.hoisted(() => ({ data: undefined as unknown }));

vi.mock('../hooks/use-audit-logs', () => ({
  useAuditLog: () => ({ data: state.data, isLoading: false, isError: false, refetch: vi.fn() }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
  usePathname: () => '/admin/audit',
  useSearchParams: () => new URLSearchParams(),
}));

function detail(over: Partial<AuditLogDetail> = {}): AuditLogDetail {
  return {
    id: '01M4D2ZK3THCE5G6YSM7AMXH7X',
    createdAt: '2026-10-08T06:25:00.000Z',
    actorScope: 'platform',
    actorName: 'Quản trị nền tảng',
    actorEmail: 'admin@xeprime.vn',
    actorUserId: 'U1',
    action: 'subscription.schedule_change',
    targetType: 'tenant_subscription',
    targetId: '01M4D2ZK3K12T5AQQZEK4QWAEZ',
    targetLabel: 'Gói nâng cao',
    tenantId: 'T1',
    tenantName: 'HOANG DUC DAI HANH',
    ipAddress: '::1',
    viaSupport: false,
    userAgent: 'Mozilla/5.0',
    beforeJson: null,
    afterJson: {
      planCode: 'shop-advanced',
      planName: 'Gói nâng cao',
      price: '250000',
      listedPrice: '250000',
      priceOverridden: false,
      termMonths: 1,
      quota: { maxVehicles: 10, maxBranches: 3, maxMembers: null },
      billingMode: 'package',
      commissionPercent: null,
      startsAt: '2027-01-08T04:43:22.426Z',
      endsAt: '2027-02-08T04:43:22.426Z',
      previousTerm: {
        subscriptionId: 'S0',
        planCode: 'shop-basic',
        planName: 'Gói cơ bản',
        billingMode: 'package',
        startsAt: '2026-10-08T04:43:22.426Z',
        endsAt: '2027-01-08T04:43:22.426Z',
      },
    },
    ...over,
  } as AuditLogDetail;
}

function renderDrawer() {
  return renderWithIntl(
    <App>
      <AuditLogDetailDrawer logId="x" onClose={() => {}} />
    </App>,
  );
}

afterEach(cleanup);

describe('AuditLogDetailDrawer — sự kiện gói dịch vụ', () => {
  it('đổi gói từ kỳ sau: câu tóm tắt nói TỪ gói nào SANG gói nào, từ ngày nào', () => {
    state.data = detail();
    renderDrawer();

    expect(screen.getAllByText('Đổi gói từ kỳ sau').length).toBeGreaterThan(0);
    expect(
      screen.getByText('Đổi từ Gói cơ bản sang Gói nâng cao kể từ kỳ sau — bắt đầu 08/01/2027.'),
    ).toBeTruthy();
    expect(screen.getByText('Theo bảng giá')).toBeTruthy();
    // Hạn mức `null` = không giới hạn, không phải gạch ngang.
    expect(
      screen.getByText('tối đa 10 xe · 3 chi nhánh · không giới hạn thành viên'),
    ).toBeTruthy();
  });

  it('giá đàm phán được gắn nhãn kèm giá niêm yết', () => {
    state.data = detail({
      action: 'subscription.assign',
      afterJson: { ...(detail().afterJson as object), price: '0', priceOverridden: true },
    });
    renderDrawer();

    expect(screen.getByText('Giá đàm phán')).toBeTruthy();
    expect(screen.getByText('niêm yết 250.000 ₫', { exact: false })).toBeTruthy();
  });

  it('huỷ kỳ: nói kỳ nào, hiệu lực bao lâu, và lý do bằng nhãn', () => {
    const term = {
      subscriptionId: 'S1',
      planCode: 'shop-basic',
      planName: 'Gói cơ bản',
      billingMode: 'package',
      startsAt: '2026-10-08T04:43:22.426Z',
      endsAt: '2027-01-08T04:43:22.426Z',
    };
    state.data = detail({
      action: 'subscription.cancel',
      beforeJson: { status: 'active', term },
      afterJson: { status: 'cancelled', reason: 'replaced', term },
    });
    renderDrawer();

    expect(screen.getByText('Huỷ kỳ Gói cơ bản.')).toBeTruthy();
    expect(screen.getByText('Bị thay bởi lượt đổi gói ngay')).toBeTruthy();
  });

  it('huỷ kỳ cuối cùng: nói rõ gian hàng được chuyển về tuyến nào', () => {
    const term = {
      subscriptionId: 'S1',
      planCode: 'shop-basic',
      planName: 'Gói cơ bản',
      billingMode: 'package',
      startsAt: '2026-10-08T04:43:22.426Z',
      endsAt: '2027-01-08T04:43:22.426Z',
    };
    state.data = detail({
      action: 'subscription.cancel',
      beforeJson: { status: 'active', term },
      afterJson: {
        status: 'cancelled',
        reason: 'manual',
        term,
        fallbackTerm: {
          subscriptionId: 'S2',
          planCode: 'free',
          planName: 'Tuyến hoa hồng mặc định',
          billingMode: 'commission',
          startsAt: '2026-10-08T07:00:00.000Z',
          endsAt: '2027-10-08T07:00:00.000Z',
        },
      },
    });
    renderDrawer();

    expect(screen.getByText('Chuyển về')).toBeTruthy();
    expect(screen.getByText('Tuyến hoa hồng mặc định', { exact: false })).toBeTruthy();
    expect(screen.getByText('Quản trị viên huỷ')).toBeTruthy();
  });

  it('đổi gói ngay: tóm tắt đếm số kỳ còn hạn đã kết thúc', () => {
    state.data = detail({
      action: 'subscription.change_now',
      afterJson: {
        ...(detail().afterJson as Record<string, unknown>),
        previousTerm: undefined,
        startsAt: '2026-10-08T06:25:00.000Z',
        replacedTerms: [
          {
            subscriptionId: 'S0',
            planName: 'Gói cơ bản',
            startsAt: '2026-10-08T04:43:22.426Z',
            endsAt: '2027-01-08T04:43:22.426Z',
          },
        ],
      },
    });
    renderDrawer();

    expect(
      screen.getByText('Đổi sang Gói nâng cao ngay (08/10/2026); 1 kỳ còn hạn đã kết thúc.'),
    ).toBeTruthy();
  });

  it('mã hành động chỉ nằm ở khối kỹ thuật (đang gập), không ở phần đọc chính', () => {
    state.data = detail();
    renderDrawer();

    expect(screen.getByText('Thông tin kỹ thuật')).toBeTruthy();
    expect(screen.queryByText('subscription.schedule_change')).toBeNull();
  });
});

describe('AuditLogDetailDrawer — sự kiện chung', () => {
  it('lượt sửa: bảng Trước · Sau chỉ hiện trường đổi', () => {
    state.data = detail({
      action: 'tenant.lock',
      targetType: 'tenant',
      targetLabel: 'HOANG DUC DAI HANH',
      beforeJson: { status: 'active' },
      afterJson: { status: 'suspended', reason: 'Vi phạm chính sách' },
    });
    renderDrawer();

    expect(screen.getByText('Khoá gian hàng', { exact: false })).toBeTruthy();
    expect(screen.getByText('Đang hoạt động')).toBeTruthy();
    expect(screen.getByText('Bị khóa')).toBeTruthy();
    expect(screen.getByText('Vi phạm chính sách')).toBeTruthy();
  });

  it('không có dữ liệu chi tiết thì nói rõ', () => {
    state.data = detail({
      action: 'customer.contact_reveal',
      targetType: 'tenant_customer',
      targetLabel: null,
      beforeJson: null,
      afterJson: null,
    });
    renderDrawer();

    expect(screen.getByText('Sự kiện này không ghi lại dữ liệu chi tiết.')).toBeTruthy();
  });
});
