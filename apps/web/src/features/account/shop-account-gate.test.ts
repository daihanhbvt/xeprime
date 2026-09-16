import { describe, expect, it } from 'vitest';
import { BILLING_MODE, BILLING_PHASE, TENANT_ROLE } from '@xeprime/types';

import { ROUTES } from '@/constants/routes';
import type { CurrentUser } from '@/hooks/use-current-user';

import { shopAccountRedirect } from './shop-account-gate';

/**
 * CỔNG URL của khu khách — không phải chuyện ẩn menu.
 *
 * Ẩn một mục menu mà để URL mở được là để lại một cửa sau, và người dùng tìm thấy nó bằng
 * bookmark cũ chứ không phải bằng ý đồ xấu: `/account/change-password` là thứ trình duyệt đã tự
 * điền từ tháng trước. Bộ này khoá cả hai nửa của hợp đồng — ai bị chuyển đi, và ai KHÔNG.
 *
 * Nhắc lại ranh giới: đây là lớp ĐIỀU HƯỚNG. Rào thật với tiền và dữ liệu nằm ở guard backend
 * (`@ShopOwnerOnly`, `@SubscriptionTrackOnly`, scope theo membership). Một cổng ở client không
 * phải bảo mật, nhưng một sản phẩm mời người dùng vào những màn không dùng được thì vẫn hỏng.
 */

type Tenant = NonNullable<CurrentUser['tenant']>;

function shopMember(roleKey: string = TENANT_ROLE.SHOP_OWNER): Pick<CurrentUser, 'tenant'> {
  return {
    tenant: {
      id: 'T1',
      name: 'XePrime Sài Gòn',
      roleKey,
      billingMode: BILLING_MODE.PACKAGE,
      billingPhase: BILLING_PHASE.CURRENT,
    } as Tenant,
  };
}

const ALL_ROLES = [
  TENANT_ROLE.SHOP_OWNER,
  TENANT_ROLE.SHOP_MANAGER,
  TENANT_ROLE.SHOP_STAFF,
  TENANT_ROLE.SHOP_VIEWER,
];

describe('shopAccountRedirect — ai bị đưa ra khỏi khu khách', () => {
  /*
   * Ba đường trong ảnh chụp báo cáo lỗi, cộng đường gốc. Chúng thuộc về một CON NGƯỜI, nên đích
   * là "Tài khoản & bảo mật" trong Manage — nơi chúng đứng cạnh ví, lệnh rút và pháp nhân.
   */
  it('hồ sơ, đổi mật khẩu, xoá tài khoản → /manage/account', () => {
    for (const path of [
      ROUTES.ACCOUNT.ROOT,
      ROUTES.ACCOUNT.CHANGE_PASSWORD,
      ROUTES.ACCOUNT.DELETE_ACCOUNT,
    ]) {
      expect(shopAccountRedirect(shopMember(), path)).toBe(ROUTES.MANAGE.ACCOUNT);
    }
  });

  /* Công cụ CHO THUÊ có bản đầy đủ trong Manage — đưa họ tới đó, không tới một trang 403. */
  it('công cụ cho thuê của Owner Lite → /manage', () => {
    for (const path of [
      ROUTES.ACCOUNT.VEHICLES,
      ROUTES.ACCOUNT.EARNINGS,
      ROUTES.ACCOUNT.CALENDAR,
    ]) {
      expect(shopAccountRedirect(shopMember(), path)).toBe(ROUTES.MANAGE.ROOT);
    }
  });

  /*
   * Đường CHƯA TỒN TẠI cũng phải bị chặn. Liệt kê trắng từng route là cách để một màn thêm vào
   * tháng sau lặng lẽ thành cửa sau — không ai nhớ quay lại sửa bảng.
   */
  it('mọi đường con của /account đều bị chặn, kể cả đường chưa tồn tại', () => {
    expect(shopAccountRedirect(shopMember(), '/account/mot-man-moi-thang-sau')).toBe(
      ROUTES.MANAGE.ROOT,
    );
    expect(shopAccountRedirect(shopMember(), '/account/vehicles/V1/photos')).toBe(
      ROUTES.MANAGE.ROOT,
    );
  });

  it('áp cho MỌI vai của gian hàng, không riêng chủ', () => {
    for (const roleKey of ALL_ROLES) {
      expect(shopAccountRedirect(shopMember(roleKey), ROUTES.ACCOUNT.ROOT)).toBe(
        ROUTES.MANAGE.ACCOUNT,
      );
    }
  });

  /* Ân hạn VẪN là tuyến gói — họ vẫn làm việc trong Manage, nên khu khách vẫn đóng. */
  it('gian hàng đang trong ân hạn cũng bị chặn', () => {
    const grace = shopMember();
    (grace.tenant as Tenant).billingPhase = BILLING_PHASE.GRACE;

    expect(shopAccountRedirect(grace, ROUTES.ACCOUNT.ROOT)).toBe(ROUTES.MANAGE.ACCOUNT);
  });
});

