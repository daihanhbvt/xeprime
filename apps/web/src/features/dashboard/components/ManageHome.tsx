'use client';

import { OwnerLiteHome } from '@/features/account/components/OwnerLiteHome';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { DashboardView } from './DashboardView';

/**
 * Trang chủ SITE PARTNER — MỘT URL, nội dung theo tuyến server trả (ADR 0051 điều 3, bảng B1):
 * tuyến gói → bảng điều khiển Manage; tuyến hoa hồng (kể cả `lapsed`/`unconfigured`) → trang chủ
 * Owner Lite. Tổng quan nền tảng đã sang site quản trị (`ROUTES.ADMIN.DASHBOARD`).
 *
 * `AppShell` đã chặn hai tuyến còn lại (chưa có gian hàng, chưa thanh toán gói) trước khi tới đây.
 */
export function ManageHome() {
  const { data: user } = useCurrentUser();
  return resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE ? <DashboardView /> : <OwnerLiteHome />;
}
