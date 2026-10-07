'use client';

import { useSearchParams } from 'next/navigation';
import { useState } from 'react';
import { PERMISSION } from '@xeprime/types';

import { LoadingState } from '@/components/feedback/LoadingState';
import {
  SECTION_PARAM,
  SHOP_SECTION,
  shopSectionForAccountSection,
  shopSectionPath,
} from '@/constants/routes';
import {
  PARTNER_TRACK,
  isCommissionOwner,
  resolvePartnerTrack,
} from '@/features/auth/post-auth-destination';
import { ClientRedirect } from '@/features/partner/components/ClientRedirect';
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
 *
 * ## Lên gói NGAY TRÊN trang này (07/10/2026)
 *
 * Luồng nâng cấp nằm ở section "Gói dịch vụ" của "Hồ sơ chủ xe". Khi webhook SePay bật gói,
 * `useSyncScopeWhenInvoiceSettles` làm mới `/auth/me` và tuyến lật sang gói — nhưng nó chỉ làm mới,
 * điều hướng là việc của nơi gọi. Không có bước này, người vừa trả tiền thấy trang "Tài khoản & bảo
 * mật" trống trơn thay cho gian hàng vừa mở. Nên: đã thấy họ là chủ xe hoa hồng trên trang này, rồi
 * tuyến thành gói ⇒ sang section "Gói & hạn mức" của trang Cửa hàng — đúng đích của trang
 * `/subscription` cũ. Cùng luật cho bookmark `?section=plan|tax|address` của một tài khoản nay đã ở
 * tuyến gói (`shopSectionForAccountSection`).
 */
export function PartnerAccountRoute() {
  const { data: user, isPending } = useCurrentUser();
  const { has } = usePermissions();
  const rawSection = useSearchParams().get(SECTION_PARAM);

  const commissionOwner = isCommissionOwner(user);
  /*
   * "Đã từng thấy chủ xe hoa hồng trên trang này" — chỉnh state ngay trong lúc render (khuôn
   * "adjusting state when a prop changes"), không `useEffect`, để lần vẽ tuyến-gói đầu tiên đã biết.
   */
  const [sawCommissionOwner, setSawCommissionOwner] = useState(false);
  if (commissionOwner && !sawCommissionOwner) setSawCommissionOwner(true);

  if (isPending) return <LoadingState variant="page" />;

  if (resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE) {
    const shopSection = sawCommissionOwner
      ? SHOP_SECTION.PLAN
      : shopSectionForAccountSection(rawSection);
    if (shopSection) return <ClientRedirect href={shopSectionPath(shopSection)} />;
  }

  return commissionOwner && has(PERMISSION.TENANT_VIEW) ? (
    <OwnerProfilePage />
  ) : (
    <PartnerAccountPage />
  );
}
