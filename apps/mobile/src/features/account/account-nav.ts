import type { Href } from 'expo-router';
import type { useTranslations } from 'use-intl';
import {
  OWNER_STAGE,
  TENANT_ROLE,
  resolveOwnerStage,
  tenantUsesManagePortal,
} from '@xeprime/types';
import type { IconName } from '@/components/ui/Chip';
import type { CurrentUser } from '@/features/auth/api';
import { ROUTES } from '@/navigation/routes';

/**
 * Khoá nhãn TRỌN namespace `Navigation` (`account.profile`, `public.becomeOwner`…) — union đóng
 * lấy thẳng từ bó message, nên gõ sai là lỗi biên dịch chứ không phải một mục menu trống.
 *
 * Khoá trọn namespace chứ không riêng nhóm `account`: mục nào đã có chữ ở nhóm khác thì dùng
 * lại, không chép "Trở thành chủ xe" sang `account` thành bản dịch thứ hai. Cùng luật với
 * `apps/web/src/constants/account-nav.ts`.
 */
export type AccountNavLabelKey = Parameters<ReturnType<typeof useTranslations<'Navigation'>>>[0];

/**
 * CÁCH mở một mục — ba kiểu, vì app native có ba loại đích khác hẳn nhau.
 *
 * `tab`   — một mục của thanh tab khách (`/account`, `/trips`): `replace`. `push` sẽ xếp thêm
 *            một bản sao của tab lên trên tab hiện tại, và nút lui rơi vào một màn người dùng
 *            chưa từng mở. Cùng quy ước mà `TripDetailScreen` và `RequestResultStep` đang dùng.
 * `screen` — màn nằm trong ngăn xếp của khu khách: `push`, để lui về đúng menu tài khoản.
 * `manage` — màn của khu QUẢN LÝ: phải ĐỔI KHU (`switchTo`) chứ không push, vì hai khu có hai bộ
 *            tab riêng — push để lại thanh tab khách nằm dưới một màn quản lý, đúng thứ
 *            `ScopeSwitcher` sinh ra để tránh.
 */
export const NAV_TARGET = {
  TAB: 'tab',
  SCREEN: 'screen',
  MANAGE: 'manage',
} as const;

export type NavTarget = (typeof NAV_TARGET)[keyof typeof NAV_TARGET];

/**
 * Một mục trong menu tài khoản.
 *
 * KHÔNG có `permission`: đây là dữ liệu của chính người đang đăng nhập, không phải dữ liệu của
 * một gian hàng — không có quyền nào để kiểm. Cái quyết định thấy hay không là *đã đăng nhập hay
 * chưa* (`RequireSession` gác một lần cho cả tab) và *có phải chủ xe không* (`resolveAccountNav`).
 */
export interface AccountNavItem {
  readonly key: string;
  readonly labelKey: AccountNavLabelKey;
  readonly href: Href;
  readonly icon: IconName;
  readonly target: NavTarget;
}

export interface AccountNavGroup {
  readonly key: 'owner' | 'account';
  /** Tiêu đề nhóm — `undefined` là nhóm không có tiêu đề (menu ngắn của người không phải chủ xe). */
  readonly labelKey?: AccountNavLabelKey;
  readonly items: readonly AccountNavItem[];
}

const PROFILE: AccountNavItem = {
  key: 'profile',
  labelKey: 'account.profile',
  href: ROUTES.account.home(),
  icon: 'person-outline',
  target: NAV_TARGET.TAB,
};

const TRIPS: AccountNavItem = {
  key: 'trips',
  labelKey: 'account.trips',
  href: ROUTES.booking.list(),
  icon: 'car-outline',
  target: NAV_TARGET.TAB,
};

const CHANGE_PASSWORD: AccountNavItem = {
  key: 'changePassword',
  labelKey: 'account.changePassword',
  href: ROUTES.account.changePassword(),
  icon: 'lock-closed-outline',
  target: NAV_TARGET.SCREEN,
};