describe('shopAccountRedirect — chuyến giữ nguyên deep link', () => {
  it('/trips → lối chuyển tiếp trong Manage', () => {
    expect(shopAccountRedirect(shopMember(), ROUTES.TRIPS)).toBe(ROUTES.MANAGE.ACCOUNT_TRIPS);
  });

  /*
   * `?role=host` KHÔNG phải một lối riêng: `usePathname` không mang query, nên bare `/trips` và
   * `/trips?role=host` đi vào cùng một nhánh và cùng bị chuyển. Vai bị khoá lần thứ hai ở đích
   * (`TripsView lockedRole`), nên tham số cũ trên bookmark cũng không mở lại được tập chuyến
   * cho thuê.
   */
  it('bookmark mang ?role=host vẫn bị chuyển — query không tạo ra lối riêng', () => {
    expect(shopAccountRedirect(shopMember(), ROUTES.TRIPS)).toBe(ROUTES.MANAGE.ACCOUNT_TRIPS);
  });

  /*
   * Liên kết trong email thông báo có dạng `/trips/<id>`. Đổ hết chúng về một danh sách là bắt
   * người dùng tự đi tìm lại chuyến mình vừa bấm vào.
   */
  it('/trips/<id> giữ nguyên id khi chuyển', () => {
    expect(shopAccountRedirect(shopMember(), '/trips/01JBOOKING')).toBe(
      `${ROUTES.MANAGE.ACCOUNT_TRIPS}/01JBOOKING`,
    );
  });
});

/**
 * BẢO TOÀN — nửa còn lại của mọi lần thu hẹp.
 *
 * Ba nhóm dưới đây làm việc Ở KHU KHÁCH và không được đụng tới. Thiếu bộ này, một lần "cẩn thận
 * hơn" trong tương lai sẽ khoá chủ xe tuyến hoa hồng ra khỏi chính chỗ làm việc của họ.
 */
describe('shopAccountRedirect — không đụng tới ai khác', () => {
  it('khách thuê thuần ở lại', () => {
    for (const path of [ROUTES.ACCOUNT.ROOT, ROUTES.TRIPS, '/trips/01J']) {
      expect(shopAccountRedirect({ tenant: null }, path)).toBeNull();
    }
  });

  /* Owner Lite sống Ở ĐÂY (ADR 0027/0028) — chuyển họ đi là lấy mất bộ công cụ duy nhất họ có. */
  it('chủ xe tuyến hoa hồng ở lại, kể cả trên công cụ cho thuê', () => {
    const commission = shopMember();
    (commission.tenant as Tenant).billingMode = BILLING_MODE.COMMISSION;

    for (const path of [ROUTES.ACCOUNT.ROOT, ROUTES.ACCOUNT.VEHICLES, ROUTES.TRIPS]) {
      expect(shopAccountRedirect(commission, path)).toBeNull();
    }
  });

  /*
   * Hết gói VÀ hết ân hạn ⇒ tenant rơi về tuyến hoa hồng (ADR 0038 điều 5) và LẤY LẠI khu khách.
   * Không ai được kẹt giữa hai tuyến: Manage nâng cao đã đóng, nên nếu khu này cũng đóng thì họ
   * không còn chỗ nào để khép chuyến hay rút tiền.
   */
  it('gian hàng đã hết gói lấy lại khu khách', () => {
    const lapsed = shopMember();
    (lapsed.tenant as Tenant).billingMode = BILLING_MODE.COMMISSION;
    (lapsed.tenant as Tenant).billingPhase = BILLING_PHASE.LAPSED;

    expect(shopAccountRedirect(lapsed, ROUTES.ACCOUNT.ROOT)).toBeNull();
  });

  it('đường ngoài /account và /trips không bao giờ bị chuyển', () => {
    for (const path of [ROUTES.HOME, ROUTES.SEARCH, ROUTES.MANAGE.ROOT, '/listings/V1']) {
      expect(shopAccountRedirect(shopMember(), path)).toBeNull();
    }
  });

  /*
   * `/tripsomething` KHÔNG nằm dưới `/trips`. Khớp bằng tiền tố trần (`startsWith('/trips')`) sẽ
   * nuốt luôn mọi route tương lai bắt đầu bằng cùng mấy chữ cái.
   */
  it('đường chỉ TRÙNG TIỀN TỐ chữ cái không bị nhận nhầm', () => {
    expect(shopAccountRedirect(shopMember(), '/tripsomething')).toBeNull();
    expect(shopAccountRedirect(shopMember(), '/accounts')).toBeNull();
  });

  /* Chưa biết đường dẫn (SSR sớm) thì không quyết định gì — đoán ở đây là chuyển hướng sai. */
  it('pathname rỗng không sinh ra chuyển hướng nào', () => {
    expect(shopAccountRedirect(shopMember(), null)).toBeNull();
  });
});
