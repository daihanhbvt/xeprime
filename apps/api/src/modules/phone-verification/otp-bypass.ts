import type { ConfigService } from '@nestjs/config';

/** Mã test mặc định của máy dev (`NODE_ENV=development`) khi không khai `OTP_BYPASS_CODE`. */
export const DEV_OTP_BYPASS_CODE = '123456';

/**
 * Giá trị cột `phone_verifications.provider` cho hàng sinh ra từ mã test — để phân biệt với mã
 * gửi thật và để cooldown/trần gửi/giờ KHÔNG đếm nó (nó không tốn tin nhắn nào).
 */
export const OTP_BYPASS_PROVIDER = 'bypass';

/**
 * "Triển khai production" = `NODE_ENV=production` VÀ `APP_ENV=production`. Hai điều kiện chứ
 * không một: staging cũng chạy `NODE_ENV=production` (bundle phải giống thật), còn máy dev có thể
 * để `APP_ENV=production` (giá trị mặc định của `.env.example`) mà vẫn là `NODE_ENV=development`.
 */
export function isProductionDeployment(config: ConfigService): boolean {
  return (
    config.getOrThrow<string>('NODE_ENV') === 'production' &&
    config.getOrThrow<string>('APP_ENV') === 'production'
  );
}

/**
 * Mã OTP test được chấp nhận THAY cho mã thật — gõ nó là xác thực xong, có gửi mã hay không.
 *
 *   • production: LUÔN null. `env.schema.ts` đã từ chối boot khi `OTP_BYPASS_CODE` có giá trị ở
 *     production; vế này là lớp thứ hai để không phụ thuộc vào việc luật kia còn đúng.
 *   • staging: chỉ khi khai `OTP_BYPASS_CODE` (GitHub Environment) — chạy song song với eSMS thật.
 *   • máy dev: `OTP_BYPASS_CODE`, hoặc `123456` khi không khai.
 *   • test (`NODE_ENV=test`): null trừ khi khai — spec "sai mã" không vô tình trúng mã test.
 *
 * ⚠️ Có mã test thì ai cũng xác thực được SĐT bất kỳ — chấp nhận ở staging vì nó chỉ chứa dữ liệu
 * test (cùng đánh đổi với `devCode`).
 */
export function resolveOtpBypassCode(config: ConfigService): string | null {
  if (isProductionDeployment(config)) return null;
  const configured = config.get<string>('OTP_BYPASS_CODE');
  if (configured) return configured;
  return config.get<string>('NODE_ENV') === 'development' ? DEV_OTP_BYPASS_CODE : null;
}
