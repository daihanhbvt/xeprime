import {
  BellOutlined,
  CarOutlined,
  CreditCardOutlined,
  EnvironmentOutlined,
  HeartOutlined,
  QuestionCircleOutlined,
  SafetyCertificateOutlined,
  SettingOutlined,
  UserOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';
import type { useTranslations } from 'next-intl';

import { ROUTES } from './routes';

/**
 * Khoá nhãn trong nhóm `Navigation.account` — union đóng lấy thẳng từ bó message tiếng Việt,
 * nên gõ sai là lỗi biên dịch chứ không phải một mục menu trống trên production.
 *
 * Hẹp hơn `NavLabelKey` của cổng quản lý (vốn phủ cả namespace `Navigation`) vì menu này chỉ
 * lấy nhãn trong đúng một nhóm — để `labelKey: 'platform.vehicles'` không lọt qua kiểu.
 */
export type AccountNavLabelKey = Parameters<
  ReturnType<typeof useTranslations<'Navigation.account'>>
>[0];

/**
 * Một mục trong menu tài khoản.
 *
 * KHÔNG có `permission`: đây là dữ liệu của chính người đang đăng nhập, không phải dữ liệu
 * của một gian hàng — không có quyền nào để kiểm. Cái quyết định thấy hay không là *đã đăng
 * nhập hay chưa*, và điều đó do layout xử lý một lần cho cả khu.
 *
 * `comingSoon` = mục đã có chỗ trong menu nhưng trang chưa dựng. Hiện ra, không bấm được, có
 * nhãn "Sắp có" — quyết định của chủ dự án: thà thấy trước bản đồ đầy đủ còn hơn menu mọc dần.
 *
 * `external` = đích nằm NGOÀI `/account` (Chuyến của tôi, Tin nhắn). Hai route đó có từ trước
 * và đang được thông báo trỏ tới; menu này chỉ dẫn sang chứ không nuốt chúng vào khu tài khoản.
 */
export interface AccountNavItem {
  readonly key: string;
  readonly labelKey: AccountNavLabelKey;
  readonly href: string;
  readonly icon: ComponentType<{ className?: string }>;
  readonly comingSoon?: boolean;
  readonly external?: boolean;
}

/**
 * Menu "Tài khoản của tôi" — thứ tự theo mockup 21/08, đã lọc theo ADR 0014.
 *
 * Ba mục trong mockup KHÔNG có ở đây, có chủ đích:
 * - **"Quản lý đơn thuê"** → đã là `/manage/bookings`. Để lại thành hai đường vào cùng một
 *   việc; thay bằng thẻ "Gian hàng của tôi" ở đầu trang (`ShopEntryCard`).
 * - **"Ví & Ưu đãi"** → bỏ. Ví giữ số dư TIỀN cần giấy phép trung gian thanh toán (ADR 0013);
 *   không dựng một khoang chờ sẵn cho thứ chưa chắc được phép làm.
 * - **Khối "Tỉ lệ phản hồi / 5★"** → là chỉ số của GIAN HÀNG (đo việc trả lời khách), thuộc
 *   `/manage` và `/shops/[slug]`. Người đi thuê không có "tỉ lệ phản hồi".
 */
export const ACCOUNT_NAV: readonly AccountNavItem[] = [
  {
    key: 'profile',
    labelKey: 'profile',
    href: ROUTES.ACCOUNT.ROOT,
    icon: UserOutlined,
  },
  {
    key: 'trips',
    labelKey: 'trips',
    href: ROUTES.TRIPS,
    icon: CarOutlined,
    external: true,
  },
  {
    key: 'payments',
    labelKey: 'payments',
    href: ROUTES.ACCOUNT.PAYMENTS,
    icon: CreditCardOutlined,
    comingSoon: true,
  },
  {
    key: 'favorites',
    labelKey: 'favorites',
    href: ROUTES.ACCOUNT.FAVORITES,
    icon: HeartOutlined,
    comingSoon: true,
  },
  {
    key: 'addresses',
    labelKey: 'addresses',
    href: ROUTES.ACCOUNT.ADDRESSES,
    icon: EnvironmentOutlined,
    comingSoon: true,
  },
  {
    key: 'documents',
    labelKey: 'documents',
    href: ROUTES.ACCOUNT.DOCUMENTS,
    icon: SafetyCertificateOutlined,
    comingSoon: true,
  },
  {
    key: 'notifications',
    labelKey: 'notifications',
    href: ROUTES.ACCOUNT.NOTIFICATIONS,
    icon: BellOutlined,
    comingSoon: true,
  },
  {
    key: 'support',
    labelKey: 'support',
    href: ROUTES.ACCOUNT.SUPPORT,
    icon: QuestionCircleOutlined,
    comingSoon: true,
  },
  {
    key: 'settings',
    labelKey: 'settings',
    href: ROUTES.ACCOUNT.SETTINGS,
    icon: SettingOutlined,
    comingSoon: true,
  },
];

/**
 * Mục đang mở theo đường dẫn hiện tại.
 *
 * Cùng luật với `matchSelectedKey` của cổng quản lý: khớp tuyệt đối trước, không thì lấy mục
 * có `href` là tiền tố dài nhất (để `/account/documents/new` vẫn sáng "Giấy tờ & Xác minh").
 * `/account` chỉ khớp tuyệt đối — nếu không thì mọi trang con đều dính vào nó.
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
