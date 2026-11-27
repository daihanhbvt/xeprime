import { isZeroMoney, normalizeCollateral, type CollateralLike } from '@xeprime/domain';
import {
  CUSTOMER_TRIP_STAGE,
  FUEL_TYPE,
  TRIP_ROLE,
  serviceRequiresDriverLicence,
} from '@xeprime/types';

/**
 * Luật THUẦN của các màn chuyến phía khách theo design v2 (web PR #207) — tách khỏi component để
 * test được từng nhánh mà không dựng màn. Mọi điều kiện chép nguyên từ web; đổi ở đây nghĩa là
 * web cũng phải đổi.
 */

/** Ba màn riêng của hành trình đặt xe, tới ngày nhận xe — `TripDetailView` web (~L193). */
export const TRIP_FLOW_VIEW = {
  PENDING: 'pending',
  AWAITING_HOLD: 'awaitingHold',
  CONFIRMED: 'confirmed',
} as const;
export type TripFlowView = (typeof TRIP_FLOW_VIEW)[keyof typeof TRIP_FLOW_VIEW];

/**
 * Chặng → màn riêng, hoặc `null` = bố cục chung cũ.
 *
 * Chỉ phía KHÁCH: chủ xe mở cùng chuyến vẫn ở bố cục chung, nơi có cụm Duyệt/Từ chối của họ. Các
 * chặng sau ngày nhận xe (đang thuê, hoàn thành, kết cục hỏng) cũng vậy.
 */
export function tripFlowView(role: string, stage: string): TripFlowView | null {
  if (role === TRIP_ROLE.HOST) return null;
  if (stage === CUSTOMER_TRIP_STAGE.PENDING_APPROVAL) return TRIP_FLOW_VIEW.PENDING;
  if (stage === CUSTOMER_TRIP_STAGE.AWAITING_HOLD) return TRIP_FLOW_VIEW.AWAITING_HOLD;
  if (stage === CUSTOMER_TRIP_STAGE.READY) return TRIP_FLOW_VIEW.CONFIRMED;
  return null;
}

/**
 * Chuyến có chặng "thanh toán tiền giữ chỗ" không — `hasHoldStage` của web
 * (`lib/customer-price-view.ts`). CHƯA có bảng kê ⇒ coi như CÓ: thanh tiến trình nhảy từ 3 lên 4
 * chặng khi báo giá về là lời hứa bị rút lại giữa chừng.
 */
export function hasHoldStage(
  breakdown: { fees?: { holdAmount?: string | null } | null } | null | undefined,
): boolean {
  return breakdown ? breakdown.fees?.holdAmount != null : true;
}

/** Các mốc của một YÊU CẦU thuê, từ phía khách — ADR 0044: gửi → duyệt → giữ chỗ → xác nhận. */
export type TripRequestStep = 'sent' | 'response' | 'hold' | 'confirmed';
export type TripRequestStepState = 'done' | 'current' | 'todo';

/**
 * Các mốc của "Tiến trình yêu cầu" kèm trạng thái — `TripRequestProgress` web. Không có khoản giữ
 * chỗ thì không có mốc "Hoàn tất giữ chỗ" (ADR 0044 điều 4); mốc không có trên thanh ⇒ đứng ở mốc
 * xác nhận ngay sau nó.
 */
export function tripRequestSteps(
  current: TripRequestStep,
  withHold: boolean,
): Array<{ step: TripRequestStep; state: TripRequestStepState }> {
  const steps: TripRequestStep[] = withHold
    ? ['sent', 'response', 'hold', 'confirmed']
    : ['sent', 'response', 'confirmed'];
  const currentIndex = steps.indexOf(steps.includes(current) ? current : 'confirmed');
  return steps.map((step, index) => ({
    step,
    state: index < currentIndex ? 'done' : index === currentIndex ? 'current' : 'todo',
  }));
}

/**
 * Nút "Thanh toán giữ chỗ" chỉ mở khi khách ĐÃ tích ô xác nhận chính sách và khoản CHƯA hết hạn.
 * Ô tích là cổng của giao diện (không ghi gì lên server); cửa chặn thật là `expires_at` ở server.
 */