const BALANCE: AccountNavItem = {
  key: 'balance',
  labelKey: 'account.balance',
  href: ROUTES.account.balance(),
  icon: 'wallet-outline',
  target: NAV_TARGET.SCREEN,
};

const BANK_ACCOUNTS: AccountNavItem = {
  key: 'bankAccounts',
  labelKey: 'account.bankAccounts',
  href: ROUTES.account.bankAccounts(),
  icon: 'card-outline',
  target: NAV_TARGET.SCREEN,
};

const PAYMENTS: AccountNavItem = {
  key: 'payments',
  labelKey: 'account.payments',
  href: ROUTES.account.payments(),
  icon: 'card-outline',
  target: NAV_TARGET.SCREEN,
};

const REGISTRATION: AccountNavItem = {
  key: 'registration',
  labelKey: 'account.registration',
  href: ROUTES.account.registration(),
  icon: 'document-text-outline',
  target: NAV_TARGET.SCREEN,
};

const DELETE_ACCOUNT: AccountNavItem = {
  key: 'deleteAccount',
  labelKey: 'account.deleteAccount',
  href: ROUTES.account.deleteAccount(),
  icon: 'trash-outline',
  target: NAV_TARGET.SCREEN,
};

/**
 * Owner Lite — MỘT nhóm phẳng, KHÔNG tiêu đề, CHÍN mục (ADR 0038 điều 9). Thứ tự y hệt
 * `OWNER_NAV` bên web và là một phần của hợp đồng: test hai bên so cả danh sách lẫn thứ tự.
 *
 * Không tách "Tài khoản" thành nhóm thứ hai: chủ xe không đổi vai khi bấm từ "Lịch xe" sang
 * "Tài khoản của tôi", nên một tiêu đề ở giữa chỉ vẽ ra một ranh giới không có thật.
 *
 * "Yêu cầu xoá tài khoản" rời menu — nó nằm TRONG "Tài khoản của tôi", cạnh danh tính mà nó đụng
 * tới. Route vẫn mở được; đây là thay đổi ĐIỀU HƯỚNG, không xoá màn nào.
 *
 * Mọi mục Ở LẠI khu khách: hai màn đầu chỉ là feature của `/manage` mặc vỏ tài khoản (cùng API,
 * cùng hook, cùng thẻ xe và cùng lưới lịch), đúng như web. Đẩy chúng sang khu quản lý là đổi cả
 * thanh tab dưới chân màn hình cho một người đang xem hồ sơ của chính mình.
 *
 * Biểu tượng lấy theo ĐÍCH (`manage-nav.ts`) để người dùng không phải học hai hình cho một màn.
 */
export const OWNER_NAV: readonly AccountNavItem[] = [
  {
    key: 'vehicles',
    labelKey: 'account.vehicles',
    href: ROUTES.account.vehicles(),
    icon: 'list-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'calendar',
    labelKey: 'account.calendar',
    href: ROUTES.account.calendar(),
    icon: 'calendar-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'hostGuide',
    labelKey: 'account.hostGuide',
    href: ROUTES.account.hostGuide(),
    icon: 'book-outline',
    target: NAV_TARGET.SCREEN,
  },
  TRIPS,
  {
    key: 'tax',
    labelKey: 'account.tax',
    href: ROUTES.account.tax(),
    icon: 'document-text-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'contractsDocuments',
    labelKey: 'account.contractsDocuments',
    href: ROUTES.account.contractsDocuments(),
    icon: 'documents-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'dataProtection',
    labelKey: 'account.dataProtection',
    href: ROUTES.account.dataProtection(),
    icon: 'shield-checkmark-outline',
    target: NAV_TARGET.SCREEN,
  },
  // Danh tính đứng cuối: việc thỉnh thoảng, sau những việc hằng ngày.
  PROFILE,
  CHANGE_PASSWORD,
];

