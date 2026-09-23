import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { BILLING_MODE, BILLING_PHASE, TENANT_ROLE } from '@xeprime/types';

import { MarketHeader } from './MarketHeader';

/**
 * Vỏ khu khách — nằm trên MỌI trang của tuyến thuê xe, nên một lỗi tương tác ở đây nhân lên
 * khắp sản phẩm.
 *
 * Ba điều được khoá ở đây: mỗi biểu tượng góc phải là MỘT phần tử tương tác có tên đọc được;
 * các đích quen thuộc của khu khách vẫn còn; và bộ đổi ngôn ngữ KHÔNG bao giờ biến mất — nó
 * nằm trong menu tài khoản khi đã đăng nhập, và là nút riêng khi chưa.
 *
 * Bản thân biểu tượng tin nhắn có test riêng (`ChatMenu.test.tsx`).
 */
const state = vi.hoisted(() => ({
  user: { id: 'U1', displayName: 'Khách A' } as unknown,
}));

/**
 * Tài khoản GIAN HÀNG TUYẾN GÓI — đúng hình dạng mà `/auth/me` trả về cho tài khoản trong hai
 * ảnh chụp màn hình của báo cáo lỗi (`billingMode: package`, `billingPhase: current`).
 *
 * `roleKey` để mặc định là chủ, nhưng mọi khẳng định dưới đây phải đúng với MỌI vai: tuyến là
 * thuộc tính của tenant, không của người.
 */
function shopUser(roleKey: string = TENANT_ROLE.SHOP_OWNER) {
  return {
    id: 'U9',
    displayName: 'XePrime Sài Gòn',
    tenant: {
      id: 'T1',
      name: 'XePrime Sài Gòn',
      roleKey,
      billingMode: BILLING_MODE.PACKAGE,
      billingPhase: BILLING_PHASE.CURRENT,
    },
  };
}

vi.mock('@/hooks/use-current-user', () => ({ useCurrentUser: () => ({ data: state.user }) }));

vi.mock('@/features/chat/components/ChatMenu', () => ({
  ChatMenu: () => (
    <a href="/chat" aria-label="Tin nhắn">
      chat
    </a>
  ),
}));

vi.mock('@/features/auth/components/AuthModalProvider', () => ({
  useAuthModal: () => ({ open: vi.fn() }),
  useNextFromCurrentPath: () => () => '/',
}));

vi.mock('@/features/auth/hooks/use-auth-actions', () => ({
  useAuthCache: () => ({ clearAfterLogout: vi.fn() }),
}));

/*
 * Huy hiệu chat chặn ở ĐÚNG ranh giới đã chặn `ChatMenu`: nó đọc `useBadges`, thứ đòi một
 * `BadgeRealtimeProvider` ở trên cây. Bộ này kiểm hình dạng của thanh và menu, không kiểm phép
 * đếm chưa đọc — cái đó có spec riêng ở `features/chat`.
 */
vi.mock('@/features/chat/hooks/use-chat-badge', () => ({
  useChatBadge: () => ({ count: 2, href: '/chat', inbox: 'customer' }),
}));

vi.mock('@/features/notifications/components/NotificationBell', () => ({
  NotificationBell: () => <button type="button" aria-label="Thông báo" />,
}));

vi.mock('@/i18n/actions', () => ({ setLocale: vi.fn().mockResolvedValue({ ok: true }) }));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: vi.fn(), push: vi.fn(), refresh: vi.fn() }),
  // Thanh điều hướng và chân trang đánh dấu mục ĐANG XEM từ pathname (`isActivePath`).
  usePathname: () => '/',
}));

beforeEach(() => {
  state.user = { id: 'U1', displayName: 'Khách A' };
});

afterEach(cleanup);

describe('MarketHeader', () => {
  it('mỗi biểu tượng ở góc phải đều có tên đọc được — không có nút câm', () => {
    const { container } = render(<MarketHeader />);
    const unnamed = Array.from(container.querySelectorAll('button')).filter(
      (btn) => !btn.getAttribute('aria-label') && !btn.textContent?.trim(),
    );
    expect(unnamed).toHaveLength(0);
  });

  it('vẫn dẫn tới các đích quen thuộc của khu khách', () => {
    render(<MarketHeader />);
    expect(screen.getByRole('link', { name: 'Chuyến của tôi' }).getAttribute('href')).toBe(
      '/trips',
    );
  });

  it('đổi ngôn ngữ nằm TRONG menu tài khoản khi đã đăng nhập', async () => {
    render(<MarketHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));

    await waitFor(() => expect(screen.getByText('Tiếng Việt')).toBeTruthy());
    expect(screen.getByText('English')).toBeTruthy();
  });

  /**
   * Chọn ngôn ngữ là việc người ta làm TRƯỚC khi làm bất cứ việc gì khác. Dọn nó vào menu tài
   * khoản mà quên nhánh chưa đăng nhập thì khách vãng lai bị nhốt trong tiếng Việt.
   */
  it('khách CHƯA đăng nhập vẫn có nút đổi ngôn ngữ riêng trên thanh', () => {
    state.user = null;
    render(<MarketHeader />);

    expect(screen.getByRole('button', { name: /Đổi ngôn ngữ giao diện/ })).toBeTruthy();
  });
});

