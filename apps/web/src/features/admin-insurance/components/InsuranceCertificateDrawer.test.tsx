import { App } from 'antd';
import { cleanup, fireEvent, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  type InsurancePolicyStatus,
} from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { InsurancePolicyDetail } from '../types';
import { InsuranceCertificateDrawer } from './InsuranceCertificateDrawer';

/**
 * Hai quyết định ở chân panel hợp đồng (ADR 0032 điều 4 · ADR 0064):
 *  - THỬ LẠI chỉ cho hợp đồng LỖI;
 *  - THU HỒI cho hợp đồng lỗi hoặc ĐÃ CẤP;
 *  - mọi trạng thái khác không có nút nào (chỉ câu "không có thao tác").
 */
const state = vi.hoisted(() => ({
  detail: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  retry: { mutate: vi.fn(), isPending: false },
  voidPolicy: { mutate: vi.fn(), isPending: false },
}));

vi.mock('../hooks', () => ({
  useCertificateDetail: () => state.detail,
  useRetryCertificate: () => state.retry,
  useVoidCertificate: () => state.voidPolicy,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

function policy(status: InsurancePolicyStatus): InsurancePolicyDetail {
  return {
    id: 'IP1',
    bookingId: 'BK1',
    bookingCode: 'XP-2026-0042',
    tenantName: 'Gian hàng Minh Tuấn',
    customerName: 'Nguyễn An',
    vehicleName: 'Toyota Camry 2024',
    productKind: INSURANCE_PRODUCT_KIND.VEHICLE_TRIP,
    status,
    premiumAmount: '150000',
    partnerName: 'MIC',
    productNameVi: 'Bảo hiểm vật chất xe',
    productNameEn: 'Vehicle damage cover',
    isTest: false,
    issueAttempts: 1,
    createdAt: '2026-08-01T00:00:00.000Z',
    idempotencyKey: 'idem-1',
  } as InsurancePolicyDetail;
}

function renderDrawer() {
  return renderWithIntl(
    <App>
      <InsuranceCertificateDrawer
        id="IP1"
        previousId={null}
        nextId={null}
        onNavigate={vi.fn()}
        onClose={vi.fn()}
      />
    </App>,
  );
}

beforeEach(() => {
  state.detail.data = undefined;
  state.retry.mutate.mockReset();
  state.voidPolicy.mutate.mockReset();
});

afterEach(cleanup);

describe('InsuranceCertificateDrawer — nút theo trạng thái', () => {
  it('hợp đồng LỖI ⇒ có cả Thử phát hành lại và Thu hồi; bấm thử lại gọi đúng hợp đồng', () => {
    state.detail.data = policy(INSURANCE_POLICY_STATUS.FAILED);
    renderDrawer();
    expect(screen.getByRole('button', { name: 'Thu hồi' })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Thử phát hành lại' }));
    expect(state.retry.mutate).toHaveBeenCalledWith('IP1', expect.anything());
  });

  it('ĐÃ CẤP ⇒ chỉ Thu hồi, không thử lại', () => {
    state.detail.data = policy(INSURANCE_POLICY_STATUS.ISSUED);
    renderDrawer();
    expect(screen.getByRole('button', { name: 'Thu hồi' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Thử phát hành lại' })).toBeNull();
  });

  it.each([
    INSURANCE_POLICY_STATUS.RESERVED,
    INSURANCE_POLICY_STATUS.CANCELLED,
    INSURANCE_POLICY_STATUS.VOIDED,
  ])('trạng thái %s ⇒ không có nút quyết định nào', (status) => {
    state.detail.data = policy(status);
    renderDrawer();
    expect(screen.queryByRole('button', { name: 'Thu hồi' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thử phát hành lại' })).toBeNull();
    expect(screen.getByText('Không có thao tác nào cho trạng thái này.')).toBeTruthy();
  });

  it('tên sản phẩm theo ngôn ngữ đang hiển thị', () => {
    state.detail.data = policy(INSURANCE_POLICY_STATUS.ISSUED);
    renderWithIntl(
      <App>
        <InsuranceCertificateDrawer
          id="IP1"
          previousId={null}
          nextId={null}
          onNavigate={vi.fn()}
          onClose={vi.fn()}
        />
      </App>,
      { locale: 'en' },
    );
    expect(screen.getByText('Vehicle damage cover')).toBeTruthy();
  });
});
