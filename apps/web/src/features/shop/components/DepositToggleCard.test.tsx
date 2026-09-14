import { App } from 'antd';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, DEPOSIT_POLICY_REASON } from '@xeprime/types';
import { DepositToggleCard } from './DepositToggleCard';
import type { PaymentSettings } from '../types';

/**
 * Công tắc thu cọc — Phase 6.
 *
 * Điều test này khoá là ADR 0027 điều 4: **ẩn nút chỉ là trang trí**. Ba trạng thái khoá khác
 * nhau đều phải HIỆN công tắc và nói được vì sao nó khoá; một màn hình ẩn công tắc đi sẽ lấy
 * mất chỗ duy nhất chủ gian hàng đọc được câu trả lời cho "vì sao khách của tôi phải chuyển
 * tiền trước" — rồi họ đi hỏi support.
 *
 * Điều thứ hai: câu mô tả hệ quả phải đi theo TRẠNG THÁI ĐANG ÁP DỤNG (`depositRequired`), không
 * theo vị trí công tắc đã lưu. Tuyến hoa hồng có thể có một dòng `tenant_payment_settings` nói
 * `false` và vẫn đang thu thật.
 */
function makeSettings(overrides: Partial<PaymentSettings> = {}): PaymentSettings {
  return {
    billingMode: BILLING_MODE.PACKAGE,
    depositRequired: false,
    depositCollectionEnabled: false,
    planAllows: true,
    editable: true,
    reason: DEPOSIT_POLICY_REASON.PACKAGE_DISABLED,
    ...overrides,
  };
}

function setup(settings: PaymentSettings, canEdit = true) {
  const onChange = vi.fn();
  render(
    <App>
      <DepositToggleCard
        settings={settings}
        canEdit={canEdit}
        saving={false}
        onChange={onChange}
      />
    </App>,
  );
  return { onChange, toggle: screen.getByRole('switch') };
}

describe('DepositToggleCard', () => {
  it('gói có cờ, đang tắt: bấm được và báo giá trị mới lên trên', () => {
    const { onChange, toggle } = setup(makeSettings());

    expect(toggle).toHaveProperty('disabled', false);
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    // Trạng thái đang áp dụng là KHÔNG thu ⇒ phải nói rõ gian hàng tự thoả thuận với khách.
    expect(screen.getByText(/tự thoả thuận cọc/i)).toBeTruthy();

    fireEvent.click(toggle);
    expect(onChange).toHaveBeenCalledWith(true);
  });

  it('tuyến hoa hồng: công tắc BẬT + KHOÁ, có giải thích — không ẩn (ADR 0027 điều 4)', () => {
    const { onChange, toggle } = setup(
      makeSettings({
        billingMode: BILLING_MODE.COMMISSION,
        depositRequired: true,
        depositCollectionEnabled: true,
        editable: false,
        reason: DEPOSIT_POLICY_REASON.COMMISSION_MANDATORY,
      }),
    );

    expect(toggle.getAttribute('aria-checked')).toBe('true');
    expect(toggle).toHaveProperty('disabled', true);
    expect(screen.getByText(/luôn thu cọc qua XePrime/i)).toBeTruthy();

    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('gói thiếu escrow_hold: khoá, mời nâng gói, và nói rõ họ vẫn nhận đơn bình thường', () => {
    const { toggle } = setup(
      makeSettings({
        depositCollectionEnabled: true,
        planAllows: false,
        editable: false,
        reason: DEPOSIT_POLICY_REASON.PACKAGE_FEATURE_MISSING,
      }),
    );

    expect(toggle).toHaveProperty('disabled', true);
    /*
     * Công tắc theo `depositRequired` (không thu), KHÔNG theo `depositCollectionEnabled` (giá
     * trị đã lưu vẫn là bật). Hiện "đang bật" ở đây sẽ nói với chủ gian hàng rằng khách của họ
     * đang chuyển tiền cho XePrime — điều không xảy ra.
     */
    expect(toggle.getAttribute('aria-checked')).toBe('false');
    expect(screen.getByText(/chưa có tính năng này/i)).toBeTruthy();
    expect(screen.getByRole('link', { name: /nâng cấp gói/i })).toBeTruthy();
  });

  it('thiếu quyền quản trị: thấy đủ thông tin nhưng không bấm được', () => {
    const { onChange, toggle } = setup(makeSettings(), false);

    expect(toggle).toHaveProperty('disabled', true);
    fireEvent.click(toggle);
    expect(onChange).not.toHaveBeenCalled();
  });
});
