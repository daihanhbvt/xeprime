import { PERMISSION } from '@xeprime/types';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/shell/partner-track';

/**
 * Người này có mở được "Cài đặt gian hàng" (trang Cửa hàng) không — bản native của
 * `useShopSettingsAccess` bên web (PR #151). MỘT luật cho menu tài khoản và cho lối dẫn trong trang
 * "Tài khoản & bảo mật": có gian hàng, có `tenant.view`, và gian hàng ở TUYẾN GÓI (tuyến hoa hồng
 * không có trang Cửa hàng — hồ sơ của họ là "Hồ sơ chủ xe").
 *
 * Hỏi QUYỀN, không hỏi vai chủ: quản lý/nhân viên có `tenant.view` cũng xem được trang Cửa hàng
 * (ở chế độ chỉ đọc nếu thiếu `tenant.update`).
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
