import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { renderWithIntl } from '@/i18n/test-utils';

import { FeePolicyFormModal } from './FeePolicyFormModal';

/**
 * Form chính sách phí — luồng tiền v2. Khoá ba hành vi ở mức màn hình:
 *  - bản nháp mới mở ra với bộ số `FEE_SCHEDULE_DEFAULTS` (phí sàn, nấc hoa hồng, ví dụ `H`);
 *  - bật một loại bảo hiểm thì hiện ô phí ngày cho từng loại xe, và chưa có đối tác thì KHÔNG gửi;
 *  - payload gửi đi là bộ số v2, tiền dạng chuỗi.
 */

const create = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));
const update = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock('../hooks/use-fee-policies', () => ({
  useCreateFeePolicyDraft: () => create,
  useUpdateFeePolicyDraft: () => update,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function renderModal() {
  return renderWithIntl(
    <App>
      <FeePolicyFormModal open policy={null} onClose={vi.fn()} />
    </App>,
  );
}

beforeEach(() => {
  create.mutate.mockReset();
  update.mutate.mockReset();
});

afterEach(cleanup);

describe('FeePolicyFormModal — tạo bản nháp', () => {
  it('mở với bộ số luồng tiền v2 và ví dụ hoa hồng', () => {
    renderModal();

    expect((screen.getByLabelText('Phí sàn — Ô tô') as HTMLInputElement).value).toBe('50.000');
    expect((screen.getByLabelText('Phí sàn — Xe máy') as HTMLInputElement).value).toBe('30.000');
    expect(
      (
        screen.getByLabelText(
          'Phần giữ chỗ của chủ xe (% trên tiền thuê, không gồm phí giao xe)',
        ) as HTMLInputElement
      ).value,
    ).toBe('15');
    expect((screen.getByLabelText('Nấc 2: từ ngày') as HTMLInputElement).value).toBe('3');
    // 2 ngày × 10% + 3 ngày × 7% của 1.000.000đ.
    expect(screen.getByText(/H = 410\.000/)).toBeTruthy();
    // Không còn ô % phí dịch vụ của mô hình cũ.
    expect(screen.queryByLabelText(/% phí dịch vụ/)).toBeNull();
  });

  it('bật bảo hiểm vật chất xe: hiện phí ngày theo loại xe, thiếu đối tác thì không gửi', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'v2' } });

    fireEvent.click(screen.getByRole('switch', { name: /^Bảo hiểm vật chất xe \(IV\)/ }));
    expect((screen.getByLabelText('Phí mỗi ngày — Ô tô') as HTMLInputElement).value).toBe('50.000');
    expect((screen.getByLabelText('Phí mỗi ngày — Xe máy') as HTMLInputElement).value).toBe(
      '15.000',
    );

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    expect(await screen.findByText('Nhập tên đối tác bảo hiểm')).toBeTruthy();
    expect(create.mutate).not.toHaveBeenCalled();
  });

  it('gửi bộ số v2, tiền dạng chuỗi, không kèm % đời cũ', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: '  Luồng tiền v2  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));

    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    const body = create.mutate.mock.calls[0]![0];
    expect(body).toMatchObject({
      name: 'Luồng tiền v2',
      depositPercent: 15,
      depositMinAmount: '0',
      customerPlatformFee: { car: '50000', motorbike: '30000' },
      ownerCommissionTiers: [
        { fromDay: 1, percent: 10 },
        { fromDay: 3, percent: 7 },
        { fromDay: 8, percent: 3 },
        { fromDay: 31, percent: 0 },
      ],
      vehicleProtectionEnabled: false,
      tripInsuranceEnabled: false,
      insurancePartnerName: null,
    });
    expect(body).not.toHaveProperty('serviceFeePercent');
    // Thuế tắt mặc định ⇒ không gửi bảng mức / căn cứ.
    expect(body).toMatchObject({ taxEnabled: false, taxRates: null, taxLegalBasis: null });
  });

  it('bật thuế: bảng ba loại dịch vụ × GTGT/TNCN có cột Cộng, căn cứ pháp lý, phạm vi áp dụng', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Tên'), { target: { value: 'Thuế NĐ 117' } });
    fireEvent.click(screen.getByRole('switch', { name: /^Bật khấu trừ, nộp thay thuế cho chủ xe/ }));

    expect((screen.getByLabelText('Căn cứ pháp lý') as HTMLInputElement).value).toBe(
      'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
    );
    expect((screen.getByLabelText('Tự lái: thuế GTGT (%)') as HTMLInputElement).value).toBe('5.00');
    expect((screen.getByLabelText('Có tài xế: thuế TNCN (%)') as HTMLInputElement).value).toBe('1.50');
    // Cột Cộng: 7% · 7% · 4,5%.
    expect(screen.getAllByText('7%')).toHaveLength(2);
    expect(screen.getByText('4,5%')).toBeTruthy();
    expect(
      screen.getByText('Áp dụng cho: cá nhân, hộ kinh doanh · Doanh nghiệp: không khấu trừ'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu' }));
    await waitFor(() => expect(create.mutate).toHaveBeenCalledTimes(1));
    expect(create.mutate.mock.calls[0]![0]).toMatchObject({
      taxEnabled: true,
      taxLegalBasis: 'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
      taxRates: {
        self_drive: { vatPercent: 5, pitPercent: 2 },
        long_term: { vatPercent: 5, pitPercent: 2 },
        with_driver: { vatPercent: 3, pitPercent: 1.5 },
      },
    });
  });
});
