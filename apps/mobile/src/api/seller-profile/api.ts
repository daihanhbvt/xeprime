import type { components } from '@xeprime/types';
import { getApiClient } from '@xeprime/api-client';

type Schemas = components['schemas'];

/** Hồ sơ nhìn từ phía GIAN HÀNG — số tài khoản/CCCD đầy đủ, đây là dữ liệu của chính họ. */
export type SellerProfile = Schemas['SellerProfileDto'];
/** Thân request lưu hồ sơ — mọi trường optional, người bán lưu nháp dần. */
export type SaveSellerProfileInput = Schemas['SaveSellerProfileDto'];

/**
 * Hồ sơ người bán của gian hàng (ADR 0028 release gate 1).
 *
 * `TenantScoped` ở backend: `tenant_id` lấy từ membership của phiên, client KHÔNG gửi. Quyền
 * `seller_profile.view` / `seller_profile.manage` do guard backend kiểm — `usePermissions()` ở
 * màn chỉ để khỏi bày một form mà API sẽ từ chối lưu.
 */
export const sellerProfileApi = {
  /** Server tự tạo bản nháp nếu gian hàng chưa có hồ sơ nào — không có nhánh "chưa tồn tại". */
  me(): Promise<SellerProfile> {
    return getApiClient().get<SellerProfile>('/seller-profile');
  },

  /**
   * `PUT` là ghi TOÀN PHẦN: trường không gửi bị ghi thành `null`. Màn nào chỉ sửa một phần hồ sơ
   * phải bắt đầu từ `profileToSaveInput(profile)` rồi mới ghi đè phần mình hiện — nếu không, lưu
   * tên pháp lý sẽ xoá sạch tài khoản ngân hàng đã khai ở màn đầy đủ.
   */
  save(body: SaveSellerProfileInput): Promise<SellerProfile> {
    return getApiClient().put<SellerProfile>('/seller-profile', body);
  },

  /**
   * Gửi xác minh — vào hàng đợi duyệt của nền tảng.
   *
   * "Đủ điều kiện gửi" là quy tắc SERVER (`SellerProfileDto.missingFields`): client chỉ khoá nút
   * theo danh sách đó chứ không tự đoán lại, cùng lý do `PriceBreakdown` không tự cộng phí.
   */
  submit(): Promise<SellerProfile> {
    return getApiClient().post<SellerProfile>('/seller-profile/submit');
  },
};

/**
 * Hồ sơ đang có → thân request `PUT /seller-profile` GIỮ NGUYÊN mọi trường.
 *
 * Bản sao cơ học của `apps/web/src/features/seller-profile/mappers.ts` (ADR 0031: mỗi app một
 * tầng gọi API theo nghiệp vụ). Sửa một bên là phải sửa cả hai.
 */
export function profileToSaveInput(profile: SellerProfile): SaveSellerProfileInput {
  return {
    entityType: profile.entityType,
    legalName: profile.legalName,
    taxId: profile.taxId,
    idNumber: profile.idNumber,
    idIssuedAt: profile.idIssuedAt,
    idIssuedBy: profile.idIssuedBy,
    // KHÔNG còn ba trường ngân hàng (16/09/2026): tài khoản nhận tiền sống ở `bank_accounts`.
  };
}
