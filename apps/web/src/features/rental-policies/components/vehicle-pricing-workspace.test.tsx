import { App } from 'antd';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { POLICY_SOURCE } from '@xeprime/types';
import type { RentalPolicyValues, VehiclePricing } from '../types';

import { VehiclePricingWorkspace } from './VehiclePricingWorkspace';

/**
 * Đặc tả workspace Giá & chính sách theo xe (Wave 2 — Figma `236:3495`, states `237:1911`).
 *
 * Khoá bốn hợp đồng: (A) kế thừa = read-only + link về chính sách gian hàng; (B) ghi đè = form
 * sửa được, lưu gửi `source='vehicle'` kèm policy; (reset) đặt lại có xác nhận và gửi
 * `source='shop'`; (D) xe công khai đổi giá → hộp xác nhận nói ĐÚNG hệ quả knockback ADR 0008
 * (về chờ duyệt + tạm ẩn), không hứa "áp dụng ngay".
 */
function shopPolicy(over: Partial<RentalPolicyValues> = {}): RentalPolicyValues {
  return {
    depositAmount: '5000000',
    deliveryEnabled: true,
    deliveryMaxRadiusKm: 10,
    deliveryTiers: [
      { toKm: 3, fee: '0' },
      { toKm: 10, fee: '50000' },
    ],
    overtimeFeePerHour: '100000',
    overtimeGraceMinutes: null,
    overtimeRoundingMinutes: null,
    discountEnabled: true,
    discountTiers: [{ minDays: 7, percent: 15 }],
    updatedAt: '2026-08-01T00:00:00.000Z',
    ...over,
  };
}

function pricingFixture(over: Partial<VehiclePricing> = {}): VehiclePricing {
  return {
    source: POLICY_SOURCE.SHOP,
    policy: shopPolicy(),
    shopPolicy: shopPolicy(),
    weekdayPrice: '800000',
    weekendPrice: null,
    hourlyPrice: null,
    discountPercent: null,
    monthlyPrice: null,
    withDriverDailyPrice: null,
    withDriverInterCityPrice: null,
    withDriverOneWayPrice: null,
    serviceTypes: ['self_drive'],
    isPublic: false,
    ...over,
  };
}

const onSave = vi.fn();

function renderWorkspace(pricing: VehiclePricing, canEdit = true) {
  return render(
    <App>
      <VehiclePricingWorkspace
        vehicleName="Toyota Vios 2024"
        vehiclePlate="51A-123.45"
        pricing={pricing}
        canEdit={canEdit}
        submitting={false}
        onSave={onSave}
      />
    </App>,
  );
}

beforeEach(() => onSave.mockReset());
afterEach(cleanup);

