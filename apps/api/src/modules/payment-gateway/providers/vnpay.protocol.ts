import { createHmac } from 'node:crypto';
import type { ProviderOutcome } from './gateway-adapter';

/**
 * Giao thức VNPAY 2.1.0 — phần THUẦN (không mạng, không DB), đủ để test bằng vector cố định.
 *
 * Nguồn: sandbox.vnpayment.vn/apis/docs — "Thanh toán PAY" (URL thanh toán, IPN, bảng mã) và
 * "Truy vấn và hoàn tiền" (`querydr`).
 *
 *  - URL thanh toán / IPN: các tham số `vnp_*` sắp theo tên, nối `key=value` bằng `&` với khoá và giá
 *    trị URL-encode (dấu cách thành `+`, như hàm `sortObject` của mẫu Node.js chính thức), rồi
 *    HMAC-SHA512 bằng `vnp_HashSecret`, hex.
 *  - `querydr`: chuỗi các trường nối bằng `|` theo đúng thứ tự tài liệu, cùng HMAC-SHA512.
 */

export const VNPAY_VERSION = '2.1.0';
export const VNPAY_COMMAND = { PAY: 'pay', QUERY: 'querydr' } as const;
/** Mã loại hàng hoá — mẫu chính thức dùng `other` cho hàng hoá/dịch vụ không phân loại. */
export const VNPAY_ORDER_TYPE = 'other';
export const VNPAY_CURRENCY = 'VND';

/** Thành công ở cả hai cột (`vnp_ResponseCode` và `vnp_TransactionStatus`). */
export const VNPAY_CODE_SUCCESS = '00';
export const VNPAY_RESPONSE_CANCELLED = '24';
export const VNPAY_RESPONSE_TIMEOUT = '11';
/** Trừ tiền thành công nhưng giao dịch bị nghi ngờ (ResponseCode/TransactionStatus `07`). */
export const VNPAY_CODE_SUSPECTED = '07';
export const VNPAY_STATUS_INCOMPLETE = '01';
export const VNPAY_STATUS_ERROR = '02';
export const VNPAY_STATUS_REVERSED = '04';
/** `vnp_TransactionType` của giao dịch THANH TOÁN (02/03 là hoàn). */
export const VNPAY_TRANSACTION_TYPE_PAYMENT = '01';
/** `querydr`: "Không tìm thấy giao dịch yêu cầu". */
export const VNPAY_QUERY_NOT_FOUND = '91';

/**
 * `vnp_IpAddr` của lượt `querydr` — tài liệu ghi "địa chỉ IP của máy chủ thực hiện gọi API". Server
 * không biết chắc IP công khai của chính nó (sau NAT/proxy), và IP của người dùng thì sai nghĩa, nên
 * gửi loopback. Nếu merchant production bị VNPAY kiểm trường này, đổi thành IP thật của VPS ở đây.
 */
export const VNPAY_QUERY_SERVER_IP = '127.0.0.1';

/**
 * Phản hồi IPN — mã do TÀI LIỆU quy định, VNPAY đọc chúng để quyết có gọi lại không:
 * `00`/`02` dừng gọi lại; `01`/`04`/`97`/`99` (hoặc timeout) gọi lại tối đa 10 lần, cách 5 phút.
 */
export const VNPAY_IPN_RESPONSE = {
  CONFIRMED: { RspCode: '00', Message: 'Confirm Success' },
  ORDER_NOT_FOUND: { RspCode: '01', Message: 'Order not found' },
  ALREADY_CONFIRMED: { RspCode: '02', Message: 'Order already confirmed' },
  INVALID_AMOUNT: { RspCode: '04', Message: 'Invalid amount' },
  INVALID_SIGNATURE: { RspCode: '97', Message: 'Invalid signature' },
  UNKNOWN_ERROR: { RspCode: '99', Message: 'Unknown error' },
} as const;

export type VnpayIpnResponse = (typeof VNPAY_IPN_RESPONSE)[keyof typeof VNPAY_IPN_RESPONSE];

export function vnpayHmac(data: string, hashSecret: string): string {
  return createHmac('sha512', hashSecret).update(data, 'utf8').digest('hex');
}

/** URL-encode theo mẫu Node.js chính thức: `encodeURIComponent`, dấu cách thành `+`. */
export function vnpayEncode(value: string): string {
  return encodeURIComponent(value).replace(/%20/g, '+');
}

/**
 * Chuỗi ký của URL thanh toán / IPN.
 *
 * `includeEmpty` tồn tại vì hai mẫu CHÍNH THỨC của VNPAY bất đồng ở đúng một chỗ: mẫu Node.js/PHP ký
 * MỌI tham số kể cả giá trị rỗng, mẫu Java bỏ qua giá trị rỗng. Request của mình không bao giờ có giá
 * trị rỗng nên hai cách cho cùng một chuỗi; IPN thì có thể (vd `vnp_BankTranNo` của giao dịch hỏng),
 * nên bên xác minh thử cả hai — cả hai đều cần `vnp_HashSecret`, chấp nhận cả hai không mở thêm cửa
 * nào cho người không có khoá.
 */
