import { App } from 'antd';
import { cleanup, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FEE_POLICY_STATUS } from '@xeprime/types';

import { renderWithIntl } from '@/i18n/test-utils';
import { feePolicyFixture } from '../test-fixtures';
import type { FeePolicy } from '../types';

import { FeePolicyFormModal, type FeePolicySaveResult } from './FeePolicyFormModal';

/**
 * Form chính sách phí — luồng tiền v2. Khoá các hành vi ở mức màn hình:
 *  - bản nháp mới mở ra với bộ số `FEE_SCHEDULE_DEFAULTS` (phí sàn, nấc hoa hồng, ví dụ `H`);
 *  - bật một loại bảo hiểm thì hiện ô phí ngày cho từng loại xe, và chưa có đối tác thì KHÔNG gửi —
 *    lỗi ở tab khuất thì form tự nhảy tới tab đó;
 *  - payload gửi đi là bộ số v2, tiền dạng chuỗi;
 *  - "Lưu và áp dụng" hỏi lại, lưu nháp rồi kích hoạt; "Sửa chính sách" giữ nguyên tên.
 */

const created = { id: 'NEW', version: 10 } as FeePolicy;
const create = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const update = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));
const activate = vi.hoisted(() => ({ mutateAsync: vi.fn(), isPending: false }));

vi.mock('../hooks/use-fee-policies', () => ({
  useCreateFeePolicyDraft: () => create,
  useUpdateFeePolicyDraft: () => update,
  useActivateFeePolicy: () => activate,
}));

vi.mock('@/hooks/use-media-query', () => ({
  useIsMobile: () => false,
  useIsTablet: () => false,
  useIsDesktop: () => true,
  useMediaQuery: () => false,
}));

function renderModal(props: Partial<Parameters<typeof FeePolicyFormModal>[0]> = {}) {
  return renderWithIntl(
    <App>
      <FeePolicyFormModal open policy={null} onClose={vi.fn()} {...props} />
    </App>,
  );
}

function selectedTab(): string {
  return screen.getByRole('tab', { selected: true }).textContent ?? '';
}

beforeEach(() => {
  create.mutateAsync.mockReset().mockResolvedValue(created);
  update.mutateAsync.mockReset().mockResolvedValue(created);
  activate.mutateAsync.mockReset().mockResolvedValue({ ...created, status: 'active' });
});

afterEach(cleanup);

