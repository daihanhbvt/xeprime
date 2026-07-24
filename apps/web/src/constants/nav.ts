import {
  CalendarOutlined,
  CarOutlined,
  DashboardOutlined,
  FileTextOutlined,
  SafetyCertificateOutlined,
  ShopOutlined,
} from '@ant-design/icons';
import type { ComponentType } from 'react';

import { PERMISSION, type Permission } from '@xeprime/types';

import { ROUTES } from './routes';

export interface NavItem {
  readonly key: string;
  readonly label: string;
  readonly href: string;
  /**
   * Permission cần có để THẤY mục này.
   *
   * Chỉ dùng để ẩn/hiện menu. Guard backend mới là thứ chặn thật (CLAUDE.md mục 6) —
   * ẩn menu không bảo vệ gì cả, người dùng gõ thẳng URL là vào.
   */
  readonly permission: Permission;
  readonly icon: ComponentType<{ className?: string }>;
}

export const MANAGE_NAV: readonly NavItem[] = [
  {
    key: 'dashboard',
    label: 'Tổng quan',
    href: ROUTES.MANAGE.ROOT,
    permission: PERMISSION.TENANT_VIEW,
    icon: DashboardOutlined,
  },
  {
    key: 'calendar',
    label: 'Lịch xe',
    href: ROUTES.MANAGE.CALENDAR,
    permission: PERMISSION.CALENDAR_VIEW,
    icon: CalendarOutlined,
  },
  {
    key: 'vehicles',
    label: 'Danh sách xe',
    href: ROUTES.MANAGE.VEHICLES,
    permission: PERMISSION.VEHICLE_VIEW,
    icon: CarOutlined,
  },
  {
    key: 'bookings',
    label: 'Đơn thuê',
    href: ROUTES.MANAGE.BOOKINGS,
    permission: PERMISSION.BOOKING_VIEW,
    icon: FileTextOutlined,
  },
  {
    key: 'shop',
    label: 'Gian hàng',
    href: ROUTES.MANAGE.SHOP,
    permission: PERMISSION.TENANT_VIEW,
    icon: ShopOutlined,
  },
  {
    key: 'admin',
    label: 'Duyệt gian hàng',
    href: ROUTES.MANAGE.ADMIN,
    permission: PERMISSION.PLATFORM_APPROVAL_REVIEW,
    icon: SafetyCertificateOutlined,
  },
];