/**
 * Chủ xe ĐANG ĐĂNG KÝ — chưa có xe nào trên chợ, nên những màn nói về việc cho thuê chưa có gì
 * để nói. Cùng tập, cùng thứ tự với `OWNER_REGISTERING_NAV` bên web.
 *
 * "Hồ sơ đăng ký" đứng ĐẦU: đó là việc duy nhất còn dang dở của họ, và cũng là chỗ duy nhất họ
 * sửa được hồ sơ gian hàng (khu quản lý đóng với tuyến hoa hồng — ADR 0038 điều 4).
 */
export const OWNER_REGISTERING_NAV: readonly AccountNavItem[] = [
  REGISTRATION,
  {
    key: 'vehicles',
    labelKey: 'account.vehicles',
    href: ROUTES.account.vehicles(),
    icon: 'list-outline',
    target: NAV_TARGET.SCREEN,
  },
  {
    key: 'hostGuide',
    labelKey: 'account.hostGuide',
    href: ROUTES.account.hostGuide(),
    icon: 'book-outline',
    target: NAV_TARGET.SCREEN,
  },
  TRIPS,
  PROFILE,
  CHANGE_PASSWORD,
];

/** Người đang đăng nhập là CHỦ gian hàng (ADR 0014: chủ xe và chủ gian hàng cùng một vai). */
export function isShopOwner(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
}

/**
 * KHU LÀM VIỆC của người này — bản native của `resolveWorkspaceHref` bên web.
 *
 * `null` = chưa thuộc gian hàng nào, nên chưa có khu làm việc.
 *
 * Hỏi TUYẾN trước, rồi mới hỏi vai (ADR 0038 điều 4): chỉ gian hàng tuyến GÓI mới có cổng quản
 * lý. Trả `manage.home()` cho một tenant tuyến hoa hồng là đẩy họ vào khu mà `ScopeGuard` đá ra
 * ngay khung hình sau — người dùng thấy một cái nháy kèm toast "bạn không còn quyền truy cập",
 * trong khi họ chẳng mất gì cả.
 */
export function resolveWorkspaceHref(
  user: Pick<CurrentUser, 'tenant'> | null | undefined,
): Href | null {
  const tenant = user?.tenant ?? null;
  if (!tenant) return null;
  if (tenantUsesManagePortal(tenant)) return ROUTES.manage.home();
  /*
   * Tuyến hoa hồng. Quản lý/nhân viên/người xem KHÔNG có bộ công cụ cho thuê nào ở đây — khu làm
   * việc của họ là hồ sơ của chính mình.
   */
  if (tenant.roleKey !== TENANT_ROLE.SHOP_OWNER) return ROUTES.account.home();
  /*
   * Chủ xe: đã có xe trên chợ ⇒ vào thẳng danh sách xe. Còn đang đăng ký ⇒ về màn tài khoản, nơi
   * `ShopEntryCard` và dải trạng thái đang nói tiến trình duyệt tới đâu (web có
   * `/account/registration` riêng; app native chưa dựng màn đó).
   */
  return resolveOwnerStage(tenant) === OWNER_STAGE.OWNER
    ? ROUTES.account.vehicles()
    : ROUTES.account.home();
}

/**
 * Đích của mọi CTA "chủ xe" trong MENU.
 *
 * Chưa có gian hàng ⇒ dừng ở LANDING công khai `/list-your-vehicle`: mục menu này mà ném thẳng
 * người ta vào form hỏi tên gian hàng và mã số thuế trước khi họ kịp biết mình được gì chính là
 * lỗi web đã sửa ngày 09/09/2026.
 *
 * Thẻ `ShopEntryCard` cố ý KHÔNG đi qua hàm này: nút "Bắt đầu" trên thẻ là lời mời đã đọc rồi, nó
 * vào thẳng form đăng ký gian hàng — hai luồng khác nhau, y hệt web.
 */
export function resolveOwnerCtaHref(user: Pick<CurrentUser, 'tenant'> | null | undefined): Href {
  return resolveWorkspaceHref(user) ?? ROUTES.listYourVehicle.root();
}

