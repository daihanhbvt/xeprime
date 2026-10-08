import { OwnerLiteHomeScreen } from '@/features/account/OwnerLiteHomeScreen';
import { ShopDashboardScreen } from '@/features/dashboard/ShopDashboardScreen';
import { PartnerTrackView } from './PartnerTrackView';

/**
 * Màn đầu của khu quản lý — MỘT đường dẫn, nội dung theo TUYẾN (web `ManageHome`, ADR 0053):
 * gian hàng tuyến gói thấy Tổng quan (SHP-07), chủ xe tuyến hoa hồng thấy trang chủ Owner Lite.
 *
 * Đi qua `PartnerTrackView` để có màn chờ khi `/auth/me` chưa về — nếu không, một gian hàng gói sẽ
 * thoáng dựng trang Owner Lite (tuyến "chưa xác định" rơi vào nhánh hoa hồng) và bắn truy vấn thừa.
 *
 * Hai tuyến còn lại (chưa có gian hàng, gói chưa thanh toán) không bao giờ đứng ở đây — `ScopeGuard`
 * đã đưa họ tới màn chọn cách cho thuê / màn onboarding.
 *
 * Gian hàng chưa `active` vẫn VÀO ĐƯỢC: chặn ở cửa là giấu mất chính cái màn giải thích vì sao
 * họ bị chặn (doc 15 §4.4). Cái đổi theo trạng thái là NỘI DUNG dải trên cùng, không phải quyền vào.
 */
export function ManageHomeScreen() {
  return (
    <PartnerTrackView
      packageView={<ShopDashboardScreen />}
      commissionView={<OwnerLiteHomeScreen />}
    />
  );
}
