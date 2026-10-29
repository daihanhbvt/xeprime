/**
 * Công tắc TẠM ẨN tính năng ở app (cả XePrime lẫn Partner) — một chỗ để bật lại.
 *
 * Chỉ ẩn ở GIAO DIỆN app; server vẫn giữ nguyên năng lực (web không đổi). Bật lại = đổi `true` ở đây.
 */
export const APP_FEATURES = {
  /** Nút "Tiếp tục với Facebook" (người dùng chốt 28/10/2026: tạm ẩn). */
  facebookLogin: false,
  /** Tab ví điện tử MoMo/VNPAY ở màn trả tiền giữ chỗ (người dùng chốt 28/10/2026: tạm ẩn). */
  walletGateways: false,
} as const;
