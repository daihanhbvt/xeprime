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
      (screen.getByLabelText('Tỉ lệ tiền giữ chỗ (% trên tổng khách trả)') as HTMLInputElement)
        .value,
    ).toBe('30');
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
      depositPercent: 30,
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
  });
});
