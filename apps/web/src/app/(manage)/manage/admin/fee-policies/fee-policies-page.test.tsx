import { App } from 'antd';
import { cleanup, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEE_POLICY_STATUS } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import type { FeePolicy } from '@/features/fee-policies/types';

import AdminFeePoliciesPage from './page';

/**
 * Quản trị chính sách phí — ADR 0028 điều 2–5.
 *
 * Hai luật của ADR được khoá ở đây vì chúng là thứ dễ bị "sửa cho tiện" nhất:
 *
 *  1. **Bản đã hiệu lực là BẤT BIẾN.** Sửa một bản `active` là sửa số của những đơn đã tạo theo
 *     nó — nên hàng đó không có nút sửa, không chỉ là API từ chối.
 *  2. **Có blocker thì KHÔNG kích hoạt được.** Blocker là "thuế chưa có tên loại", "bảo hiểm chưa
 *     có đối tác thật" — bật cổng trước khi có căn cứ là đúng thứ ADR 0028 điều 4–5 cấm.
 */

const query = vi.hoisted(() => ({
  data: undefined as FeePolicy[] | undefined,
  isError: false,
  isFetching: false,
  refetch: vi.fn(),
}));

const activate = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));
const discard = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false, variables: undefined }));

vi.mock('@/features/fee-policies/hooks/use-fee-policies', () => ({
  useFeePolicies: () => query,
  useActivateFeePolicy: () => activate,
  useDiscardFeePolicyDraft: () => discard,
  useCreateFeePolicyDraft: () => ({ mutate: vi.fn(), isPending: false }),
  useUpdateFeePolicyDraft: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function policy(over: Partial<FeePolicy> = {}): FeePolicy {
  return {
    id: '01POLICY',
    version: 1,
    status: FEE_POLICY_STATUS.ACTIVE,
    name: 'Pilot — phí dịch vụ 10%',
    note: null,
    serviceFeePercent: 10,
    holdMinAmount: '20000',
    holdPaymentWindowMinutes: 1440,
    freeCancelHours: 4,
    taxEnabled: false,
    taxPercent: null,
    taxLabel: null,
    tripInsuranceEnabled: false,
    tripInsurancePercent: null,
    vehicleProtectionEnabled: false,
    vehicleProtectionPercent: null,
    insurancePartnerName: null,
    effectiveFrom: '2026-09-01T00:00:00.000Z',
    effectiveTo: null,
    activatedByName: 'Admin',
    activatedAt: '2026-09-01T00:00:00.000Z',
    createdByName: 'Admin',
    createdAt: '2026-08-30T00:00:00.000Z',
    updatedAt: '2026-09-01T00:00:00.000Z',
    activationBlockers: [],
    ...over,
  } as FeePolicy;
}

function renderPage() {
  return renderWithIntl(
    <App>
      <AdminFeePoliciesPage />
    </App>,
  );
}

function rowOf(text: string): HTMLElement {
  return screen.getByText(text).closest('tr') as HTMLElement;
}

beforeEach(() => {
  query.data = [policy()];
  query.isError = false;
  query.isFetching = false;
  query.refetch.mockReset();
  activate.mutate.mockReset();
  discard.mutate.mockReset();
});

afterEach(cleanup);

describe('/manage/admin/fee-policies — bản đang hiệu lực', () => {
  it('hiện % phí dịch vụ và sàn giữ chỗ đã định dạng', () => {
    renderPage();

    expect(screen.getByText('10%')).toBeTruthy();
    expect(screen.getByText('20.000 ₫')).toBeTruthy();
  });

  it('KHÔNG có lối sửa — bản đã hiệu lực là bất biến', () => {
    renderPage();

    const row = rowOf('Pilot — phí dịch vụ 10%');
    expect(within(row).queryByRole('button', { name: 'Sửa' })).toBeNull();
    expect(within(row).queryByRole('button', { name: 'Kích hoạt' })).toBeNull();
  });
});

describe('/manage/admin/fee-policies — bản nháp', () => {
  it('không có blocker: kích hoạt được', () => {
    query.data = [policy({ id: '02', status: FEE_POLICY_STATUS.DRAFT, name: 'Nháp v2', version: 2 })];
    renderPage();

    const row = rowOf('Nháp v2');
    expect(within(row).getByRole('button', { name: 'Kích hoạt' }).hasAttribute('disabled')).toBe(
      false,
    );
  });

  it('còn blocker: nút kích hoạt bị khoá', () => {
    query.data = [
      policy({
        id: '02',
        status: FEE_POLICY_STATUS.DRAFT,
        name: 'Nháp bảo hiểm',
        version: 2,
        tripInsuranceEnabled: true,
        tripInsurancePercent: 2,
        activationBlockers: ['insurance_requires_partner'],
      }),
    ];
    renderPage();

    const row = rowOf('Nháp bảo hiểm');
    expect(within(row).getByRole('button', { name: 'Kích hoạt' }).hasAttribute('disabled')).toBe(
      true,
    );
  });
});
