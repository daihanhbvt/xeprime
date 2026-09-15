import {
  BankOutlined,
  WalletOutlined,
  BookOutlined,
  CalendarOutlined,
  CarOutlined,
  CreditCardOutlined,
  CrownOutlined,
  DeleteOutlined,
  FileProtectOutlined,
  FileTextOutlined,
  LockOutlined,
  MessageOutlined,
  SafetyOutlined,
  ShopOutlined,
  SolutionOutlined,
  UnorderedListOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import type { useTranslations } from 'next-intl';
import { OWNER_STAGE, TENANT_ROLE, isCommissionTrack, resolveOwnerStage } from '@xeprime/types';

import { resolveOwnerCtaHref } from '@/features/auth/post-auth-destination';
import type { CurrentUser } from '@/hooks/use-current-user';
import type { NavigationKey } from '@/i18n/keys';

import { ROUTES } from './routes';

/**
 * Khoá nhãn trong nhóm `Navigation.account` — union đóng lấy thẳng từ bó message tiếng Việt,
 * nên gõ sai là lỗi biên dịch chứ không phải một mục menu trống trên production. Còn dùng cho
 * các trang giữ chỗ cũ (`AccountComingSoon`).
 */
export type AccountNavLabelKey = Parameters<
  ReturnType<typeof useTranslations<'Navigation.account'>>
>[0];

/**
 * Một mục trong menu tài khoản.
 *
 * KHÔNG có `permission`: đây là dữ liệu của chính người đang đăng nhập, không phải dữ liệu
 * của một gian hàng — không có quyền nào để kiểm. Cái quyết định thấy hay không là *đã đăng
 * nhập hay chưa* (layout gác một lần cho cả khu) và *có phải chủ xe không* (`resolveAccountNav`).
 *
 * `labelKey` là khoá TRỌN namespace `Navigation` (`account.profile`, `public.becomeOwner`…) để
 * mục nào đã có chữ ở nhóm khác thì dùng lại, không chép "Trở thành chủ xe" sang nhóm `account`
 * thành bản dịch thứ hai.
 *
 * `external` = đích nằm NGOÀI `/account` (Chuyến của tôi ở `/trips`). Route đó có từ trước và
 * đang được thông báo trỏ tới; menu này bọc nó vào cùng vỏ chứ không đổi URL.
 */
export interface AccountNavItem {
  readonly key: string;
  readonly labelKey: NavigationKey;
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly external?: boolean;
}

export interface AccountNavGroup {
  readonly key: 'owner' | 'account';
  /** Tiêu đề nhóm — `undefined` là nhóm không có tiêu đề (menu ngắn của người không phải chủ xe). */
  readonly labelKey?: NavigationKey;
  readonly items: readonly AccountNavItem[];
}

const PROFILE: AccountNavItem = {
  key: 'profile',
  labelKey: 'account.profile',
  href: ROUTES.ACCOUNT.ROOT,
  icon: UserOutlined,
};

const TRIPS: AccountNavItem = {
  key: 'trips',
  labelKey: 'account.trips',
  href: ROUTES.TRIPS,
  icon: CarOutlined,
  external: true,
};

/**
 * "Ví điểm" của MỘT CON NGƯỜI — tiền hoàn khoản giữ chỗ khi chính họ đi thuê xe (ADR 0033).
 *
 * Mục này phải có mặt cho MỌI người đăng nhập, kể cả khách thuê không có gian hàng: họ là phần
 * lớn người dùng của màn đó, vì hoàn cọc chảy vào đây. Một sổ công nợ mà chủ nợ không có đường
 * vào xem thì không khác gì không trả (ADR 0033 điều 1: không hết hạn, không thu hồi — nên cũng
 * không được ẩn).
 */
const BALANCE: AccountNavItem = {
  key: 'balance',
  labelKey: 'account.balance',
  href: ROUTES.ACCOUNT.BALANCE,
  icon: WalletOutlined,
};

/**
 * "Tiền cho thuê xe" — ví điểm của GIAN HÀNG, bản `/account` của `/manage/balance`.
 *
 * Chỉ nằm ở nhóm CHỦ XE. Đây là đường duy nhất để chủ xe tuyến hoa hồng thấy và rút khoản
 * XePrime phải trả sau mỗi chuyến: `canUseManagePortal` trả false cho họ nên `/manage/balance`
 * là cánh cửa đóng.
 */
const EARNINGS: AccountNavItem = {
  key: 'earnings',
  labelKey: 'account.earnings',
  href: ROUTES.ACCOUNT.EARNINGS,
  icon: WalletOutlined,
};

const BANK_ACCOUNTS: AccountNavItem = {
  key: 'bankAccounts',
  labelKey: 'account.bankAccounts',
  href: ROUTES.ACCOUNT.BANK_ACCOUNTS,
  icon: BankOutlined,
};

/**
 * "Lịch sử thanh toán" — tiền ĐÃ TRẢ CHO GIAN HÀNG của các chuyến mình thuê.
 *
 * Mục này từng bị bỏ khỏi menu vì `/account/payments` chỉ là placeholder; màn thật đã có
 * (PROMPT 5, 14/09/2026) nên nó quay lại. Một màn có route mà không có đường vào là một màn
 * không tồn tại với người dùng.
 *
 * KHÁC `BALANCE`: đây là tiền mình đã trả ĐI, `BALANCE` là tiền XePrime đang nợ mình. Hai thứ
 * đi hai mục với hai icon khác nhau vì gộp lại là cách chắc chắn để một người tưởng mình đã
 * được hoàn tiền khi thật ra chưa.
 */
const PAYMENTS: AccountNavItem = {
  key: 'payments',
  labelKey: 'account.payments',
  href: ROUTES.ACCOUNT.PAYMENTS,
  icon: CreditCardOutlined,
};

const CHANGE_PASSWORD: AccountNavItem = {
  key: 'changePassword',
  labelKey: 'account.changePassword',
  href: ROUTES.ACCOUNT.CHANGE_PASSWORD,
  icon: LockOutlined,
};

const DELETE_ACCOUNT: AccountNavItem = {
  key: 'deleteAccount',
  labelKey: 'account.deleteAccount',
  href: ROUTES.ACCOUNT.DELETE_ACCOUNT,
  icon: DeleteOutlined,
};

/**
 * Màn TIẾN TRÌNH ĐĂNG KÝ — toàn bộ khu chủ xe của bậc `registering`.
 *
 * Nó nằm ngoài `OWNER_NAV` có chủ đích: người đang đăng ký thấy ĐÚNG một mục này, không phải
 * bảy mục rỗng. Khi hồ sơ được duyệt và chiếc xe đầu tiên lên chợ, mục này biến mất và bảy mục
 * kia hiện ra — menu tự kể tiến trình mà không cần một băng thông báo nào.
 */
const REGISTRATION: AccountNavItem = {
  key: 'registration',
  labelKey: 'account.registration',
  href: ROUTES.ACCOUNT.REGISTRATION,
  icon: SolutionOutlined,
};

/**
 * Khu CHỦ XE — bản rút gọn của cổng quản lý cho người có ít xe (ADR 0027/0028: Owner Lite dùng
 * chung feature với `/manage`, chỉ khác vỏ). Thứ tự theo mockup 08/09/2026.
 *
 * Ba mục thêm 14/09/2026 (hộp thư, gói dịch vụ, hồ sơ chủ xe) KHÔNG phải tính năng mới: chúng
 * là bản `/account` của ba màn mà tuyến hoa hồng không còn vào `/manage` để dùng được nữa. Cắt
 * `/manage` mà không dời chúng sang đây là cắt luôn hộp thư với khách và đường mua gói.
 */
export const OWNER_NAV: readonly AccountNavItem[] = [
  {
    key: 'vehicles',
    labelKey: 'account.vehicles',
    href: ROUTES.ACCOUNT.VEHICLES,
    icon: UnorderedListOutlined,
  },
  {
    key: 'calendar',
    labelKey: 'account.calendar',
    href: ROUTES.ACCOUNT.CALENDAR,
    icon: CalendarOutlined,
  },
  TRIPS,
  // Tiền đứng ngay sau chuyến, vì chuyến là thứ sinh ra nó.
  EARNINGS,
  {
    key: 'messages',
    labelKey: 'account.messages',
    href: ROUTES.ACCOUNT.MESSAGES,
    icon: MessageOutlined,
  },
  {
    key: 'ownerProfile',
    labelKey: 'account.ownerProfile',
    href: ROUTES.ACCOUNT.REGISTRATION,
    icon: SolutionOutlined,
  },
  {
    key: 'subscription',
    labelKey: 'account.subscription',
    href: ROUTES.ACCOUNT.SUBSCRIPTION,
    icon: CrownOutlined,
  },
  {
    key: 'hostGuide',
    labelKey: 'account.hostGuide',
    href: ROUTES.ACCOUNT.HOST_GUIDE,
    icon: BookOutlined,
  },
  {
    key: 'tax',
    labelKey: 'account.tax',
    href: ROUTES.ACCOUNT.TAX,
    icon: FileTextOutlined,
  },
  {
    key: 'contractsDocuments',
    labelKey: 'account.contractsDocuments',
    href: ROUTES.ACCOUNT.CONTRACTS_DOCUMENTS,
    icon: FileProtectOutlined,
  },
  {
    key: 'dataProtection',
    labelKey: 'account.dataProtection',
    href: ROUTES.ACCOUNT.DATA_PROTECTION,
    icon: SafetyOutlined,
  },
];

/**
 * Menu của người ĐANG ĐĂNG KÝ làm chủ xe.
 *
 * "Chuyến của tôi" vẫn có mặt vì họ vẫn là khách thuê; mọi màn vận hành (lịch, khai thuế, hợp
 * đồng) thì không — chưa có xe nào trên chợ thì cả ba đều rỗng, và bày ra sáu màn trống là cách
 * chắc chắn nhất để người dùng tin rằng mình đã làm sai bước nào đó.
 */
export const OWNER_REGISTERING_NAV: readonly AccountNavItem[] = [
  REGISTRATION,
  {
    key: 'vehicles',
    labelKey: 'account.vehicles',
    href: ROUTES.ACCOUNT.VEHICLES,
    icon: UnorderedListOutlined,
  },
  TRIPS,
  /*
   * SỔ TIỀN là ngoại lệ của luật "không bày màn rỗng cho người đang đăng ký".
   *
   * Bậc `registering` không chỉ có người mới: một chủ xe từng cho thuê rồi TẠM ẨN hết xe cũng
   * tụt về đây. Bỏ mục này đi là khoá đường vào phần tiền họ ĐÃ kiếm — và ADR 0033 điều 1 nói
   * điểm không hết hạn, không bị thu hồi, nên nó cũng không được vô hình. Với người thật sự mới
   * thì màn chỉ hiện "0 điểm", một câu đúng và tự giải thích.
   */
  EARNINGS,
  {
    key: 'hostGuide',
    labelKey: 'account.hostGuide',
    href: ROUTES.ACCOUNT.HOST_GUIDE,
    icon: BookOutlined,
  },
];

/**
 * Menu TÀI KHOẢN CÁ NHÂN — phần mọi người đăng nhập đều có.
 *
 * Ba mục trong mockup 21/08 KHÔNG có ở đây, có chủ đích:
 * - **"Quản lý đơn thuê"** → đã là `/manage/bookings`; thẻ "Gian hàng của tôi" ở đầu trang hồ
 *   sơ (`ShopEntryCard`) dẫn sang.
 * - **"Ví & Ưu đãi"** → bỏ. Số dư là sổ công nợ, không phải ví điện tử (ADR 0028 điều 8,
 *   ADR 0033 điều 1). "Tài khoản nhận tiền" KHÁC hẳn: nó chỉ là nơi khai số tài khoản ngân
 *   hàng để XePrime chuyển tiền hoàn về, không phải một nơi giữ tiền.
 * - **"Tỉ lệ phản hồi / 5★"** → chỉ số của GIAN HÀNG, thuộc `/manage` và `/shops/[slug]`.
 */
export const ACCOUNT_NAV: readonly AccountNavItem[] = [
  PROFILE,
  TRIPS,
  PAYMENTS,
  BALANCE,
  BANK_ACCOUNTS,
  CHANGE_PASSWORD,
  DELETE_ACCOUNT,
];

/** Người đang đăng nhập là CHỦ gian hàng (ADR 0014: chủ xe và chủ gian hàng cùng một vai). */
export function isShopOwner(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER;
}

/**
 * Chủ xe TUYẾN HOA HỒNG — chủ gian hàng chưa mua gói (ADR 0028 điều 1: Basic owner).
 *
 * Re-export của `isCommissionTrack` ở `@xeprime/types` để nơi gọi cũ không phải đổi import; luật
 * chỉ có MỘT bản, ở package dùng chung với backend và app native.
 */
export function isCommissionOwner(user: Pick<CurrentUser, 'tenant'> | null | undefined): boolean {
  return isCommissionTrack(user?.tenant ?? null);
}

/**
 * Menu theo LOẠI người dùng **và bậc chủ xe** (`resolveOwnerStage`).
 *
 * - Chủ xe đã xong vòng đăng ký: nhóm chủ xe đầy đủ + nhóm "Tài khoản".
 * - Chủ xe ĐANG đăng ký: nhóm rút gọn đặt màn tiến trình lên đầu — không bày lịch rỗng, khai
 *   thuế rỗng, hợp đồng rỗng cho người chưa có chiếc xe nào trên chợ.
 * - Còn lại — khách thuê, và cả quản lý/nhân viên/người xem của một gian hàng (họ dùng `/manage`
 *   để làm việc, ở đây họ là một CON NGƯỜI): hồ sơ, "Trở thành chủ xe", chuyến, mật khẩu, xoá.
 *
 * "Trở thành chủ xe" đi qua `resolveOwnerCtaHref` như mọi CTA chủ xe khác: chưa có gian hàng thì
 * vào landing đăng xe; đã thuộc một gian hàng thì về đúng khu của họ — nhãn đổi theo đích để nút
 * không hứa "trở thành" với người đã ở trong một gian hàng.
 */
export function resolveAccountNav(user: CurrentUser | null | undefined): AccountNavGroup[] {
  const stage = resolveOwnerStage(user?.tenant ?? null);
  if (stage !== OWNER_STAGE.NONE) {
    return [
      {
        key: 'owner',
        items: stage === OWNER_STAGE.OWNER ? OWNER_NAV : OWNER_REGISTERING_NAV,
      },
      {
        key: 'account',
        labelKey: 'account.groupAccount',
        /*
         * Nhóm này là phần "họ là một CON NGƯỜI": tiền họ TRẢ khi đi thuê xe (`payments`), tiền
         * XePrime nợ CHÍNH HỌ (`balance` — hoàn khoản giữ chỗ), và nơi khai số tài khoản nhận
         * tiền đó. Tiền của gian hàng đi ở nhóm chủ xe (`earnings`) — hai loại tiền, hai sổ.
         */
        items: [PROFILE, PAYMENTS, BALANCE, BANK_ACCOUNTS, CHANGE_PASSWORD, DELETE_ACCOUNT],
      },
    ];
  }

  const becomeOwner: AccountNavItem = {
    key: 'becomeOwner',
    labelKey: user?.tenant ? 'public.manageShop' : 'public.becomeOwner',
    href: resolveOwnerCtaHref(user),
    icon: ShopOutlined,
    external: true,
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
 * Mục đang mở theo đường dẫn hiện tại.
 *
 * Cùng luật với `matchSelectedKey` của cổng quản lý: khớp tuyệt đối trước, không thì lấy mục
 * có `href` là tiền tố dài nhất (để `/account/vehicles/abc` vẫn sáng "Danh sách xe" và
 * `/trips/abc` sáng "Chuyến của tôi"). `/account` chỉ khớp tuyệt đối — nếu không thì mọi trang
 * con đều dính vào nó.
 */
export function matchAccountNavKey(
  pathname: string,
  items: readonly AccountNavItem[] = ACCOUNT_NAV,
): string | undefined {
  let best: AccountNavItem | undefined;
  for (const item of items) {
    const isMatch =
      pathname === item.href ||
      (item.href !== ROUTES.ACCOUNT.ROOT && pathname.startsWith(`${item.href}/`));
    if (isMatch && (!best || item.href.length > best.href.length)) best = item;
  }
  return best?.key;
}

/** Mọi mục của mọi nhóm — cho hàm khớp đường dẫn. */
export function flattenAccountNav(groups: readonly AccountNavGroup[]): AccountNavItem[] {
  return groups.flatMap((group) => [...group.items]);
}
