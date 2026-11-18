import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  INSURANCE_POLICY_STATUS,
  INSURANCE_PRODUCT_KIND,
  INSURANCE_VOID_BRANCH,
  INSURANCE_VOID_REFUND_TIMING,
  type InsurancePolicyStatus,
} from '@xeprime/types';
import { renderWithIntl } from '@/i18n/test-utils';
import type { InsurancePolicyDetail, InsuranceVoidPlan } from '../types';
import { InsuranceCertificateDrawer } from './InsuranceCertificateDrawer';

/**
 * Hai quyết định ở chân panel hợp đồng (ADR 0032 điều 4 · ADR 0064):
 *  - THỬ LẠI chỉ cho hợp đồng LỖI;
 *  - THU HỒI cho hợp đồng lỗi hoặc ĐÃ CẤP;
 *  - mọi trạng thái khác không có nút nào (chỉ câu "không có thao tác").
 *
 * Thu hồi hai nhánh theo `voidPlan` của server (ADR 0093): huỷ + hoàn, hoặc thu hồi giữ nghĩa vụ trả hãng.
 */
const state = vi.hoisted(() => ({
  pricing: { serviceFeeAmount: '0', refundedAt: null as string | null },
  detail: { data: undefined as unknown, isLoading: false, isError: false, refetch: vi.fn() },
  retry: { mutate: vi.fn(), isPending: false },
  voidPolicy: { mutate: vi.fn(), isPending: false },
}));

vi.mock('../hooks', () => ({
  useCertificateDetail: () => state.detail,
  useRetryCertificate: () => state.retry,
  useVoidCertificate: () => state.voidPolicy,
  // Phí thực tế của hợp đồng (ADR 0091) — đã thu 224.400, MIC tính 230.000 ⇒ XePrime bù 5.600.
  useCertificatePricing: () => ({
    isLoading: false,
    isError: false,
    data: {
      premiumAmount: '224400',
      partnerPremiumAmount: '230000',
      differenceAmount: '-5600',
      insuredValue: '340000000',
      tierMaxDays: 10,
      tierPercent: '0.066',
      ...state.pricing,
    },
  }),
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useMediaQuery: () => false,
}));

/** Kế hoạch thu hồi server trả cho hợp đồng lỗi (chưa từng có hiệu lực, hold đã chốt). */
const CANCEL_NOW: InsuranceVoidPlan = {
  branch: INSURANCE_VOID_BRANCH.CANCEL_REFUND,
  partnerReferenceRequired: false,
  refundTiming: INSURANCE_VOID_REFUND_TIMING.NOW,
  refundAmount: '172440',
  blockedByRemittance: false,
};
/** Hợp đồng đã cấp, đã có hiệu lực. */
const KEEP_PAYABLE: InsuranceVoidPlan = {
  branch: INSURANCE_VOID_BRANCH.VOID_KEEP_PAYABLE,
  partnerReferenceRequired: true,
  refundTiming: INSURANCE_VOID_REFUND_TIMING.NONE,
  refundAmount: null,
  blockedByRemittance: false,
};

function policy(
  status: InsurancePolicyStatus,
  voidPlan: InsuranceVoidPlan | null = status === INSURANCE_POLICY_STATUS.FAILED
    ? CANCEL_NOW
    : status === INSURANCE_POLICY_STATUS.ISSUED
      ? KEEP_PAYABLE
      : null,
): InsurancePolicyDetail {
  return {
    voidPlan,
    voidReason: null,
    voidPartnerReference: null,
    refundedAt: null,
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
  state.pricing.serviceFeeAmount = '0';
  state.pricing.refundedAt = null;
  state.retry.mutate.mockReset();
  state.voidPolicy.mutate.mockReset();
});

afterEach(cleanup);

