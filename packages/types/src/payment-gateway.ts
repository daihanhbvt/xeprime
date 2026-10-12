/**
 * THANH TOÁN QUA CỔNG (MoMo · VNPAY) — ADR 0058 (Proposed).
 *
 * Cổng là phương thức BỔ SUNG bên cạnh chuyển khoản VietQR đối soát qua SePay (ADR 0016/0022),
 * không thay nó. Hai khác biệt quyết định cách mô hình hoá:
 *
 *  - Tiền qua cổng KHÔNG đi vào `bank_transactions` — bảng đó là sổ của MỘT tài khoản ngân hàng,
 *    writer duy nhất là `SepayService`. Mỗi lượt thanh toán qua cổng là MỘT dòng
 *    `payment_gateway_orders`, do `PaymentGatewayService` ghi.
 *  - Hiệu ứng tiền (cộng vào hoá đơn gói / khoản giữ chỗ, bật gói, tạo đơn thuê) đi qua ĐÚNG hai
 *    hàm mà webhook SePay đã kiểm chứng — không có đường tiền thứ hai.
 *
 * Mã đi trên dây là dữ liệu, không dịch; nhãn nằm ở namespace `Domain` của web.
 */

import { BANK_MATCH_TARGET_TYPE } from './status/billing';
import { STATUS_COLOR, type StatusMeta } from './status/meta';

/** Nhà cung cấp cổng thanh toán. */
export const PAYMENT_GATEWAY_PROVIDER = {
  MOMO: 'momo',
  VNPAY: 'vnpay',
} as const;

export type PaymentGatewayProvider =
  (typeof PAYMENT_GATEWAY_PROVIDER)[keyof typeof PAYMENT_GATEWAY_PROVIDER];

export const PAYMENT_GATEWAY_PROVIDER_VALUES = Object.values(
  PAYMENT_GATEWAY_PROVIDER,
) as PaymentGatewayProvider[];

export function isPaymentGatewayProvider(value: unknown): value is PaymentGatewayProvider {
  return (
    typeof value === 'string' && (PAYMENT_GATEWAY_PROVIDER_VALUES as string[]).includes(value)
  );
}

/**
 * Lượt thanh toán trả cho CÁI GÌ — cùng không gian giá trị với `BANK_MATCH_TARGET_TYPE` để một
 * đích có đúng một tên ở cả hai sổ (chuyển khoản lẫn cổng).
 */
export const PAYMENT_ORDER_TARGET = {
  SUBSCRIPTION_INVOICE: BANK_MATCH_TARGET_TYPE.SUBSCRIPTION_INVOICE,
  BOOKING_HOLD: BANK_MATCH_TARGET_TYPE.BOOKING_HOLD,
} as const;

export type PaymentOrderTarget = (typeof PAYMENT_ORDER_TARGET)[keyof typeof PAYMENT_ORDER_TARGET];

export const PAYMENT_ORDER_TARGET_VALUES = Object.values(
  PAYMENT_ORDER_TARGET,
) as PaymentOrderTarget[];

export function isPaymentOrderTarget(value: unknown): value is PaymentOrderTarget {
  return typeof value === 'string' && (PAYMENT_ORDER_TARGET_VALUES as string[]).includes(value);
}

/**
 * Trạng thái của lượt thanh toán THEO CỔNG — chỉ đổi khi cổng nói (IPN hoặc truy vấn phía
 * server, cả hai đã xác minh). Trình duyệt quay về KHÔNG đổi được cột này.
 *
 * `pending` ở lại cho tới khi cổng trả lời, kể cả khi đã quá `expires_at` của chính mình: khách có
 * thể đã trả tiền ở phút cuối và IPN tới trễ — tự lật `expired` theo đồng hồ là bỏ quên khoản đó.
 */
export const PAYMENT_ORDER_STATUS = {
  PENDING: 'pending',
  /** Cổng xác nhận đã thu đủ tiền (MoMo `resultCode = 0` · VNPAY `00/00`). */
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  /** Khách tự huỷ trên trang của cổng. */
  CANCELLED: 'cancelled',
  /** Cổng báo phiên thanh toán đã hết hạn. */
  EXPIRED: 'expired',
} as const;