export function canStartHoldPayment(acknowledged: boolean, expired: boolean): boolean {
  return acknowledged && !expired;
}

/** Một mục của "Checklist nhận xe" — khoá message + tham số, component chỉ việc dịch. */
export type PickupChecklistItem =
  | { key: 'licence' }
  | { key: 'identity' }
  | { key: 'inspect'; energy: 'electric' | 'other' }
  | { key: 'sign' }
  | { key: 'deposit'; amount: string }
  | { key: 'asset'; assets: string[] }
  /** Cọc tiền + tài sản cùng bật (ADR 0112): một mục, câu `describeCollateral` nói rõ "hoặc"/"và". */
  | { key: 'collateral'; collateral: CollateralLike };

/**
 * "Checklist nhận xe" — `PickupChecklist` web: mục không áp dụng thì không vẽ ("nộp cọc 0đ" là một
 * lời dặn sai).
 *
 *  - Bằng lái chỉ khi dịch vụ cần (`serviceRequiresDriverLicence`).
 *  - Cọc TIỀN là số của ĐƠN (`finance.depositRequired`, khác 0); không có thì tài sản thế chấp của
 *    hồ sơ xe (chế độ `asset` và có ít nhất một loại).
 */
export function pickupChecklistItems(input: {
  serviceType: string;
  fuelType: string | null | undefined;
  depositRequired: string | null | undefined;
  /** Cọc của hồ sơ xe (listing) - `null` khi không có. */
  collateral:
    | {
        mode: string;
        cashEnabled?: boolean;
        assetEnabled?: boolean;
        combination?: string;
        assetTypes: readonly string[];
        depositAmount?: string;
      }
    | null
    | undefined;
}): PickupChecklistItem[] {
  const cashDeposit =
    input.depositRequired && !isZeroMoney(input.depositRequired) ? input.depositRequired : null;
  const listed = input.collateral;
  const collateralInput: CollateralLike | null = listed
    ? {
        mode: listed.mode,
        cashEnabled: listed.cashEnabled ?? null,
        assetEnabled: listed.assetEnabled ?? null,
        combination: listed.combination ?? null,
        assetTypes: listed.assetTypes,
        depositAmount: cashDeposit ?? listed.depositAmount ?? null,
      }
    : null;
  const collateral = normalizeCollateral(collateralInput);
  const assets =
    collateral?.asset && collateral.assetTypes.length > 0 ? [...collateral.assetTypes] : null;

  const items: PickupChecklistItem[] = [];
  if (serviceRequiresDriverLicence(input.serviceType)) items.push({ key: 'licence' });
  // Giấy tờ tuỳ thân là luật chuẩn nền tảng (ADR 0112 điều 3) - như nhau ở mọi xe.
  items.push({ key: 'identity' });
  items.push({
    key: 'inspect',
    energy: input.fuelType === FUEL_TYPE.ELECTRIC ? 'electric' : 'other',
  });
  items.push({ key: 'sign' });
  if (cashDeposit && assets && collateralInput) {
    items.push({ key: 'collateral', collateral: collateralInput });
  } else if (cashDeposit) items.push({ key: 'deposit', amount: cashDeposit });
  else if (assets) items.push({ key: 'asset', assets });
  return items;
}

/** Khoản trả trong bấy nhiêu phút qua thì màn thanh toán còn mở khối "Thanh toán thành công". */
export const PAYMENT_SUCCESS_FRESH_MS = 30 * 60_000;

/**
 * Khối "Thanh toán thành công" là lời báo của KHOẢNH KHẮC tiền về — `TripPaymentView` web: mở khi
 * khoản vừa được trả (trong 30 phút) hoặc khi vừa quay về từ cổng. Liên kết nhắc cũ mở lại sau
 * nhiều ngày thì chỉ còn kết cục, không chúc mừng lần hai.
 */
export function isPaymentSuccessFresh(
  paidAt: string | null | undefined,
  returnedFromGateway: boolean,
  now: number = Date.now(),
): boolean {
  const paid = paidAt ? new Date(paidAt).getTime() : null;
  return (paid != null && now - paid < PAYMENT_SUCCESS_FRESH_MS) || returnedFromGateway;
}