describe('InsuranceCertificateDrawer - nút theo trạng thái', () => {
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

  it('phí thực tế (ADR 0091): bậc đã áp và phần XePrime bù khi MIC tính cao hơn', () => {
    state.detail.data = policy(INSURANCE_POLICY_STATUS.ISSUED);
    renderDrawer();
    expect(screen.getByRole('region', { name: 'Phí bảo hiểm' })).toBeTruthy();
    expect(screen.getByText('Tới 10 ngày - 0,066% giá trị xe')).toBeTruthy();
    expect(screen.getByText(/^XePrime bù/)).toBeTruthy();
    // Không có phí thu hộ / chưa hoàn ⇒ không có hai dòng đó.
    expect(screen.queryByText('Phí thu hộ (XePrime)')).toBeNull();
    expect(screen.queryByText('Đã hoàn vào Ví điểm')).toBeNull();
  });

  it('phí thu hộ và lượt tự hoàn (ADR 0091 điều 3, 7) hiện thành dòng riêng', () => {
    state.pricing.serviceFeeAmount = '22440';
    state.pricing.refundedAt = '2026-11-16T08:00:00.000Z';
    state.detail.data = policy(INSURANCE_POLICY_STATUS.CANCELLED);
    renderDrawer();
    expect(screen.getByText('Phí thu hộ (XePrime)')).toBeTruthy();
    expect(screen.getByText('Đã hoàn vào Ví điểm')).toBeTruthy();
    // Hoàn = phí bảo hiểm + phí thu hộ = 224.400 + 22.440.
    expect(screen.getByText(/246\.840/)).toBeTruthy();
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

describe('InsuranceCertificateDrawer - thu hồi hai nhánh (ADR 0093)', () => {
  it('chưa từng có hiệu lực: hộp "Huỷ và hoàn phí" nói số sẽ hoàn, không đòi mã đối chiếu', async () => {
    state.detail.data = policy(INSURANCE_POLICY_STATUS.FAILED);
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));
    expect(await screen.findByText('Huỷ hợp đồng và hoàn phí cho khách')).toBeTruthy();
    expect(screen.getByText(/hoàn 172\.440.*vào Ví điểm của khách ngay/)).toBeTruthy();
    expect(screen.queryByLabelText(/Mã huỷ \/ biên bản/)).toBeNull();

    fireEvent.change(screen.getByLabelText(/Lý do thu hồi/), {
      target: { value: 'MIC từ chối vĩnh viễn' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Huỷ và hoàn phí' }));
    await waitFor(() =>
      expect(state.voidPolicy.mutate).toHaveBeenCalledWith(
        { id: 'IP1', reason: 'MIC từ chối vĩnh viễn' },
        expect.anything(),
      ),
    );
  });

  it('đã có hiệu lực: nói rõ không hoàn, bắt buộc mã đối chiếu với hãng', async () => {
    state.detail.data = policy(INSURANCE_POLICY_STATUS.ISSUED);
    renderDrawer();
    fireEvent.click(screen.getByRole('button', { name: 'Thu hồi' }));
    expect(await screen.findByText('Thu hồi hợp đồng đã có hiệu lực')).toBeTruthy();
    expect(screen.getByText(/KHÔNG hoàn cho khách/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/Lý do thu hồi/), {
      target: { value: 'Xe gặp sự cố, hai bên huỷ' },
    });
    const dialogButtons = screen.getAllByRole('button', { name: 'Thu hồi' });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]!);
    expect(
      await screen.findByText('Nhập mã huỷ hoặc số biên bản đối chiếu với hãng.'),
    ).toBeTruthy();
    expect(state.voidPolicy.mutate).not.toHaveBeenCalled();

    fireEvent.change(screen.getByLabelText(/Mã huỷ \/ biên bản/), {
      target: { value: 'MIC-HUY-778' },
    });
    fireEvent.click(dialogButtons[dialogButtons.length - 1]!);
    await waitFor(() =>
      expect(state.voidPolicy.mutate).toHaveBeenCalledWith(
        { id: 'IP1', reason: 'Xe gặp sự cố, hai bên huỷ', partnerReference: 'MIC-HUY-778' },
        expect.anything(),
      ),
    );
  });

  it('đã nằm trong bảng kê trả hãng: không có nút thu hồi, chân panel nói lý do', () => {
    state.detail.data = policy(INSURANCE_POLICY_STATUS.ISSUED, {
      ...KEEP_PAYABLE,
      branch: INSURANCE_VOID_BRANCH.CANCEL_REFUND,
      blockedByRemittance: true,
    });
    renderDrawer();
    expect(screen.queryByRole('button', { name: 'Thu hồi' })).toBeNull();
    expect(screen.getByText(/đã nằm trong bảng kê trả hãng/)).toBeTruthy();
  });

  it('chi tiết hiện lý do và mã đối chiếu của lượt thu hồi', () => {
    state.detail.data = {
      ...policy(INSURANCE_POLICY_STATUS.VOIDED),
      voidReason: 'Xe gặp sự cố, hai bên huỷ',
      voidPartnerReference: 'MIC-HUY-778',
    };
    renderDrawer();
    expect(screen.getByText('Xe gặp sự cố, hai bên huỷ')).toBeTruthy();
    expect(screen.getByText('MIC-HUY-778')).toBeTruthy();
  });
});
