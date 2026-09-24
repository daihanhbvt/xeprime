import { Prisma } from '@xeprime/prisma';
import { TENANT_STATUS, VEHICLE_PUBLIC_STATUS } from '@xeprime/types';

/**
 * Điều kiện để một chiếc xe ĐƯỢC PHÉP phục vụ khách ngoài chợ — khi câu truy vấn đi thẳng vào
 * bảng `vehicles` thay vì qua `public_listings`.
 *
 * Bản song sinh của `publicListingScope()` (`modules/public-listings/listing-filter.ts`), chỉ
 * khác điểm xuất phát: cái kia lọc snapshot cho tìm kiếm/facet, cái này gác các đường đi thẳng
 * tới MỘT chiếc xe cụ thể bằng id — chi tiết xe, báo giá, khoảng cách giao xe, mở hội thoại, và
 * gửi yêu cầu thuê.
 *
 * Gom một chỗ vì đây là ranh giới an toàn, và nó đã từng là năm bản sao: khi ADR 0048 thêm trục
 * `marketplace_enabled`, bỏ sót MỘT trong năm chỗ đó nghĩa là chủ xe tắt hiển thị nhưng ai có
 * link cũ vẫn gửi được yêu cầu thuê — và gian hàng nhận một yêu cầu cho chiếc xe họ vừa cất đi.
 *
 * Bốn vế, và từng vế phải đúng cả bốn:
 *   1. xe chưa xoá mềm;
 *   2. nền tảng đã duyệt (`approved_public`) — trục KIỂM DUYỆT;
 *   3. chủ xe đang bật hiển thị (`marketplace_enabled`) — trục LỰA CHỌN (ADR 0048);
 *   4. gian hàng đang hoạt động và chưa xoá (join, KHÔNG denormalize — ADR 0008 §3).
 *
 * Nơi gọi được phép thêm vế của riêng mình (ví dụ chi tiết xe còn đòi tỉnh đang hiển thị công
 * khai) bằng cách spread kết quả này rồi bổ sung — không bao giờ bằng cách chép lại bốn vế trên.
 */
export function marketplaceVehicleWhere(): Prisma.VehicleWhereInput {
  return {
    deletedAt: null,
    publicStatus: VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
    marketplaceEnabled: true,
    tenant: { status: TENANT_STATUS.ACTIVE, deletedAt: null },
  };
}