export type PaymentOrderStatus = (typeof PAYMENT_ORDER_STATUS)[keyof typeof PAYMENT_ORDER_STATUS];

export const PAYMENT_ORDER_STATUS_VALUES = Object.values(
  PAYMENT_ORDER_STATUS,
) as PaymentOrderStatus[];

export function isPaymentOrderStatus(value: unknown): value is PaymentOrderStatus {
  return typeof value === 'string' && (PAYMENT_ORDER_STATUS_VALUES as string[]).includes(value);
}

export const PAYMENT_ORDER_STATUS_META: Readonly<Record<PaymentOrderStatus, StatusMeta>> = {
  [PAYMENT_ORDER_STATUS.PENDING]: { label: 'Chờ cổng xác nhận', color: STATUS_COLOR.WAITING },
  [PAYMENT_ORDER_STATUS.SUCCEEDED]: { label: 'Cổng đã thu tiền', color: STATUS_COLOR.SUCCESS },
  [PAYMENT_ORDER_STATUS.FAILED]: { label: 'Thất bại', color: STATUS_COLOR.DANGER },
  [PAYMENT_ORDER_STATUS.CANCELLED]: { label: 'Khách huỷ', color: STATUS_COLOR.NEUTRAL },
  [PAYMENT_ORDER_STATUS.EXPIRED]: { label: 'Hết hạn', color: STATUS_COLOR.NEUTRAL },
};

/**
 * Kết luận của lượt ÁP tiền vào đích — chỉ có sau khi cổng đã xác nhận thu tiền.
 *
 * Ba giá trị đầu là kết cục của chính hàm áp tiền dùng chung với SePay
 * (`applyBankPaymentWithinTx`); hai giá trị sau là lúc đích không còn nhận tiền.
 */
export const PAYMENT_ORDER_APPLY_OUTCOME = {
  /** Đủ tiền: gói đã bật / đơn thuê đã tạo, trong cùng transaction. */
  ACTIVATED: 'activated',
  /** Tiền đã cộng nhưng đích còn thiếu (đích đã nhận một phần từ trước bằng cách khác). */
  PARTIAL: 'partial',
  /** Đích đã đủ tiền từ trước — khoản này là tiền THỪA, đi theo luật chuyển thừa hiện hành. */
  ALREADY_PAID: 'already_paid',
  /** Đích đã đóng (hoá đơn void, khoản giữ chỗ hết hạn/huỷ) — KHÔNG kích hoạt gì, chờ người xử lý. */
  TARGET_CLOSED: 'target_closed',
  /** Không còn đích mang mã đó. */
  TARGET_NOT_FOUND: 'target_not_found',
} as const;

export type PaymentOrderApplyOutcome =
  (typeof PAYMENT_ORDER_APPLY_OUTCOME)[keyof typeof PAYMENT_ORDER_APPLY_OUTCOME];

export const PAYMENT_ORDER_APPLY_OUTCOME_VALUES = Object.values(
  PAYMENT_ORDER_APPLY_OUTCOME,
) as PaymentOrderApplyOutcome[];

/**
 * Kết cục mà khoản tiền của lượt NÀY đã vào đúng việc nó được trả cho (đủ, hoặc còn thiếu).
 *
 * `already_paid` CỐ Ý không nằm đây: đích đã đủ tiền từ trước, nên khoản này là tiền TRẢ TRÙNG.
 * Khoản giữ chỗ đã ghi yêu cầu hoàn cho chính phần thừa ⇒ người trả thấy `duplicate_refunded`; mọi
 * trường hợp khác vào hàng đợi người xử lý (`overpaid`) ⇒ người trả thấy `needs_support`.
 */
export const PAYMENT_ORDER_APPLIED_OUTCOMES: readonly PaymentOrderApplyOutcome[] = [
  PAYMENT_ORDER_APPLY_OUTCOME.ACTIVATED,
  PAYMENT_ORDER_APPLY_OUTCOME.PARTIAL,
];

