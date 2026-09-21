import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, SHOP_ONBOARDING_STATE, TENANT_ROLE } from '@xeprime/types';

import { ShopEntryCard } from './ShopEntryCard';

/**
 * Cửa đi từ khu tài khoản sang khu quản lý.
 *
 * Thẻ này đọc VAI THỰC TẾ (ADR 0014) — sai vai là hai lỗi khác nhau và đều tệ: mời một chủ
 * shop "đăng xe cho thuê" (thứ họ làm xong rồi), hoặc đưa một khách thuê tới `/manage` để ăn
 * 403. Và trong lúc chưa biết mình là ai thì **không đoán**.
 */

const user = vi.hoisted(() => ({
  value: null as null | {
    platformRole: string | null;
    tenant: {
      name: string;
      roleKey?: string;
      status?: string;
      billingMode?: string | null;
      onboardingState?: string;
      publicVehicleCount?: number;
    } | null;
  },
  isLoading: false,
}));

vi.mock('@/hooks/use-current-user', () => ({
  useCurrentUser: () => ({ data: user.value, isLoading: user.isLoading }),
}));

beforeEach(() => {
  user.value = null;
  user.isLoading = false;
});

afterEach(cleanup);

describe('ShopEntryCard', () => {
  it('gian hàng TUYẾN GÓI → cổng quản lý, hiện TÊN gian hàng', () => {
    user.value = {
      platformRole: null,
      tenant: {
        name: 'Cho thuê xe Bình Minh',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: 'active',
        billingMode: BILLING_MODE.PACKAGE,
        publicVehicleCount: 3,
      },
    };
    render(<ShopEntryCard />);

    expect(screen.getByText('Cho thuê xe Bình Minh')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/manage');
  });

  /**
   * Bất biến 14/09/2026: thẻ này KHÔNG được đưa tuyến hoa hồng vào cổng quản lý.
   *
   * Nó nằm ngay đầu trang tài khoản của chính họ và là đường vào nhầm khu rõ nhất của bản cũ —
   * bản cũ chỉ hỏi "có tenant không" rồi trỏ thẳng `/manage`.
   *
   * Lời mời đúng với họ là NÂNG CẤP, và nó dẫn tới `/account/subscription` — khu của chính họ,
   * không phải `/manage` (cánh cửa đó đóng: `SubscriptionTrackGuard`, ADR 0038 điều 4). Đây cũng
   * là cửa vào DUY NHẤT của phễu nâng cấp: "Gói dịch vụ" không còn là mục sidebar.
   */
  it('chủ xe TUYẾN HOA HỒNG → thẻ NÂNG CẤP, dẫn tới trang gói', () => {
    user.value = {
      platformRole: null,
      tenant: {
        name: 'Xe của Minh',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: 'active',
        billingMode: BILLING_MODE.COMMISSION,
        publicVehicleCount: 2,
      },
    };
    render(<ShopEntryCard />);

    expect(screen.getByText('Nâng cấp lên gian hàng')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/account/subscription');
    // Tên gian hàng KHÔNG thay tiêu đề ở biến thể này: thứ đang mời là một HÀNH ĐỘNG, không phải
    // một nơi chốn quen thuộc.
    expect(screen.queryByText('Xe của Minh')).toBeNull();
  });

  it('chủ xe hoa hồng ĐANG đăng ký → vẫn được mời nâng cấp', () => {
    user.value = {
      platformRole: null,
      tenant: {
        name: 'Xe của Minh',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: 'draft',
        billingMode: BILLING_MODE.COMMISSION,
        publicVehicleCount: 0,
      },
    };
    render(<ShopEntryCard />);

    expect(screen.getByRole('link').getAttribute('href')).toBe('/account/subscription');
  });

  /**
   * Gian hàng ĐÃ trả tiền rồi hết gói cũng rơi về `billingMode = commission`, nhưng họ là khách
   * cũ cần GIA HẠN — mời họ "nâng cấp lên gian hàng" là kể sai câu chuyện của chính họ
   * (ADR 0040 điều 4).
   */
  it('gian hàng hết gói (đã từng trả tiền) → KHÔNG mời nâng cấp', () => {
    user.value = {
      platformRole: null,
      tenant: {
        name: 'Cho thuê xe Bình Minh',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: 'active',
        billingMode: BILLING_MODE.COMMISSION,
        onboardingState: SHOP_ONBOARDING_STATE.PACKAGE_ACTIVE,
        publicVehicleCount: 4,
      },
    };
    render(<ShopEntryCard />);

    expect(screen.queryByRole('link')).toBeNull();
  });

  /**
   * Lối vào Manage hỏi TENANT, không hỏi vai. Lời mời NÂNG CẤP thì ngược lại: nó hỏi cả vai, vì
   * `subscription.purchase` mặc định chỉ chủ gian hàng có (`rbac.ts`). Nên quản lý/nhân viên của
   * một gian hàng tuyến hoa hồng không thấy thẻ nào — cả hai lời mời đều dẫn họ tới một lần 403.
   */
  it.each([TENANT_ROLE.SHOP_MANAGER, TENANT_ROLE.SHOP_STAFF, TENANT_ROLE.SHOP_VIEWER])(
    '%s của gian hàng tuyến hoa hồng KHÔNG thấy thẻ nào',
    (roleKey) => {
      user.value = {
        platformRole: null,
        tenant: {
          name: 'Xe của Minh',
          roleKey,
          status: 'active',
          billingMode: BILLING_MODE.COMMISSION,
          publicVehicleCount: 2,
        },
      };
      render(<ShopEntryCard />);

      expect(screen.queryByRole('link')).toBeNull();
      expect(screen.queryByText('Nâng cấp lên gian hàng')).toBeNull();
    },
  );

  /**
   * `unconfigured` cũng không vào được Manage — mức an toàn khi hỏng là mức CHẶT. Và nó KHÔNG
   * phải tuyến hoa hồng: mời nâng cấp ở đây là đoán hộ một trạng thái hỏng (ADR 0038 điều 1).
   */
  it('gian hàng chưa xác định được tuyến cũng KHÔNG thấy thẻ', () => {
    user.value = {
      platformRole: null,
      tenant: {
        name: 'Xe của Minh',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        status: 'active',
        billingMode: null,
        publicVehicleCount: 2,
      },
    };
    render(<ShopEntryCard />);

    expect(screen.queryByRole('link')).toBeNull();
  });

  it('chưa có gian hàng → mời đăng xe, dẫn tới LANDING công khai', () => {
    user.value = { platformRole: null, tenant: null };
    render(<ShopEntryCard />);

    expect(screen.getByText('Đăng xe cho thuê')).toBeTruthy();
    // 09/09/2026: mọi CTA chủ xe dừng ở trang giới thiệu công khai, không ném thẳng vào form
    // tạo gian hàng nằm trong cổng quản lý.
    expect(screen.getByRole('link').getAttribute('href')).toBe('/list-your-vehicle');
  });

  it('nhân sự nền tảng → dẫn tới trang quản trị', () => {
    user.value = { platformRole: 'platform_admin', tenant: null };
    render(<ShopEntryCard />);

    expect(screen.getByText('Quản trị nền tảng')).toBeTruthy();
    expect(screen.getByRole('link').getAttribute('href')).toBe('/manage/admin');
  });

  it('chưa đăng nhập → không hiện gì', () => {
    user.value = null;
    const { container } = render(<ShopEntryCard />);

    expect(container.textContent).toBe('');
  });

  it('đang tải "tôi là ai" → không đoán, không hiện thẻ nào', () => {
    user.isLoading = true;
    user.value = null;
    const { container } = render(<ShopEntryCard />);

    expect(container.textContent).toBe('');
  });
});
