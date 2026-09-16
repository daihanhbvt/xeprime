import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE } from '@xeprime/types';

import { AccountTrackBadge } from './AccountTrackBadge';

/**
 * Nhãn tuyến tài khoản — ADR 0038 điều 1 + quyết định sản phẩm 15/09/2026.
 *
 * Năm ca, và ba trong số đó là những ca mà một phép `if` ghép tại chỗ sẽ bỏ sót:
 *
 *  - `grace` vẫn là GIAN HÀNG (họ đã trả tiền; ân hạn không lấy đi gì);
 *  - `lapsed` đã là CHỦ XE CÁ NHÂN ngay, không đợi job vòng đời nối dòng hoa hồng;
 *  - `unconfigured` là LỖI CẤU HÌNH, không được in ra một con số phí dịch vụ nào;
 *  - và từ ADR 0040, `package_pending` có CÙNG `billingMode: null` với `unconfigured` nhưng phải
 *    ra một nhãn khác hẳn — đó là bước còn nợ của người dùng, không phải sự cố của nền tảng.
 *
 * Hai pha đầu không xuất hiện trong test dưới dạng tên pha, và đó là điểm: backend đã giải chúng
 * thành `billingMode` trước khi dữ liệu đi trên dây (`resolveEffectiveBilling`), nên nhãn chỉ cần
 * biết `billingMode`. Test bám vào đúng hợp đồng đó.
 */

afterEach(cleanup);

type Tenant = Parameters<typeof AccountTrackBadge>[0]['tenant'];

function tenant(overrides: Partial<NonNullable<Tenant>> = {}): Tenant {
  return {
    roleKey: TENANT_ROLE.SHOP_OWNER,
    billingMode: BILLING_MODE.COMMISSION,
    planName: 'Tuyến hoa hồng mặc định',
    serviceFeePercent: 10,
    onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
    ...overrides,
  };
}