/**
 * Hàng đợi NGƯỜI XỬ LÝ — trục độc lập với trạng thái cổng.
 *
 * `open` = tiền đã (hoặc có thể đã) về mà hệ thống không tự kết luận được; chỉ admin đóng được nó,
 * kèm ghi chú. Không có đường tự hoàn tiền: chính sách hoàn qua cổng chưa được quyết (ADR 0058).
 */
export const PAYMENT_ORDER_REVIEW_STATUS = {
  NONE: 'none',
  OPEN: 'open',
  RESOLVED: 'resolved',
} as const;

export type PaymentOrderReviewStatus =
  (typeof PAYMENT_ORDER_REVIEW_STATUS)[keyof typeof PAYMENT_ORDER_REVIEW_STATUS];

export const PAYMENT_ORDER_REVIEW_STATUS_VALUES = Object.values(
  PAYMENT_ORDER_REVIEW_STATUS,
) as PaymentOrderReviewStatus[];

export const PAYMENT_ORDER_REVIEW_STATUS_META: Readonly<
  Record<PaymentOrderReviewStatus, StatusMeta>
> = {
  [PAYMENT_ORDER_REVIEW_STATUS.NONE]: { label: 'Không cần xử lý', color: STATUS_COLOR.NEUTRAL },
  [PAYMENT_ORDER_REVIEW_STATUS.OPEN]: { label: 'Cần xử lý', color: STATUS_COLOR.WARNING },
  [PAYMENT_ORDER_REVIEW_STATUS.RESOLVED]: { label: 'Đã xử lý', color: STATUS_COLOR.SUCCESS },
};

/** Vì sao một lượt nằm ở hàng đợi người xử lý — máy đọc được, nhãn dịch ở web. */
export const PAYMENT_ORDER_REVIEW_REASON = {
  /** Đích đã đóng khi tiền về — tiền về muộn (ADR 0044 điều 7). */
  TARGET_CLOSED: 'target_closed',
  TARGET_NOT_FOUND: 'target_not_found',
  /** Số tiền cổng báo khác số tiền đã gửi sang cổng — không áp, không đoán. */
  AMOUNT_MISMATCH: 'amount_mismatch',
  /** Lượt áp tiền lỗi (lỗi tạm thời hoặc dữ liệu) — tiền đã về, chưa áp. */
  APPLY_FAILED: 'apply_failed',
  /** Cổng báo trừ tiền nhưng giao dịch bị nghi ngờ (VNPAY `07`). */
  PROVIDER_FLAGGED: 'provider_flagged',
  /** Cùng một mã giao dịch của cổng đã ghi trên một lượt KHÁC. */
  DUPLICATE_PROVIDER_TX: 'duplicate_provider_tx',
  /**
   * Cổng báo đã thu SAU KHI người trực đã đóng lượt này. Một đơn ở cổng là một giao dịch, nên đây gần
   * như chắc chắn là khoản người trực có thể đã hoàn tay: máy KHÔNG tự áp, lượt mở lại, và chỉ người
   * trực ghi nhận được (kèm ghi chú + audit) — ADR 0058 điều 7.
   */
  RESULT_AFTER_RESOLUTION: 'result_after_resolution',
  /**
   * Đích đã đủ tiền từ trước — khoản này là tiền TRẢ TRÙNG (vd đã chuyển khoản rồi lại trả qua cổng).
   * Hoá đơn gói chưa có cơ chế ghi có kỳ sau (ADR 0058 Q7) nên luôn vào đây. Khoản giữ chỗ chỉ vào đây
   * khi hold KHÔNG ghi được yêu cầu hoàn cho phần thừa (đã có khoản hoàn đóng từ trước); ghi được thì
   * hàng đợi hoàn của hold là chủ duy nhất.
   */
  OVERPAID: 'overpaid',
} as const;

export type PaymentOrderReviewReason =
  (typeof PAYMENT_ORDER_REVIEW_REASON)[keyof typeof PAYMENT_ORDER_REVIEW_REASON];

export const PAYMENT_ORDER_REVIEW_REASON_VALUES = Object.values(
  PAYMENT_ORDER_REVIEW_REASON,
) as PaymentOrderReviewReason[];

