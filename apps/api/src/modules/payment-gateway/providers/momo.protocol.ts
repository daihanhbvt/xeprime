import { createHmac } from 'node:crypto';
import type { ProviderOutcome } from './gateway-adapter';

/**
 * Giao thức MoMo — phần THUẦN (không mạng, không DB), đủ để test bằng vector cố định.
 *
 * Nguồn: developers.momo.vn (v3) — One-Time Payments (`/v2/gateway/api/create`, `captureWallet`),
 * Payment Notification (IPN), Check Transaction Status (`/v2/gateway/api/query`), Result Codes.
 * Chuỗi ký là các cặp `key=value` nối `&` theo ĐÚNG thứ tự tài liệu (bảng chữ cái), HMAC-SHA256 bằng
 * `secretKey`, hex. Không URL-encode giá trị.
 */

/** Ví MoMo một lần (không lưu token). */
export const MOMO_REQUEST_TYPE = 'captureWallet';

export const MOMO_PATH = {
  CREATE: '/v2/gateway/api/create',
  QUERY: '/v2/gateway/api/query',
} as const;

/** `resultCode = 0` là mã DUY NHẤT nghĩa là đã thanh toán (Result Codes). */
export const MOMO_RESULT_SUCCESS = 0;
/** Khởi tạo, đang xử lý, đang xử lý phía nhà cung cấp, đã uỷ quyền chưa capture — CHƯA có tiền. */
export const MOMO_RESULT_PENDING: ReadonlySet<number> = new Set([1000, 7000, 7002, 9000]);
export const MOMO_RESULT_EXPIRED = 1005;
export const MOMO_RESULT_USER_DENIED = 1006;

export function momoSign(rawSignature: string, secretKey: string): string {
  return createHmac('sha256', secretKey).update(rawSignature, 'utf8').digest('hex');
}

/** Chuỗi ký của request tạo phiên — đúng thứ tự tài liệu. */
export function momoCreateRawSignature(f: {
  accessKey: string;
  amount: string;
  extraData: string;
  ipnUrl: string;
  orderId: string;
  orderInfo: string;
  partnerCode: string;
  redirectUrl: string;
  requestId: string;
  requestType: string;
}): string {
  return (
    `accessKey=${f.accessKey}&amount=${f.amount}&extraData=${f.extraData}&ipnUrl=${f.ipnUrl}` +
    `&orderId=${f.orderId}&orderInfo=${f.orderInfo}&partnerCode=${f.partnerCode}` +
    `&redirectUrl=${f.redirectUrl}&requestId=${f.requestId}&requestType=${f.requestType}`
  );
}

/** Chuỗi ký để XÁC MINH IPN — đúng thứ tự tài liệu. */
export function momoIpnRawSignature(f: {
  accessKey: string;
  amount: string;
  extraData: string;
  message: string;
  orderId: string;
  orderInfo: string;
  orderType: string;
  partnerCode: string;
  payType: string;
  requestId: string;
  responseTime: string;
  resultCode: string;
  transId: string;
}): string {
  return (
    `accessKey=${f.accessKey}&amount=${f.amount}&extraData=${f.extraData}&message=${f.message}` +
    `&orderId=${f.orderId}&orderInfo=${f.orderInfo}&orderType=${f.orderType}` +
    `&partnerCode=${f.partnerCode}&payType=${f.payType}&requestId=${f.requestId}` +
    `&responseTime=${f.responseTime}&resultCode=${f.resultCode}&transId=${f.transId}`
  );
}

/** Chuỗi ký của request truy vấn trạng thái. */
export function momoQueryRawSignature(f: {
  accessKey: string;
  orderId: string;
  partnerCode: string;
  requestId: string;
}): string {
  return `accessKey=${f.accessKey}&orderId=${f.orderId}&partnerCode=${f.partnerCode}&requestId=${f.requestId}`;
}

/**
 * `resultCode` → kết cục chung.
 *
 * Bất đối xứng có chủ đích giữa hai nguồn:
 *  - IPN là thông báo KẾT THÚC của một giao dịch: mã lạ nào không phải đang-chờ là thất bại.
 *  - Truy vấn có thể trả mã của chính lượt truy vấn (sai tham số, chưa có giao dịch…), không phải của
 *    giao dịch: mã lạ ⇒ CHƯA BIẾT (`pending`), không bao giờ kết luận thất bại từ một câu trả lời
 *    mình không hiểu.
 */
export function momoOutcome(resultCode: number, source: 'ipn' | 'query'): ProviderOutcome {
  if (resultCode === MOMO_RESULT_SUCCESS) return 'succeeded';
  if (MOMO_RESULT_PENDING.has(resultCode)) return 'pending';
  if (resultCode === MOMO_RESULT_EXPIRED) return 'expired';
  if (resultCode === MOMO_RESULT_USER_DENIED) return 'cancelled';
  return source === 'ipn' ? 'failed' : 'pending';
}
