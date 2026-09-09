import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/**
 * Ảnh VietQR quicklink — dịch vụ công khai của VietQR, dựng từ tài khoản + số tiền + nội dung.
 *
 * MỘT công thức cho cả hai client: mã QR đi kèm `addInfo: code` là thứ SePay dùng để khớp giao
 * dịch vào đúng bản ghi (ADR 0022) — hai client sinh ra hai kiểu QR khác nhau thì cùng một
 * khoản tiền quét ra hai nội dung chuyển khoản, và một trong hai sẽ không khớp được nữa.
 *
 * Tự ghép chuỗi query bằng `encodeURIComponent` thay vì `URLSearchParams`: gói này không khai
 * `lib: dom`/`node` (đọc được cả từ Metro lẫn `tsc` thuần), và `URLSearchParams` không nằm
 * trong `lib.es*`. Không dùng `encodeQuery` của `@xeprime/api-client` vì đây là URL của MỘT
 * DỊCH VỤ NGOÀI, không phải endpoint XePrime.
 */
export function buildVietQrUrl(
  info: Schemas['HoldPaymentInfoDto'],
  amount: string,
  code: string,
): string | null {
  if (!info.configured || !info.bankCode || !info.accountNumber) return null;
  const params: Array<[string, string]> = [
    ['amount', amount],
    ['addInfo', code],
  ];
  if (info.accountName) params.push(['accountName', info.accountName]);
  /*
   * Thay `%20` bằng `+` sau khi encode: `URLSearchParams.toString()` (form-urlencoded) mã hoá
   * dấu cách bằng `+`, còn `encodeURIComponent` để nguyên `%20` — hai kiểu khác nhau, và
   * `accountName` (tên chủ tài khoản) gần như luôn có dấu cách.
   */
  const encode = (value: string) => encodeURIComponent(value).replace(/%20/g, '+');
  const query = params.map(([key, value]) => `${encode(key)}=${encode(value)}`).join('&');
  return `https://img.vietqr.io/image/${info.bankCode}-${info.accountNumber}-compact2.png?${query}`;
}