/**
 * Trạng thái nhìn từ phía NGƯỜI TRẢ TIỀN — server tính, client chỉ hiển thị.
 *
 * Sáu chặng, theo đúng thứ khách cần biết khi quay về từ cổng:
 *   awaiting           — chưa có kết quả từ cổng;
 *   confirming         — cổng đã xác nhận thu tiền, hệ thống đang ghi nhận vào hoá đơn/chuyến;
 *   completed          — tiền đã vào hoá đơn/chuyến;
 *   duplicate_refunded — khoản trùng với một khoản đã đủ từ trước, và yêu cầu hoàn phần thừa ĐÃ được
 *                        ghi (khoản giữ chỗ — đường hoàn chuyển thừa hiện hành); không ai cần liên hệ;
 *   failed             — không thu được tiền (thất bại / huỷ / hết hạn);
 *   needs_support      — tiền đã về nhưng không áp được (vd chuyến đã hết hạn giữ chỗ): XePrime xử lý.
 */
export const PAYMENT_ORDER_VIEW_STATE = {
  AWAITING: 'awaiting',
  CONFIRMING: 'confirming',
  COMPLETED: 'completed',
  DUPLICATE_REFUNDED: 'duplicate_refunded',
  FAILED: 'failed',
  NEEDS_SUPPORT: 'needs_support',
} as const;

export type PaymentOrderViewState =
  (typeof PAYMENT_ORDER_VIEW_STATE)[keyof typeof PAYMENT_ORDER_VIEW_STATE];

export const PAYMENT_ORDER_VIEW_STATE_VALUES = Object.values(
  PAYMENT_ORDER_VIEW_STATE,
) as PaymentOrderViewState[];

/** Chặng còn đổi được — client hỏi lại theo nhịp khi đang ở một trong hai chặng này. */
export function isPaymentOrderViewStateSettling(state: PaymentOrderViewState): boolean {
  return state === PAYMENT_ORDER_VIEW_STATE.AWAITING || state === PAYMENT_ORDER_VIEW_STATE.CONFIRMING;
}

/** Kết quả của cổng đến từ đâu — IPN (cổng gọi vào) hay truy vấn chủ động phía server. */
export const PAYMENT_ORDER_RESULT_SOURCE = {
  IPN: 'ipn',
  QUERY: 'query',
} as const;

export type PaymentOrderResultSource =
  (typeof PAYMENT_ORDER_RESULT_SOURCE)[keyof typeof PAYMENT_ORDER_RESULT_SOURCE];

export const PAYMENT_ORDER_RESULT_SOURCE_VALUES = Object.values(
  PAYMENT_ORDER_RESULT_SOURCE,
) as PaymentOrderResultSource[];

/**
 * Lượt thanh toán được mở từ đâu — quyết định trang quay về có hiện nút "Mở lại ứng dụng" không.
 * Không phải một quyền: app native và web đều dùng cùng một trang quay về (https).
 */
export const PAYMENT_GATEWAY_CLIENT = {
  WEB: 'web',
  NATIVE: 'native',
} as const;

export type PaymentGatewayClient =
  (typeof PAYMENT_GATEWAY_CLIENT)[keyof typeof PAYMENT_GATEWAY_CLIENT];

export const PAYMENT_GATEWAY_CLIENT_VALUES = Object.values(
  PAYMENT_GATEWAY_CLIENT,
) as PaymentGatewayClient[];

/** Ba góc nhìn của hàng đợi admin — `review` là việc cần làm (mặc định). */
export const PAYMENT_ORDER_QUEUE_VIEW = {
  REVIEW: 'review',
  RESOLVED: 'resolved',
  HISTORY: 'history',
} as const;

export type PaymentOrderQueueView =
  (typeof PAYMENT_ORDER_QUEUE_VIEW)[keyof typeof PAYMENT_ORDER_QUEUE_VIEW];

export const PAYMENT_ORDER_QUEUE_VIEW_VALUES = Object.values(
  PAYMENT_ORDER_QUEUE_VIEW,
) as PaymentOrderQueueView[];

