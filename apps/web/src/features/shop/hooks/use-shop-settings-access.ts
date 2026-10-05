'use client';

import { PERMISSION } from '@xeprime/types';

import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';
import { usePermissions } from '@/hooks/use-permissions';

/**
 * Người đang đăng nhập có mở được "Cài đặt gian hàng" (`/manage/shop`) không.
 *
 * Ba điều kiện, khớp với điều trang đó đòi: đang đứng trong một gian hàng, có `tenant.view`, và
 * gian hàng ở tuyến GÓI — chủ xe tuyến hoa hồng sửa mặt tiền ở Owner Lite, không có trang Cửa
 * hàng năm section. Một nơi định nghĩa, mọi lối vào (menu tài khoản, trang Tài khoản & bảo mật)
 * cùng đọc — không lối nào dẫn tới một trang 403.
 */
export function useShopSettingsAccess(): boolean {
  const { data: user } = useCurrentUser();
  const { has } = usePermissions();
  return Boolean(
    user?.tenant &&
    has(PERMISSION.TENANT_VIEW) &&
    resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE,
  );
}