describe('FeePolicyFormModal - tạo bản nháp', () => {
  it('mở với bộ số luồng tiền v2 và ví dụ hoa hồng', () => {
    renderModal();

    expect(selectedTab()).toBe('Phí & hoa hồng');
    expect((screen.getByLabelText('Phí sàn - Ô tô') as HTMLInputElement).value).toBe('50.000');
    expect((screen.getByLabelText('Phí sàn - Xe máy') as HTMLInputElement).value).toBe('30.000');
    expect(
      (screen.getByLabelText('Phần giữ chỗ của chủ xe (% tiền thuê)') as HTMLInputElement).value,
    ).toBe('15');
    expect((screen.getByLabelText('Nấc 2: từ ngày') as HTMLInputElement).value).toBe('3');
    // % hoa hồng hiện gọn: "10", không "10.0".
    expect((screen.getByLabelText('Nấc 1: % giá thuê') as HTMLInputElement).value).toBe('10');
    // 2 ngày × 10% + 3 ngày × 7% của 1.000.000đ.
    expect(screen.getByText(/H = 410\.000/)).toBeTruthy();
    // Không còn ô % phí dịch vụ của mô hình cũ.
    expect(screen.queryByLabelText(/% phí dịch vụ/)).toBeNull();
  });

  it('không còn tab Bảo hiểm - bảo hiểm quản lý ở Admin › Bảo hiểm (ADR 0098)', () => {
    renderModal();
    expect(screen.queryByRole('tab', { name: 'Bảo hiểm' })).toBeNull();
  });

  it('phí sàn từng loại xe: chọn "Mỗi ngày" thì ví dụ nhân số ngày và payload mang cách tính', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Tên chính sách'), { target: { value: 'Theo ngày' } });
    expect(screen.getByText('Chuyến 3 ngày: khách trả 50.000 ₫ phí sàn')).toBeTruthy();

    const car = screen.getByRole('radiogroup', { name: 'Cách tính phí sàn - Ô tô' });
    fireEvent.click(within(car).getByRole('radio', { name: 'Mỗi ngày' }));
    expect(await screen.findByText('Chuyến 3 ngày: khách trả 150.000 ₫ phí sàn')).toBeTruthy();
    // Xe máy vẫn theo chuyến.
    expect(screen.getByText('Chuyến 3 ngày: khách trả 30.000 ₫ phí sàn')).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    expect(create.mutateAsync.mock.calls[0]![0]).toMatchObject({
      customerPlatformFeeBasis: { car: 'per_day', motorbike: 'per_trip' },
    });
  });

  it('lỗi ở tab đang khuất: không gửi, form nhảy tới tab đó và nhãn tab mang số lỗi', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Tên chính sách'), { target: { value: 'v2' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Thuế' }));
    fireEvent.click(
      screen.getByRole('switch', { name: /^Bật khấu trừ, nộp thay thuế cho chủ xe/ }),
    );
    fireEvent.change(screen.getByLabelText('Căn cứ pháp lý'), { target: { value: '' } });

    // Quay về tab đầu rồi lưu: lỗi nằm ở tab khuất, form phải tự kéo người dùng tới đó.
    fireEvent.click(screen.getByRole('tab', { name: 'Phí & hoa hồng' }));
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(selectedTab()).toContain('Thuế'));
    expect(create.mutateAsync).not.toHaveBeenCalled();
    expect(within(screen.getByRole('tab', { selected: true })).getByText('1')).toBeTruthy();
  });

  it('gửi bộ số v2, tiền dạng chuỗi, không kèm % đời cũ', async () => {
    const onSaved = vi.fn<(r: FeePolicySaveResult) => void>();
    renderModal({ onSaved });
    fireEvent.change(screen.getByLabelText('Tên chính sách'), {
      target: { value: '  Luồng tiền v2  ' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));

    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    const body = create.mutateAsync.mock.calls[0]![0];
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
    // Chỉ lưu nháp — không kích hoạt.
    expect(activate.mutateAsync).not.toHaveBeenCalled();
    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ policy: created, applied: false }));
  });

  it('bật thuế: bảng ba loại dịch vụ × GTGT/TNCN có cột Cộng, căn cứ pháp lý, phạm vi áp dụng', async () => {
    renderModal();
    fireEvent.change(screen.getByLabelText('Tên chính sách'), { target: { value: 'Thuế NĐ 117' } });
    fireEvent.click(screen.getByRole('tab', { name: 'Thuế' }));
    fireEvent.click(
      screen.getByRole('switch', { name: /^Bật khấu trừ, nộp thay thuế cho chủ xe/ }),
    );

    expect((screen.getByLabelText('Căn cứ pháp lý') as HTMLInputElement).value).toBe(
      'NĐ 117/2025/NĐ-CP · NĐ 68/2026/NĐ-CP',
    );
    // Số % hiện gọn, dấu thập phân tiếng Việt: "5", "1,5" — không "5.00", "1.50".
    expect((screen.getByLabelText('Tự lái: thuế GTGT (%)') as HTMLInputElement).value).toBe('5');
    expect((screen.getByLabelText('Có tài xế: thuế TNCN (%)') as HTMLInputElement).value).toBe(
      '1,5',
    );
    // Cột Cộng: 7% · 7% · 4,5%.
    expect(screen.getAllByText('7%')).toHaveLength(2);
    expect(screen.getByText('4,5%')).toBeTruthy();
    expect(
      screen.getByText('Áp dụng cho: cá nhân, hộ kinh doanh · Doanh nghiệp: không khấu trừ'),
    ).toBeTruthy();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu nháp' }));
    await waitFor(() => expect(create.mutateAsync).toHaveBeenCalledTimes(1));
    expect(create.mutateAsync.mock.calls[0]![0]).toMatchObject({
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

describe('FeePolicyFormModal - lưu và áp dụng', () => {
  it('hỏi lại, rồi lưu nháp và kích hoạt chính bản vừa lưu', async () => {
    const onSaved = vi.fn<(r: FeePolicySaveResult) => void>();
    renderModal({ onSaved });
    fireEvent.change(screen.getByLabelText('Tên chính sách'), { target: { value: 'v10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu và áp dụng' }));
    expect((await screen.findAllByText('Áp dụng chính sách phí mới?')).length).toBeGreaterThan(0);
    expect(create.mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole('button', { name: 'Áp dụng' }));
    await waitFor(() => expect(activate.mutateAsync).toHaveBeenCalledWith('NEW'));
    expect(create.mutateAsync).toHaveBeenCalledTimes(1);
    await waitFor(() =>
      expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ applied: true })),
    );
  });

  it('kích hoạt hỏng: bản nháp vẫn được giữ, báo là chưa áp dụng', async () => {
    activate.mutateAsync.mockRejectedValue(new Error('blocked'));
    const onSaved = vi.fn<(r: FeePolicySaveResult) => void>();
    renderModal({ onSaved });
    fireEvent.change(screen.getByLabelText('Tên chính sách'), { target: { value: 'v10' } });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu và áp dụng' }));
    fireEvent.click(await screen.findByRole('button', { name: 'Áp dụng' }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith({ policy: created, applied: false }));
    expect(await screen.findByText(/Đã lưu bản nháp nhưng chưa áp dụng được/)).toBeTruthy();
  });
});

describe('FeePolicyFormModal - sửa bản đang áp dụng', () => {
  const ACTIVE = feePolicyFixture({ id: 'V9', version: 9, name: 'Chính sách hiện hành' });

  it('giữ nguyên tên, tiêu đề nói rõ đang sửa từ phiên bản nào, mở đúng tab được yêu cầu', () => {
    renderModal({ duplicateFrom: ACTIVE, keepName: true, initialTab: 'tax' });

    expect(screen.getByText('Sửa chính sách phí (đang áp dụng: phiên bản 9)')).toBeTruthy();
    expect((screen.getByLabelText('Tên chính sách') as HTMLInputElement).value).toBe(
      'Chính sách hiện hành',
    );
    expect(selectedTab()).toBe('Thuế');
  });

  it('dùng lại một bản cũ thì thêm "(bản sao)" vào tên', () => {
    renderModal({ duplicateFrom: { ...ACTIVE, status: FEE_POLICY_STATUS.ARCHIVED } });
    expect((screen.getByLabelText('Tên chính sách') as HTMLInputElement).value).toBe(
      'Chính sách hiện hành (bản sao)',
    );
  });
});