export function isPaymentOrderQueueView(value: unknown): value is PaymentOrderQueueView {
  return (
    typeof value === 'string' && (PAYMENT_ORDER_QUEUE_VIEW_VALUES as string[]).includes(value)
  );
}

/**
 * Tham số trên URL trang quay về — server dựng `returnUrl` bằng chúng, web đọc lại bằng chúng.
 * Chỉ mang ID của lượt thanh toán; kết quả luôn hỏi server, không bao giờ đọc từ URL.
 */
export const PAYMENT_RETURN_PARAM = {
  /** Trang chuyến của khách: `/trips/:id?paymentOrder=<id>`. */
  TRIP_ORDER: 'paymentOrder',
  /** Trang quay về của site partner: `/payment-return?order=<id>`. */
  ORDER: 'order',
  /** Có mặt (`1`) khi lượt được mở từ app native. */
  NATIVE: 'app',
  /** Trang quay về CÔNG KHAI cho app native: `/app-return?trip=<id>&paymentOrder=<id>`. */
  NATIVE_TRIP: 'trip',
} as const;

/** Đường dẫn trang quay về của site partner, KHÔNG gồm tiền tố khu — server ghép sau `WEB_PARTNER_URL`. */
export const PARTNER_PAYMENT_RETURN_PATH = '/payment-return';

/**
 * Gốc đường dẫn trang CHUYẾN của site khách — trang quay về của tiền giữ chỗ là
 * `${APP_WEB_URL}${PAYMENT_RETURN_TRIP_PATH}/:id?paymentOrder=…`. Phải trùng `ROUTES.TRIPS` của web
 * (có test khoá).
 */
export const PAYMENT_RETURN_TRIP_PATH = '/trips';

/**
 * Trang quay về CÔNG KHAI của site khách cho lượt mở từ app native:
 * `${APP_WEB_URL}${PAYMENT_NATIVE_TRIP_RETURN_PATH}?trip=<id>&paymentOrder=<id>`.
 *
 * Vì sao không dùng trang chuyến: trình duyệt mà app mở (Custom Tab / ASWebAuthenticationSession)
 * KHÔNG có cookie phiên của site, nên `/trips/:id` kẹt ở màn "Phiên hết hạn" và không bao giờ trả
 * khách về app. Trang này không gọi API, không cần đăng nhập — chỉ điều hướng sang deep link
 * `xeprime://trips/<id>` để trình duyệt tự đóng; app tự hỏi server trạng thái lượt sau đó.
 */
export const PAYMENT_NATIVE_TRIP_RETURN_PATH = '/app-return';

/**
 * Một phiên thanh toán qua cổng sống bao lâu trước khi hệ thống mời khách mở phiên mới.
 *
 * Đây là hạn ĐỂ DÙNG LẠI liên kết, không phải hạn của tiền: VNPAY nhận `vnp_ExpireDate` bằng mốc này
 * và từ chối thanh toán sau đó; MoMo không có tham số hạn được tài liệu hoá, nên với MoMo một khoản
 * trả muộn vẫn được ghi nhận và đi qua luật tiền về muộn.
 */
export const PAYMENT_GATEWAY_ORDER_TTL_MINUTES = 15;

/**
 * Khoản giữ chỗ còn ít hơn chừng này phút thì KHÔNG mở phiên cổng: khách gần như chắc chắn trả
 * xong sau khi chỗ đã nhả, và tiền đó rơi vào hàng đợi hoàn tiền thay vì thành một chuyến.
 */
export const PAYMENT_GATEWAY_MIN_HOLD_WINDOW_MINUTES = 10;

/**
 * Hạn của phiên cổng phải KẾT THÚC TRƯỚC hạn của đích (khoản giữ chỗ, hoặc hạn chuyển khoản của hoá
 * đơn) ít nhất chừng này phút — chừa thời gian cho IPN về tới server trước khi đích đóng.
 */
export const PAYMENT_GATEWAY_EXPIRY_MARGIN_MINUTES = 2;

/**
 * Khoảng cách tối thiểu giữa hai lượt server truy vấn cổng cho CÙNG một lượt thanh toán. Truy vấn
 * do trang quay về kích hoạt — không có nhịp này, mỗi lần khách F5 là một request sang cổng.
 */
