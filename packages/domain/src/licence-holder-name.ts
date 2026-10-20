/**
 * So họ tên in trên bằng lái với tên bên thuê đã nhập khi mời tài xế (ADR 0063). Chỉ để CẢNH BÁO
 * cho người đối chiếu — bỏ dấu, hoa/thường và khoảng trắng thừa; không bao giờ là một cổng chặn.
 */
export function normalizeHolderName(name: string): string {
  return name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toUpperCase()
    .replace(/\s+/g, ' ')
    .trim();
}

/** `true` khi cả hai tên có mặt và KHÁC nhau sau chuẩn hoá. */
export function holderNameDiffers(licenceName: string | null | undefined, invitedName: string): boolean {
  if (!licenceName || !invitedName.trim()) return false;
  return normalizeHolderName(licenceName) !== normalizeHolderName(invitedName);
}
