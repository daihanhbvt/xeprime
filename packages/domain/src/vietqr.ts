import type { components } from '@xeprime/types';

type Schemas = components['schemas'];

/**
 * Ảnh VietQR của SePay (`qr.sepay.vn`) — dựng từ tài khoản + số tiền + nội dung.
 *
 * Mã vẫn theo chuẩn VietQR/NAPAS (mọi app ngân hàng quét được, ảnh mang logo VietQR); chỉ là ảnh do
 * SePay phát, cùng nhà cung cấp đang đối soát tài khoản nhận, thay vì dịch vụ ngoài thứ hai.
 *
 * MỘT công thức cho cả hai client: mã QR đi kèm `des: code` là thứ SePay dùng để khớp giao
 * dịch vào đúng bản ghi (ADR 0022) — hai client sinh ra hai kiểu QR khác nhau thì cùng một
 * khoản tiền quét ra hai nội dung chuyển khoản, và một trong hai sẽ không khớp được nữa.
 *
 * `bank` nhận mã ngân hàng VietQR (`VCB`, `MB`…) — cùng bộ mã với `SEPAY_BANK_CODE`. Mã lạ thì
 * SePay trả về HTML chứ không phải ảnh, nên `onError` của ảnh ở client bắt được.
 *
 * Tự ghép chuỗi query bằng `encodeURIComponent` thay vì `URLSearchParams`: gói này không khai
 * `lib: dom`/`node` (đọc được cả từ Metro lẫn `tsc` thuần), và `URLSearchParams` không nằm
 * trong `lib.es*`. Không dùng `encodeQuery` của `@xeprime/api-client` vì đây là URL của MỘT
 * DỊCH VỤ NGOÀI, không phải endpoint XePrime.
 */
/**
 * NỘI DUNG chuyển khoản của một khoản — thứ in vào QR và thứ khách chép tay, LUÔN cùng một chuỗi.
 *
 * `transferPrefix` (env `SEPAY_TRANSFER_PREFIX`, vd `SEVQR`) là từ khoá ngân hàng nhận bắt buộc có
 * trong nội dung mới đẩy giao dịch sang SePay (VietinBank qua API Banking). Server đọc mã `XPG…`/
 * `XPH…` ở bất kỳ vị trí nào trong nội dung, nên tiền tố không chen vào phép đối soát.
 */
export function transferContent(
  info: Pick<Schemas['HoldPaymentInfoDto'], 'transferPrefix'> | null | undefined,
  code: string,
): string {
  const prefix = info?.transferPrefix;
  return prefix ? `${prefix} ${code}` : code;
}

export function buildVietQrUrl(
  info: Schemas['HoldPaymentInfoDto'],
  amount: string,
  code: string,
): string | null {
  if (!info.configured || !info.bankCode || !info.accountNumber) return null;
  const params: Array<[string, string]> = [
    ['acc', info.accountNumber],
    ['bank', info.bankCode],
    ['amount', amount],
    ['des', transferContent(info, code)],
    // `compact`: QR + logo VietQR/NAPAS/ngân hàng, ảnh VUÔNG 540×540.
    ['template', 'compact'],
  ];
  const query = params
    .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
    .join('&');
  return `https://qr.sepay.vn/img?${query}`;
}
