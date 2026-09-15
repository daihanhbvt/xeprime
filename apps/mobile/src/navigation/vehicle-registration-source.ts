/**
 * Nơi người dùng bấm vào wizard đăng xe nhanh — quyết định nút "Quay lại" và đích sau khi lưu.
 *
 * Bản native của `VEHICLE_REGISTRATION_SOURCE` bên web, cùng ba mã để deep link ánh xạ 1-1.
 *
 * Là một ENUM ĐÓNG, không phải URL tự do trong tham số: nhận URL từ tham số rồi điều hướng tới
 * đó là cách tự mở một lỗ open-redirect trên chính luồng đăng xe.
 */
export const VEHICLE_REGISTRATION_SOURCE = {
  /** Từ chợ xe / landing công khai. */
  MARKETPLACE: 'marketplace',
  /** Từ khu tài khoản của chủ xe (`/account/vehicles`). */
  ACCOUNT: 'account',
  /** Từ cổng gian hàng (`/manage/vehicles`). */
  MANAGE: 'manage',
} as const;

export type VehicleRegistrationSource =
  (typeof VEHICLE_REGISTRATION_SOURCE)[keyof typeof VEHICLE_REGISTRATION_SOURCE];

const VALUES = Object.values(VEHICLE_REGISTRATION_SOURCE) as VehicleRegistrationSource[];

export function isVehicleRegistrationSource(
  value: string | null | undefined,
): value is VehicleRegistrationSource {
  return (VALUES as string[]).includes(value ?? '');
}
