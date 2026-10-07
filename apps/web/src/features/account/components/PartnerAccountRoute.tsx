'use client';

import { PERMISSION } from '@xeprime/types';

import { LoadingState } from '@/components/feedback/LoadingState';
import { isCommissionOwner } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';

import { OwnerProfilePage } from './OwnerProfilePage';
import { PartnerAccountPage } from './PartnerAccountPage';

/**
 * `/manage/account` — MỘT URL, nội dung theo tuyến (ADR 0051 điều 3):
 *
 *  - CHỦ xe tuyến hoa hồng → "Hồ sơ chủ xe" (`OwnerProfilePage`): hồ sơ cá nhân + trang chủ xe;
 *  - mọi người khác (tuyến gói, thành viên) → "Tài khoản & bảo mật" (`PartnerAccountPage`).
 *
 * Bản "Hồ sơ chủ xe" đọc hồ sơ gian hàng (`tenant.view`). Thiếu quyền đó (vai bị chỉnh tay) thì vẫn
 * là bản thường — họ quản lý được tài khoản của mình, thay vì đứng trước một trang không tải nổi.
 *
 * Tuyến đọc từ `/auth/me` MỖI lần vẽ, nên lên gói hay hết gói thì trang tự đổi bản ở lần tải kế
 * tiếp — không có cờ nào lưu ở client để lệch khỏi server.
 */
export function PartnerAccountRoute() {
  const { data: user, isPending } = useCurrentUser();
  const { has } = usePermissions();
  if (isPending) return <LoadingState variant="page" />;
  return isCommissionOwner(user) && has(PERMISSION.TENANT_VIEW) ? (
    <OwnerProfilePage />
  ) : (
    <PartnerAccountPage />
  );
}