/** Khu làm việc là cổng quản lý — tức người này ĐƯỢC đổi khu, không bị đá ra. */
export function canUseManagePortal(
  user: Pick<CurrentUser, 'tenant'> | null | undefined,
): boolean {
  return tenantUsesManagePortal(user?.tenant ?? null);
}

/**
 * Menu theo LOẠI người dùng — BA nhánh, cùng luật và cùng thứ tự với `resolveAccountNav` bên web.
 *
 * Thứ tự hỏi là một phần của luật, không phải chuyện sắp xếp:
 *
 * 1. **Tuyến GÓI** (`tenantUsesManagePortal`) — hỏi TENANT, không hỏi vai, nên chủ/quản lý/nhân
 *    viên/người xem nhận CÙNG một menu. Khu khách của họ còn ĐÚNG HAI mục: "Quản lý gian hàng" và
 *    "Hồ sơ gian hàng" (hồ sơ PHÁP NHÂN). Hồ sơ con người, đổi mật khẩu và yêu cầu xoá tài khoản
 *    sống ở khu quản lý (ADR 0038 điều 7).
 * 2. **Chủ xe tuyến hoa hồng** (và cả `unconfigured`) — Owner Lite, một nhóm phẳng: 9 mục khi đã
 *    có xe trên chợ, 5 mục khi còn đang đăng ký.
 * 3. **Còn lại** — khách thuê, và quản lý/nhân viên/người xem của một gian hàng tuyến hoa hồng:
 *    ở đây họ là một CON NGƯỜI, nên menu là menu cá nhân kèm CTA mở gian hàng.
 *
 * Nhánh 2 dùng `resolveOwnerStage` chứ không `isShopOwner`: một chủ xe chưa có xe nào trên chợ
 * mà nhận đủ chín mục sẽ mở ra những màn rỗng và không màn nào nói vì sao.
 */
export function resolveAccountNav(user: CurrentUser | null | undefined): AccountNavGroup[] {
  const tenant = user?.tenant ?? null;

  if (tenantUsesManagePortal(tenant)) {
    const manageShop: AccountNavItem = {
      key: 'manageShop',
      labelKey: 'public.manageShop',
      href: ROUTES.manage.home(),
      icon: 'storefront-outline',
      target: NAV_TARGET.MANAGE,
    };
    const shopProfile: AccountNavItem = {
      key: 'shopProfile',
      labelKey: 'account.shopProfile',
      href: ROUTES.manage.shop(),
      icon: 'document-text-outline',
      target: NAV_TARGET.MANAGE,
    };
    /*
     * HỒ SƠ CÁ NHÂN — lối duy nhất từ khu khách sang "Tài khoản & bảo mật" của khu quản lý, nơi
     * người này sửa tên/ảnh/email/SĐT và đổi mật khẩu (người dùng chốt 16/09/2026).
     *
     * Chỉ có ở nhánh TUYẾN GÓI: `/manage/account` nằm sau `ScopeGuard`, nên mục này mọc ra ở menu
     * của một khách thuê thường là đẩy họ vào khu bị đá ra ngay khung hình sau.
     *
     * Nhãn KHÁC `account.profile` ("Tài khoản của tôi") có chủ đích: hai chuỗi đó đang trỏ vào
     * hai bề mặt khác nhau, và dùng chung một chữ thì người dùng tưởng mình bấm nhầm.
     */
    const personalProfile: AccountNavItem = {
      key: 'personalProfile',
      labelKey: 'account.personalProfile',
      href: ROUTES.manage.account(),
      icon: 'person-outline',
      target: NAV_TARGET.MANAGE,
    };
    return [{ key: 'account', items: [manageShop, shopProfile, personalProfile] }];
  }

  const stage = resolveOwnerStage(tenant);
  if (stage !== OWNER_STAGE.NONE) {
    return [
      {
        key: 'owner',
        items: stage === OWNER_STAGE.OWNER ? OWNER_NAV : OWNER_REGISTERING_NAV,
      },
    ];
  }

  const becomeOwner: AccountNavItem = {
    key: 'becomeOwner',
    labelKey: user?.tenant ? 'public.manageShop' : 'public.becomeOwner',
    href: resolveOwnerCtaHref(user),
    icon: 'storefront-outline',
    /*
     * Đã thuộc một gian hàng ⇒ ĐỔI KHU về cổng quản lý. Chưa có ⇒ form đăng ký gian hàng là một
     * màn chen ngang của khu khách (`ScopeGuard` cho qua đúng route đó), nên nó `push` như mọi
     * màn khác — đổi khu sang nơi họ chưa có quyền vào là đá chính họ ra ngay sau đó.
     */
    target: canUseManagePortal(user) ? NAV_TARGET.MANAGE : NAV_TARGET.SCREEN,
  };

  return [
    {
      key: 'account',
      items: [
        PROFILE,
        becomeOwner,
        TRIPS,
        PAYMENTS,
        // Khách thuê CÓ số dư: tiền hoàn khoản giữ chỗ chảy vào ví điểm của họ (ADR 0033 điều 5),
        // và tài khoản nhận tiền là nơi khai số để rút nó ra.
        BALANCE,
        BANK_ACCOUNTS,
        CHANGE_PASSWORD,
        DELETE_ACCOUNT,
      ],
    },
  ];
}

