import type { SaveSellerProfileInput, SellerProfile } from './types';

/**
 * Hồ sơ đang có → thân request `PUT /seller-profile` GIỮ NGUYÊN mọi trường.
 *
 * Endpoint lưu là PUT toàn phần: trường không gửi bị ghi thành `null`. Màn nào chỉ sửa MỘT PHẦN
 * hồ sơ (bản compact "Thông tin khai thuế" ở khu tài khoản) phải bắt đầu từ bản đầy đủ này rồi
 * ghi đè phần mình hiện — nếu không, lưu tên pháp lý sẽ xoá sạch tài khoản ngân hàng đã khai.
 */
export function profileToSaveInput(profile: SellerProfile): SaveSellerProfileInput {
  return {
    entityType: profile.entityType,
    legalName: profile.legalName,
    taxId: profile.taxId,
    idNumber: profile.idNumber,
    idIssuedAt: profile.idIssuedAt,
    idIssuedBy: profile.idIssuedBy,
    bankCode: profile.bankCode,
    bankAccountNumber: profile.bankAccountNumber,
    bankAccountName: profile.bankAccountName,
  };
}