export function vnpaySignData(params: Readonly<Record<string, string>>, includeEmpty = true): string {
  return Object.keys(params)
    .filter((key) => includeEmpty || params[key] !== '')
    .sort()
    .map((key) => `${vnpayEncode(key)}=${vnpayEncode(params[key] ?? '')}`)
    .join('&');
}

/** `yyyyMMddHHmmss` theo GMT+7 — định dạng ngày duy nhất VNPAY nhận. */
export function formatVnpayDate(date: Date): string {
  const vn = new Date(date.getTime() + 7 * 60 * 60 * 1000);
  const pad = (value: number) => String(value).padStart(2, '0');
  return (
    `${vn.getUTCFullYear()}${pad(vn.getUTCMonth() + 1)}${pad(vn.getUTCDate())}` +
    `${pad(vn.getUTCHours())}${pad(vn.getUTCMinutes())}${pad(vn.getUTCSeconds())}`
  );
}

/** Ngược của `formatVnpayDate`. Sai định dạng ⇒ `null`, không đoán. */
export function parseVnpayDate(value: string): Date | null {
  const match = /^(\d{4})(\d{2})(\d{2})(\d{2})(\d{2})(\d{2})$/.exec(value);
  if (!match) return null;
  const [, y, mo, d, h, mi, s] = match.map(Number) as [number, number, number, number, number, number, number];
  const utc = Date.UTC(y, mo - 1, d, h, mi, s) - 7 * 60 * 60 * 1000;
  return Number.isNaN(utc) ? null : new Date(utc);
}

/** Chuỗi ký request `querydr` — đúng thứ tự tài liệu. */
export function vnpayQueryRequestHashData(f: {
  requestId: string;
  version: string;
  command: string;
  tmnCode: string;
  txnRef: string;
  transactionDate: string;
  createDate: string;
  ipAddr: string;
  orderInfo: string;
}): string {
  return [
    f.requestId,
    f.version,
    f.command,
    f.tmnCode,
    f.txnRef,
    f.transactionDate,
    f.createDate,
    f.ipAddr,
    f.orderInfo,
  ].join('|');
}

/** Chuỗi ký để xác minh PHẢN HỒI `querydr` — trường vắng là chuỗi rỗng. */
export function vnpayQueryResponseHashData(raw: Readonly<Record<string, string>>): string {
  return [
    'vnp_ResponseId',
    'vnp_Command',
    'vnp_ResponseCode',
    'vnp_Message',
    'vnp_TmnCode',
    'vnp_TxnRef',
    'vnp_Amount',
    'vnp_BankCode',
    'vnp_PayDate',
    'vnp_TransactionNo',
    'vnp_TransactionType',
    'vnp_TransactionStatus',
    'vnp_OrderInfo',
    'vnp_PromotionCode',
    'vnp_PromotionAmount',
  ]
    .map((key) => raw[key] ?? '')
    .join('|');
}

/**
 * Kết cục của một giao dịch theo IPN/URL quay về (`vnp_ResponseCode` + `vnp_TransactionStatus`).
 * Thành công CHỈ khi cả hai là `00`.
 */
export function vnpayPaymentOutcome(responseCode: string, transactionStatus: string): ProviderOutcome {
  if (responseCode === VNPAY_CODE_SUCCESS && transactionStatus === VNPAY_CODE_SUCCESS) {
    return 'succeeded';
  }
  if (responseCode === VNPAY_CODE_SUSPECTED || transactionStatus === VNPAY_CODE_SUSPECTED) {
    return 'flagged';
  }
  if (transactionStatus === VNPAY_STATUS_INCOMPLETE) return 'pending';
  if (responseCode === VNPAY_RESPONSE_CANCELLED) return 'cancelled';
  if (responseCode === VNPAY_RESPONSE_TIMEOUT) return 'expired';
  return 'failed';
}

/**
 * Kết cục theo `querydr` — chỉ đọc `vnp_TransactionStatus` (lượt truy vấn đã thành công). Mã trạng
 * thái hoàn tiền (05/06/09) trên một đơn mình chưa từng hoàn là điều mình không hiểu ⇒ chưa biết.
 */
export function vnpayQueryOutcome(transactionStatus: string): ProviderOutcome {
  switch (transactionStatus) {
    case VNPAY_CODE_SUCCESS:
      return 'succeeded';
    case VNPAY_STATUS_INCOMPLETE:
      return 'pending';
    case VNPAY_STATUS_ERROR:
    case VNPAY_STATUS_REVERSED:
      return 'failed';
    case VNPAY_CODE_SUSPECTED:
      return 'flagged';
    default:
      return 'pending';
  }
}

/** `vnp_Amount` (VND × 100, chữ số) → VND nguyên; không chia hết cho 100 là dữ liệu sai ⇒ `null`. */
export function vnpayAmountToVnd(value: string): number | null {
  if (!/^\d{1,15}$/.test(value)) return null;
  const minor = Number(value);
  if (!Number.isSafeInteger(minor) || minor % 100 !== 0) return null;
  return minor / 100;
}