/**
 * TÀI KHOẢN GIAN HÀNG TUYẾN GÓI trên thanh khu khách (15/09/2026).
 *
 * Ảnh chụp trong báo cáo lỗi: một tài khoản `shop_owner` của gian hàng còn hạn gói vẫn thấy
 * "Chuyến của tôi", biểu tượng tin nhắn khách và chuông thông báo khách. Ba thứ đó là chức năng
 * của NGƯỜI ĐI THUÊ — tài khoản gian hàng tuyến gói không đặt xe trên chợ này (ADR 0038 điều 6),
 * nên chúng dẫn tới những màn không có việc gì để làm.
 *
 * Ranh giới hỏi TUYẾN của tenant, không hỏi vai: chủ xe tuyến hoa hồng cũng là `shop_owner` và
 * họ VẪN là khách thuê ở chợ này — xem bộ test bảo toàn ngay dưới.
 */
describe('MarketHeader — tài khoản gian hàng tuyến gói', () => {
  const ROLES = [
    TENANT_ROLE.SHOP_OWNER,
    TENANT_ROLE.SHOP_MANAGER,
    TENANT_ROLE.SHOP_STAFF,
    TENANT_ROLE.SHOP_VIEWER,
  ];

  it('thanh điều hướng: "Quản lý gian hàng" thay cho "Chuyến của tôi" — mọi vai', () => {
    for (const roleKey of ROLES) {
      state.user = shopUser(roleKey);
      const { unmount } = render(<MarketHeader />);

      expect(screen.getByRole('link', { name: 'Quản lý gian hàng' }).getAttribute('href')).toBe(
        '/manage',
      );
      expect(screen.queryByRole('link', { name: 'Chuyến của tôi' })).toBeNull();
      unmount();
    }
  });

  it('không có chat khách và không có chuông khách', () => {
    state.user = shopUser();
    render(<MarketHeader />);

    expect(screen.queryByRole('link', { name: 'Tin nhắn' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Thông báo' })).toBeNull();
  });

  /*
   * "Hồ sơ gian hàng" là hồ sơ PHÁP NHÂN. Nhãn cũ ("Tài khoản của tôi") nói về một con người,
   * và nó trỏ vào khu khách — nơi `AccountShell` chuyển hướng họ đi ngay.
   */
  it('menu tài khoản: đổi sang "Hồ sơ gian hàng", bỏ chuyến và chat khách', async () => {
    state.user = shopUser();
    render(<MarketHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Hồ sơ gian hàng')).toBeTruthy());

    expect(screen.getByRole('link', { name: 'Hồ sơ gian hàng' }).getAttribute('href')).toBe(
      '/manage/shop',
    );
    expect(screen.queryByRole('link', { name: 'Tài khoản của tôi' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Chuyến của tôi' })).toBeNull();
    expect(screen.queryByRole('link', { name: 'Tin nhắn' })).toBeNull();
  });

  /* Đổi ngôn ngữ và đăng xuất không thuộc về tuyến nào — mất chúng là mất lối ra. */
  it('vẫn giữ đổi ngôn ngữ, lối vào Manage và đăng xuất', async () => {
    state.user = shopUser();
    render(<MarketHeader />);

    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Tiếng Việt')).toBeTruthy());

    expect(screen.getByText('English')).toBeTruthy();
    expect(screen.getByText('Đăng xuất')).toBeTruthy();
  });
});

/**
 * BẢO TOÀN — hai nhóm người dùng KHÔNG được đổi gì cả.
 *
 * Đây là nửa còn lại của mỗi lần thu hẹp quyền: chứng minh việc thu hẹp dừng đúng chỗ. Chủ xe
 * tuyến hoa hồng và gian hàng đã hết gói + hết ân hạn đều làm việc ở khu khách (ADR 0028), nên
 * thanh của họ phải y như cũ.
 */
describe('MarketHeader — bảo toàn tuyến hoa hồng', () => {
  it('chủ xe tuyến hoa hồng vẫn thấy chuyến, chat và chuông', () => {
    state.user = {
      id: 'U2',
      displayName: 'Chủ xe B',
      tenant: {
        id: 'T2',
        name: 'Gara B',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        billingMode: BILLING_MODE.COMMISSION,
        billingPhase: BILLING_PHASE.CURRENT,
      },
    };
    render(<MarketHeader />);

    expect(screen.getByRole('link', { name: 'Chuyến của tôi' }).getAttribute('href')).toBe(
      '/trips',
    );
    expect(screen.getByRole('link', { name: 'Tin nhắn' })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Thông báo' })).toBeTruthy();
  });

  /*
   * Hết gói VÀ hết ân hạn ⇒ tenant rơi về tuyến hoa hồng (ADR 0038 điều 5). Họ lấy lại khu khách,
   * không bị kẹt giữa hai tuyến.
   */
  it('gian hàng đã hết gói (lapsed) lấy lại khu khách', () => {
    state.user = {
      id: 'U3',
      displayName: 'Gian hàng hết hạn',
      tenant: {
        id: 'T3',
        name: 'Shop C',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        billingMode: BILLING_MODE.COMMISSION,
        billingPhase: BILLING_PHASE.LAPSED,
      },
    };
    render(<MarketHeader />);

    expect(screen.getByRole('link', { name: 'Chuyến của tôi' })).toBeTruthy();
  });

  /* Khách thuê thuần: không có tenant nào, và không có gì để thu hẹp. */
  it('khách thuê thuần không đổi', () => {
    state.user = { id: 'U4', displayName: 'Khách D' };
    render(<MarketHeader />);

    expect(screen.getByRole('link', { name: 'Chuyến của tôi' })).toBeTruthy();
    expect(screen.getByRole('link', { name: 'Tin nhắn' })).toBeTruthy();
  });
});

/**
 * THẺ DANH TÍNH mở đầu menu tài khoản (16/09/2026).
 *
 * Bản trước mở đầu bằng một dòng chữ bị vô hiệu hoá mang tên người dùng — nó trả lời "tôi đang
 * đăng nhập bằng tài khoản nào" chỉ bằng một nửa. Với người có nhiều tài khoản (rất thường gặp:
 * một để thuê, một để cho thuê) thì cái tên một mình không phân biệt được, và đó chính là lúc
 * người ta mở menu này ra để kiểm tra.
 */
describe('MarketHeader — thẻ danh tính', () => {
  /** Mở menu tài khoản và đợi nó dựng xong. */
  async function openMenu() {
    render(<MarketHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Đăng xuất')).toBeTruthy());
  }

  it('hiện tên VÀ email — hai thứ cùng lúc mới phân biệt được tài khoản', async () => {
    state.user = { id: 'U1', displayName: 'Huỳnh Văn Tài', email: 'taih@gmail.com' };
    await openMenu();

    expect(screen.getByText('Huỳnh Văn Tài')).toBeTruthy();
    expect(screen.getByText('taih@gmail.com')).toBeTruthy();
  });

  /* Tài khoản tạo bằng OTP không có email — SĐT làm việc phân biệt, ô không được để trống. */
  it('không có email thì lùi về SĐT', async () => {
    state.user = { id: 'U1', displayName: 'Khách OTP', email: null, phone: '0912345678' };
    await openMenu();

    expect(screen.getByText('0912345678')).toBeTruthy();
  });

  it('cả thẻ là một liên kết tới hồ sơ', async () => {
    state.user = { id: 'U1', displayName: 'Khách A', email: 'a@x.vn' };
    await openMenu();

    const card = screen.getByText('Khách A').closest('a');
    expect(card?.getAttribute('href')).toBe('/account');
  });

  /*
   * Thành viên gian hàng tuyến gói đọc hồ sơ con người ở `/manage/account`; `AccountShell` chuyển
   * hướng `/account` của họ sang đó, nên trỏ thẳng là bớt một cú nhảy chứ không phải một luật thứ hai.
   */
  it('thành viên gian hàng: thẻ trỏ thẳng /manage/security', async () => {
    state.user = { ...shopUser(), email: 'shop@x.vn' };
    await openMenu();

    const card = screen.getByText('XePrime Sài Gòn').closest('a');
    expect(card?.getAttribute('href')).toBe('/manage/security');
  });
});

/**
 * Các dòng điều hướng trong menu — đổi theo TUYẾN, không theo vai.
 */
describe('MarketHeader — dòng điều hướng trong menu', () => {
  async function openMenu() {
    render(<MarketHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Đăng xuất')).toBeTruthy());
  }

  /*
   * "Xe của tôi" chỉ có nghĩa với CHỦ XE tuyến hoa hồng — họ là người duy nhất có đội xe nằm
   * trong khu user. Một mục dẫn tới danh sách rỗng vĩnh viễn là một mục nói dối về sản phẩm.
   */
  it('chủ xe tuyến hoa hồng có "Xe của tôi"; khách thuê thuần thì không', async () => {
    state.user = {
      id: 'U2',
      displayName: 'Chủ xe B',
      tenant: {
        id: 'T2',
        name: 'Gara B',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        billingMode: BILLING_MODE.COMMISSION,
        billingPhase: BILLING_PHASE.CURRENT,
      },
    };
    const owner = render(<MarketHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Đăng xuất')).toBeTruthy());
    expect(screen.getByRole('link', { name: /Xe của tôi/ }).getAttribute('href')).toBe(
      '/account/vehicles',
    );
    owner.unmount();

    state.user = { id: 'U4', displayName: 'Khách D' };
    await openMenu();
    expect(screen.queryByRole('link', { name: /Xe của tôi/ })).toBeNull();
  });

  /*
   * Đích hộp thư đến từ `useChatBadge`, không ghép `/chat` cứng: chủ xe tuyến hoa hồng đi tới hộp
   * thư HỢP NHẤT (ADR 0038 điều 10), và số chưa đọc phải là cùng con số với biểu tượng trên thanh.
   */
  it('dòng Tin nhắn mang số chưa đọc và đi tới đúng hộp thư', async () => {
    state.user = { id: 'U1', displayName: 'Khách A' };
    await openMenu();

    /*
     * Hai phần tử cùng mang tên "Tin nhắn": biểu tượng trên thanh (bản mock của `ChatMenu`) và
     * dòng trong menu. Phân biệt bằng NỘI DUNG — dòng menu mang nhãn chữ, biểu tượng thì không.
     */
    const chat = screen
      .getAllByRole('link', { name: /Tin nhắn/ })
      .find((el) => el.textContent?.includes('Tin nhắn'));
    expect(chat?.getAttribute('href')).toBe('/chat');
    expect(chat?.textContent).toContain('2');
  });
});

/**
 * DẤU XÁC THỰC — nó thay hẳn nhãn chữ trong menu, nên nó phải nói được thành lời.
 *
 * Khi một HÌNH là nơi duy nhất chứa một thông tin thì nó không còn là trang trí: thiếu tên truy
 * cập được, người dùng trình đọc màn hình mất luôn thông tin đó. Vì vậy bộ này tìm nó bằng
 * `role="img"` + tên, chứ không bằng class hay thẻ `svg`.
 */
describe('MarketHeader — dấu xác thực', () => {
  const MARK = 'Chủ gian hàng đã xác thực';

  async function openMenu() {
    render(<MarketHeader />);
    fireEvent.click(screen.getByRole('button', { name: 'Tài khoản' }));
    await waitFor(() => expect(screen.getByText('Đăng xuất')).toBeTruthy());
  }

  it('chủ gian hàng tuyến gói: có dấu, và KHÔNG còn nhãn chữ dài', async () => {
    state.user = shopUser();
    await openMenu();

    expect(screen.getByRole('img', { name: MARK })).toBeTruthy();
    // Nhãn pill cũ mang tên gói — thứ không ai mở menu tài khoản ra để đọc.
    expect(screen.queryByText(/Gói /)).toBeNull();
  });

  /*
   * Chủ xe tuyến hoa hồng KHÔNG có dấu — họ chưa đi qua vòng duyệt hồ sơ gian hàng. Gắn dấu cho
   * cả hai thì dấu không còn phân biệt được gì.
   */
  it('chủ xe tuyến hoa hồng: không có dấu', async () => {
    state.user = {
      id: 'U2',
      displayName: 'Chủ xe B',
      tenant: {
        id: 'T2',
        name: 'Gara B',
        roleKey: TENANT_ROLE.SHOP_OWNER,
        billingMode: BILLING_MODE.COMMISSION,
        billingPhase: BILLING_PHASE.CURRENT,
      },
    };
    await openMenu();

    expect(screen.queryByRole('img', { name: MARK })).toBeNull();
  });

  it('khách thuê thuần: không có dấu', async () => {
    state.user = { id: 'U4', displayName: 'Khách D' };
    await openMenu();

    expect(screen.queryByRole('img', { name: MARK })).toBeNull();
  });
});