describe('State A — kế thừa gian hàng (read-only)', () => {
  it('bảng thông số kế thừa + huy hiệu + link về chính sách gian hàng; KHÔNG có form sửa', () => {
    renderWorkspace(pricingFixture());

    expect(screen.getByText('Đang kế thừa')).toBeTruthy();
    expect(screen.getByText('800.000 ₫/ngày')).toBeTruthy();
    expect(screen.getByText('5.000.000 ₫')).toBeTruthy();
    expect(screen.getByText('Bật (2 khoảng cách)')).toBeTruthy();
    expect(screen.getByText('100.000 ₫/giờ')).toBeTruthy();
    expect(screen.getByText('Mức giảm tối đa 15%')).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Xem chính sách gian hàng →' })).toBeTruthy();
    expect(screen.queryByLabelText('Giá ngày thường')).toBeNull();
  });

  it('gian hàng CHƯA có chính sách: nói thẳng, không bịa số', () => {
    renderWorkspace(pricingFixture({ source: null, policy: null, shopPolicy: null }));
    expect(screen.getByText('Gian hàng chưa cấu hình chính sách thuê')).toBeTruthy();
    // Giá là dữ liệu của xe nên vẫn phải thấy/sửa được dù policy gian hàng chưa có.
    expect(screen.getByText('800.000 ₫/ngày')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Chỉnh sửa giá & khuyến mãi' })).toBeTruthy();
  });
});

describe('State B — chuyển sang ghi đè và lưu', () => {
  it('bấm chỉnh sửa → form hiện, prefill từ chính sách gian hàng + giá xe', async () => {
    renderWorkspace(pricingFixture());
    fireEvent.click(screen.getByRole('button', { name: 'Chỉnh sửa giá & khuyến mãi' }));

    const price = (await screen.findByLabelText('Giá ngày thường')) as HTMLInputElement;
    expect(price.value).toBe('800.000');
    expect((screen.getByLabelText('Số tiền cọc mặc định') as HTMLInputElement).value).toBe(
      '5.000.000',
    );
    expect(screen.getByText('● Tùy chỉnh riêng cho xe này')).toBeTruthy();
  });

  it('lưu (xe KHÔNG công khai): xác nhận thường rồi gửi source=vehicle + policy + giá chuỗi', async () => {
    renderWorkspace(pricingFixture());
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(await screen.findByLabelText('Giá ngày thường'), {
      target: { value: '950000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    // AntD render modal kèm bản sao motion → luôn dùng findAll/getAll; nút modal là nút CUỐI.
    expect((await screen.findAllByText('Lưu chính sách riêng cho xe này?')).length).toBeGreaterThan(
      0,
    );
    const buttons = screen.getAllByRole('button', { name: 'Lưu thay đổi' });
    fireEvent.click(buttons[buttons.length - 1]!);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const body = onSave.mock.calls[0]![0] as {
      source: string;
      weekdayPrice: string;
      policy: { depositAmount: string };
    };
    expect(body.source).toBe(POLICY_SOURCE.VEHICLE);
    expect(body.weekdayPrice).toBe('950000');
    expect(body.policy.depositAmount).toBe('5000000');
  });
});

describe('Giá đa dịch vụ (17/08)', () => {
  it('xe đăng cả 3 dịch vụ: hiện đủ 3 khối giá; lưu gửi kèm giá tháng + bảng giá tài xế', async () => {
    renderWorkspace(
      pricingFixture({
        serviceTypes: ['self_drive', 'with_driver', 'long_term'],
        monthlyPrice: '12000000',
        withDriverDailyPrice: '1300000',
      }),
    );
    fireEvent.click(screen.getByRole('switch'));

    expect(await screen.findByLabelText('Giá ngày thường')).toBeTruthy();
    const monthly = screen.getByLabelText('Giá tháng tham chiếu') as HTMLInputElement;
    expect(monthly.value).toBe('12.000.000');
    expect(screen.getByLabelText('Nội thành (giá cơ bản)')).toBeTruthy();
    fireEvent.change(screen.getByLabelText('Liên tỉnh — khứ hồi (tuỳ chọn)'), {
      target: { value: '1600000' },
    });

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    // Chờ modal xác nhận mở rồi mới bấm nút CUỐI (AntD render kèm bản sao motion).
    expect((await screen.findAllByText('Lưu chính sách riêng cho xe này?')).length).toBeGreaterThan(
      0,
    );
    const buttons = screen.getAllByRole('button', { name: 'Lưu thay đổi' });
    fireEvent.click(buttons[buttons.length - 1]!);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    const body = onSave.mock.calls[0]![0] as Record<string, unknown>;
    expect(body.monthlyPrice).toBe('12000000');
    expect(body.withDriverDailyPrice).toBe('1300000');
    expect(body.withDriverInterCityPrice).toBe('1600000');
  });

  it('xe CHỈ tự lái: không hiện khối giá dài hạn/có tài xế', async () => {
    renderWorkspace(pricingFixture());
    fireEvent.click(screen.getByRole('switch'));
    await screen.findByLabelText('Giá ngày thường');
    expect(screen.queryByLabelText('Giá tháng tham chiếu')).toBeNull();
    expect(screen.queryByLabelText('Nội thành (giá cơ bản)')).toBeNull();
  });
});

describe('Khuyến mãi trực tiếp + xem trước giá trên sàn', () => {
  it('hiện rõ giá gốc, % giảm, giá khách thấy và số tiền tiết kiệm', async () => {
    renderWorkspace(
      pricingFixture({
        weekdayPrice: '600000',
        weekendPrice: '550000',
        discountPercent: 15,
      }),
    );
    fireEvent.click(screen.getByRole('switch'));

    expect(((await screen.findByLabelText('Mức giảm trực tiếp')) as HTMLInputElement).value).toBe(
      '15',
    );
    const preview = screen.getByLabelText('Xem trước giá trên sàn');
    expect(preview.textContent).toContain('600.000 ₫');
    expect(preview.textContent).toContain('-15%');
    expect(preview.textContent).toContain('510.000 ₫');
    expect(preview.textContent).toContain('90.000 ₫');
    expect(preview.textContent).toContain('467.500 ₫/ngày');
  });

  it('tắt khuyến mãi rồi lưu gửi discountPercent=null', async () => {
    renderWorkspace(pricingFixture({ discountPercent: 15 }));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.click(await screen.findByRole('switch', { name: 'Bật khuyến mãi trực tiếp' }));
    expect(screen.queryByLabelText('Mức giảm trực tiếp')).toBeNull();

    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));
    expect((await screen.findAllByText('Lưu chính sách riêng cho xe này?')).length).toBeGreaterThan(
      0,
    );
    const buttons = screen.getAllByRole('button', { name: 'Lưu thay đổi' });
    fireEvent.click(buttons[buttons.length - 1]!);

    await waitFor(() => expect(onSave).toHaveBeenCalled());
    expect(onSave.mock.calls[0]![0]).toMatchObject({ discountPercent: null });
  });
});

describe('State D — thay đổi nhạy cảm trên xe công khai', () => {
  it('đổi giá xe đang công khai: hộp xác nhận nói đúng hệ quả knockback (ADR 0008)', async () => {
    renderWorkspace(pricingFixture({ isPublic: true }));
    fireEvent.click(screen.getByRole('switch'));
    fireEvent.change(await screen.findByLabelText('Giá ngày thường'), {
      target: { value: '950000' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Lưu thay đổi' }));

    expect(
      (await screen.findAllByText('Xác nhận thay đổi chính sách & giá thuê?')).length,
    ).toBeGreaterThan(0);
    expect(screen.getAllByText(/chờ duyệt lại và tạm ẩn khỏi sàn/).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/vẫn giữ nguyên mốc giá cũ/).length).toBeGreaterThan(0);
  });
});

describe('Đặt lại theo gian hàng', () => {
  it('xe đang ghi đè: nút đặt lại → xác nhận → gửi source=shop (xoá override)', async () => {
    renderWorkspace(
      pricingFixture({
        source: POLICY_SOURCE.VEHICLE,
        policy: shopPolicy({ depositAmount: '3000000' }),
      }),
    );

    fireEvent.click(screen.getByRole('button', { name: 'Đặt lại theo gian hàng' }));
    expect((await screen.findAllByText('Đặt lại về mặc định?')).length).toBeGreaterThan(0);
    expect(screen.getAllByText(/tùy chỉnh riêng của xe này sẽ bị xóa/).length).toBeGreaterThan(0);

    const okButtons = screen.getAllByRole('button', { name: 'Đặt lại' });
    fireEvent.click(okButtons[okButtons.length - 1]!);
    await waitFor(() => expect(onSave).toHaveBeenCalledWith({ source: POLICY_SOURCE.SHOP }));
  });

  it('thiếu quyền sửa: switch nguồn bị khoá', () => {
    renderWorkspace(pricingFixture(), false);
    expect((screen.getByRole('switch') as HTMLButtonElement).disabled).toBe(true);
  });
});