/**
 * Màn "Tài khoản của tôi" có phải nơi duy nhất còn dẫn tới YÊU CẦU XOÁ TÀI KHOẢN không?
 *
 * ADR 0038 điều 9 đẩy mục này ra khỏi menu Owner Lite và hẹn nó "nằm trong Tài khoản của tôi,
 * cạnh danh tính mà nó đụng tới" — nhưng chỗ hẹn đó chưa từng được dựng, nên chủ xe tuyến hoa
 * hồng không còn lối nào tới `/account/delete-account`. Hàm này là chỗ hẹn đó.
 *
 * Suy từ CHÍNH cái menu chứ không liệt kê lại một danh sách vai thứ hai: khách thuê đã có mục
 * này trong menu và gian hàng tuyến gói có nó ở `/manage/account`, nên hai nhóm đó không được
 * thấy thêm một lối thứ hai trên cùng một màn. Menu đổi thì luật này tự đúng theo.
 */
export function showsDeleteAccountCard(user: CurrentUser | null | undefined): boolean {
  if (!user) return false;
  if (canUseManagePortal(user)) return false;
  return !flattenAccountNav(resolveAccountNav(user)).some(
    (item) => item.key === DELETE_ACCOUNT.key,
  );
}

/** Mọi mục của mọi nhóm — cho hàm khớp đường dẫn. */
export function flattenAccountNav(groups: readonly AccountNavGroup[]): AccountNavItem[] {
  return groups.flatMap((group) => [...group.items]);
}

/**
 * Đường dẫn của một mục dưới dạng chuỗi — `Href` có thể là object (`{pathname, params}`), còn
 * việc khớp mục đang mở chỉ quan tâm tới phần đường dẫn.
 */
export function navItemPath(href: Href): string {
  return typeof href === 'string' ? href : String(href.pathname);
}

/**
 * Mục đang mở theo đường dẫn hiện tại — cùng luật với `matchAccountNavKey` bên web.
 *
 * Khớp tuyệt đối trước, không thì lấy mục có đường dẫn là tiền tố dài nhất (để `/trips/abc` vẫn
 * sáng "Chuyến của tôi"). `/account` chỉ khớp tuyệt đối — nếu không thì mọi màn con đều dính vào
 * nó và menu luôn chỉ sai chỗ đứng.
 */
export function matchAccountNavKey(
  pathname: string,
  items: readonly AccountNavItem[],
): string | undefined {
  const root = navItemPath(ROUTES.account.home());
  let best: { key: string; length: number } | undefined;

  for (const item of items) {
    const href = navItemPath(item.href);
    const isMatch = pathname === href || (href !== root && pathname.startsWith(`${href}/`));
    if (isMatch && (!best || href.length > best.length)) {
      best = { key: item.key, length: href.length };
    }
  }

  return best?.key;
}
