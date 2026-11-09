'use client';

import { useSearchParams } from 'next/navigation';

import { LoadingState } from '@/components/feedback/LoadingState';
import { SECTION_PARAM, shopSectionForAccountSection, shopSectionPath } from '@/constants/routes';
import {
  PARTNER_TRACK,
  isCommissionOwner,
  resolvePartnerTrack,
} from '@/features/auth/post-auth-destination';
import { ClientRedirect } from '@/features/partner/components/ClientRedirect';
import { useCurrentUser } from '@/hooks/use-current-user';

import { PartnerAccountPage } from './PartnerAccountPage';

/**
 * `/manage/account` — "Tài khoản & bảo mật" của MỌI tài khoản partner (ADR 0085 điều 2).
 *
 * Trước ADR 0085 cùng URL này là "Hồ sơ chủ xe" của chủ xe tuyến hoa hồng. Hồ sơ đó nay là trang
 * Thông tin `/shop` (cùng trang với gian hàng, mặt tiền cá nhân), nên link cũ mang section của nó —
 * `?section=address|vat-invoice|tax|plan` từ thông báo, bookmark, hay của một gian hàng hết gói rồi
 * gia hạn — chuyển sang section cùng vai của `/shop` (`shopSectionForAccountSection`).
 *
 * Chỉ người CÓ trang đó mới được chuyển: chủ gian hàng tuyến gói, hoặc CHỦ xe tuyến hoa hồng. Thành
 * viên của chủ xe cá nhân không có trang hồ sơ nào để tới — họ ở lại trang tài khoản của chính họ.
 * Tuyến đọc từ `/auth/me` mỗi lần vẽ: lên gói hay hết gói thì đích tự đổi ở lần tải kế tiếp.
 */
export function PartnerAccountRoute() {
  const { data: user, isPending } = useCurrentUser();
  const rawSection = useSearchParams().get(SECTION_PARAM);

  if (isPending) return <LoadingState variant="page" />;

  const hasProfilePage =
    resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE || isCommissionOwner(user);
  const shopSection = hasProfilePage ? shopSectionForAccountSection(rawSection) : null;
  if (shopSection) return <ClientRedirect href={shopSectionPath(shopSection)} />;

  return <PartnerAccountPage />;
}