describe('AccountTrackBadge', () => {
  it('khách thuê (không thuộc gian hàng nào) không có nhãn nào', () => {
    const { container } = render(<AccountTrackBadge tenant={null} />);
    expect(container.textContent).toBe('');
  });

  it('chủ xe tuyến hoa hồng: nhãn kèm % phí dịch vụ ĐANG THU', () => {
    render(<AccountTrackBadge tenant={tenant()} />);
    expect(screen.getByText('Chủ xe cá nhân · Hoa hồng 10%')).toBeTruthy();
  });

  it('thiếu % thì rút gọn nhãn, KHÔNG bịa 10%', () => {
    render(<AccountTrackBadge tenant={tenant({ serviceFeePercent: null })} />);
    expect(screen.getByText('Chủ xe cá nhân')).toBeTruthy();
    expect(screen.queryByText(/%/)).toBeNull();
  });

  it('% khác 10 vẫn hiện đúng — con số đến từ chính sách phí, không phải hằng trong mã', () => {
    render(<AccountTrackBadge tenant={tenant({ serviceFeePercent: 12.5 })} />);
    expect(screen.getByText('Chủ xe cá nhân · Hoa hồng 12,5%')).toBeTruthy();
  });

  it('chủ gian hàng tuyến gói: nhãn kèm TÊN gói', () => {
    render(
      <AccountTrackBadge
        tenant={tenant({
          billingMode: BILLING_MODE.PACKAGE,
          planName: 'Gian hàng theo chỗ xe',
          serviceFeePercent: null,
        })}
      />,
    );
    expect(screen.getByText('Chủ gian hàng · Gói Gian hàng theo chỗ xe')).toBeTruthy();
  });

  it('ÂN HẠN vẫn là gian hàng — backend giữ `package` suốt pha `grace`', () => {
    render(
      <AccountTrackBadge
        tenant={tenant({ billingMode: BILLING_MODE.PACKAGE, planName: 'Gian hàng theo chỗ xe' })}
      />,
    );
    expect(screen.getByText(/Chủ gian hàng/)).toBeTruthy();
  });

  it('HẾT ÂN HẠN thành chủ xe cá nhân — backend trả `commission` ở pha `lapsed`', () => {
    render(
      <AccountTrackBadge
        // Tên gói còn là gói vừa chết, nhưng tuyến đã đổi — nhãn đi theo TUYẾN.
        tenant={tenant({ billingMode: BILLING_MODE.COMMISSION, planName: 'Gian hàng theo chỗ xe' })}
      />,
    );
    expect(screen.getByText('Chủ xe cá nhân · Hoa hồng 10%')).toBeTruthy();
    expect(screen.queryByText(/Chủ gian hàng/)).toBeNull();
  });

  it.each([
    [TENANT_ROLE.SHOP_MANAGER, 'Quản lý gian hàng'],
    [TENANT_ROLE.SHOP_STAFF, 'Nhân viên gian hàng'],
    [TENANT_ROLE.SHOP_VIEWER, 'Người xem gian hàng'],
  ])('vai %s thấy đúng vai của mình, KHÔNG bị gọi là chủ', (roleKey, label) => {
    render(<AccountTrackBadge tenant={tenant({ roleKey, billingMode: BILLING_MODE.PACKAGE })} />);
    expect(screen.getByText(label)).toBeTruthy();
    expect(screen.queryByText(/Chủ/)).toBeNull();
  });

  it('vai lạ (backend mới hơn web) rơi về nhãn chung thay vì ném lúc render', () => {
    render(<AccountTrackBadge tenant={tenant({ roleKey: 'shop_accountant' })} />);
    expect(screen.getByText('Thành viên gian hàng')).toBeTruthy();
  });

  it('`unconfigured`: báo LỖI CẤU HÌNH, không đoán tuyến và không in % nào', () => {
    render(
      <AccountTrackBadge
        tenant={tenant({
          billingMode: null,
          onboardingState: SHOP_ONBOARDING_STATE.COMMISSION,
        })}
      />,
    );
    expect(screen.getByText('Chưa xác định gói')).toBeTruthy();
    expect(screen.queryByText(/Hoa hồng/)).toBeNull();
    expect(screen.queryByText(/Chủ xe cá nhân/)).toBeNull();
  });

  /**
   * HAI ca `billingMode: null`, HAI nhãn khác nhau (ADR 0040 điều 2).
   *
   * Gian hàng trả phí đang chờ đối soát CỐ Ý không có dòng thuê bao nào, nên hình dạng scope của
   * họ trùng khít với một tenant có danh mục gói hỏng. Nếu nhãn chỉ đọc `billingMode` thì MỌI
   * người vừa bấm "Đăng ký gian hàng" đều nhận một thẻ đỏ "Chưa xác định gói" kèm tooltip mời
   * liên hệ hỗ trợ — cho một hệ thống đang chạy đúng, ngay ở bước lẽ ra phải mời họ trả tiền.
   */
  it('đang chờ thanh toán gói: thẻ TRUNG TÍNH, không phải lỗi cấu hình', () => {
    render(
      <AccountTrackBadge
        tenant={tenant({
          billingMode: null,
          onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
        })}
      />,
    );
    expect(screen.getByText('Chờ thanh toán gói')).toBeTruthy();
    expect(screen.queryByText('Chưa xác định gói')).toBeNull();
  });

  /*
   * Tiền đã về (admin gán tay, hay cột chưa kịp cập nhật) ⇒ nhãn gian hàng bình thường. Giữ thẻ
   * "chờ thanh toán" trên một gian hàng đã trả tiền là nói sai về tiền.
   */
  it('`package_pending` nhưng đã có gói hiệu lực: nhãn gian hàng, không còn "chờ thanh toán"', () => {
    render(
      <AccountTrackBadge
        tenant={tenant({
          billingMode: BILLING_MODE.PACKAGE,
          planName: 'Gian hàng theo chỗ xe',
          onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_PENDING,
        })}
      />,
    );
    expect(screen.getByText(/Chủ gian hàng/)).toBeTruthy();
    expect(screen.queryByText('Chờ thanh toán gói')).toBeNull();
  });
});