export const PAYMENT_GATEWAY_QUERY_MIN_INTERVAL_SECONDS = 20;

/**
 * Giới hạn số tiền một giao dịch theo TÀI LIỆU của cổng (VND). `null` = tài liệu không công bố —
 * hạn mức thật theo hợp đồng merchant, cổng tự từ chối trên trang của nó.
 *
 * MoMo `captureWallet`: 1.000 → 50.000.000 (developers.momo.vn — One-Time Payments).
 */
export const PAYMENT_GATEWAY_AMOUNT_LIMITS: Readonly<
  Record<PaymentGatewayProvider, { min: number | null; max: number | null }>
> = {
  [PAYMENT_GATEWAY_PROVIDER.MOMO]: { min: 1_000, max: 50_000_000 },
  [PAYMENT_GATEWAY_PROVIDER.VNPAY]: { min: null, max: null },
};

/** Nhịp web/app hỏi lại trạng thái một lượt đang chờ cổng (ms). */
export const PAYMENT_ORDER_POLL_MS = 4_000;

/** Ghi chú của người trực khi đóng / ghi nhận tay một lượt — sau khi cắt khoảng trắng. */
export const PAYMENT_ORDER_NOTE_LENGTH = { MIN: 5, MAX: 1_000 } as const;

/** Mã hoàn tiền phía cổng/ngân hàng ghi khi đóng lượt. */
export const PAYMENT_ORDER_REFUND_REFERENCE_LENGTH = { MIN: 3, MAX: 100 } as const;

/**
 * Kết quả một lượt người trực "hỏi lại cổng" — để màn hình nói đúng điều đã xảy ra thay vì luôn báo
 * thành công.
 */
export const PAYMENT_ORDER_REQUERY_OUTCOME = {
  /** Cổng trả lời và trạng thái/kết luận của lượt đã đổi. */
  CHANGED: 'changed',
  /** Cổng trả lời nhưng chưa có gì mới (vẫn đang chờ khách). */
  NO_CHANGE: 'no_change',
  /** Không hỏi được cổng (mạng, cấu hình) hoặc phản hồi không xác minh được. */
  UNREACHABLE: 'unreachable',
} as const;

export type PaymentOrderRequeryOutcome =
  (typeof PAYMENT_ORDER_REQUERY_OUTCOME)[keyof typeof PAYMENT_ORDER_REQUERY_OUTCOME];

export const PAYMENT_ORDER_REQUERY_OUTCOME_VALUES = Object.values(
  PAYMENT_ORDER_REQUERY_OUTCOME,
) as PaymentOrderRequeryOutcome[];

/**
 * Bộ QUÉT định kỳ của API (`PaymentGatewaySweeper`) — lưới an toàn khi IPN không tới và người trả
 * không quay lại trang: hỏi cổng cho lượt còn chờ, áp lại lượt đã thu mà chưa ghi nhận được.
 */
export const PAYMENT_GATEWAY_SWEEP_INTERVAL_MS = 5 * 60_000;
/** Lượt mới hơn chừng này chưa quét — trang quay về và IPN thường đã xong việc. */
export const PAYMENT_GATEWAY_SWEEP_MIN_AGE_MINUTES = 3;
/** Lượt cũ hơn chừng này thôi quét — người trực dùng "hỏi lại cổng" cho ca hiếm hơn. */
export const PAYMENT_GATEWAY_SWEEP_MAX_AGE_DAYS = 3;
/** Mỗi vòng quét tối đa chừng này lượt — một vòng chậm không được chiếm cả tiến trình API. */
export const PAYMENT_GATEWAY_SWEEP_BATCH = 50;
/**
 * Sau hạn của phiên chừng này phút mà cổng XÁC MINH rằng không có giao dịch nào (VNPAY `91`), lượt
 * được ghi là hết hạn — VNPAY tự từ chối thanh toán sau `vnp_ExpireDate`, nên không còn đường nào để
 * tiền tới.
 */
export const PAYMENT_GATEWAY_NOT_FOUND_GRACE_MINUTES = 30;
