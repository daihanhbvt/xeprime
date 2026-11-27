import {
  COLLATERAL_COMBINATION,
  HANDOVER_PREP_ITEM,
  handoverPhotoSlotsFor,
  type HandoverPhotoSlot,
  type HandoverPrepManualItem,
} from '@xeprime/types';
import { normalizeCollateral, type NormalizedCollateral } from '@xeprime/domain';
import { policyCollateral } from '@/features/rental-policies/collateral-text';
import { isNegativeMoney, isZeroMoney, subtractMoney } from '@/lib/money';
import type { BookingHandoverPrep } from '../../types';

/** Một dòng của khối "Chuẩn bị bàn giao". `confirm` luôn xong — đơn đã tồn tại là đã xác nhận. */
export type PrepKey =
  | 'confirm'
  | 'documents'
  | 'rent'
  | 'deposit'
  | 'asset'
  | 'collateralEither'
  | 'contract'
  | 'photos'
  | 'driver';

/**
 * Cọc của đơn cho khối chuẩn bị bàn giao: chính sách ĐÓNG BĂNG lúc tạo đơn (`priceSnapshot.policy`,
 * ADR 0112 điều 2 - chịu cả mã cũ `cash` / `asset`) + số món tài sản đã ghi (ADR 0109).
 * Số tiền cọc KHÔNG đọc từ snapshot: cọc tiền linh động theo đơn (`depositRequired` của server).
 */
export interface PrepCollateral {
  policy: NormalizedCollateral | null;
  /** Số món tài sản thế chấp đã ghi trên đơn (kể cả đã trả - đã nhận là đã nhận). */
  recorded: number;
}

export function prepCollateralOf(booking: {
  priceSnapshot?: { policy?: Parameters<typeof policyCollateral>[0] } | null;
  collaterals?: readonly unknown[] | null;
}): PrepCollateral {
  return {
    policy: normalizeCollateral(policyCollateral(booking.priceSnapshot?.policy ?? null)),
    recorded: booking.collaterals?.length ?? 0,
  };
}

/**
 * Việc cọc cần làm lúc giao xe:
 * - cọc tiền (số tiền của ĐƠN > 0) ⇒ `deposit` (chỉ khi gian hàng ghi sổ thu);
 * - chính sách nhận tài sản ⇒ `asset`, xong khi đã ghi ít nhất một món;
 * - cả hai + "một trong hai" ⇒ MỘT dòng `collateralEither`, xong khi một trong hai đã đủ;
 * - cả hai + "bắt buộc cả 2" ⇒ hai dòng; miễn thế chấp ⇒ không dòng nào.
 */
export type CollateralPrepPlan = 'none' | 'cash' | 'asset' | 'either' | 'both';

export function collateralPrepPlan(
  prep: Pick<BookingHandoverPrep, 'depositRequired'>,
  collateral: PrepCollateral | undefined,
): CollateralPrepPlan {
  const cash = !isZeroMoney(prep.depositRequired);
  const asset = collateral?.policy?.asset === true;
  if (cash && asset) {
    return collateral?.policy?.combination === COLLATERAL_COMBINATION.ALL ? 'both' : 'either';
  }
  if (asset) return 'asset';
  return cash ? 'cash' : 'none';
}

export type ManualCheck = BookingHandoverPrep['manualChecks'][number];

export interface PrepRowState {
  key: PrepKey;
  /** Xong theo dữ liệu thật (server suy). */
  autoDone: boolean;
  /** Việc đánh dấu tay được — hai việc TIỀN không bao giờ có (03/11/2026). */
  manualItem?: HandoverPrepManualItem;
  /** Dấu tay đang có — chỉ tính khi việc CHƯA tự xong. */
  manual: ManualCheck | null;
  done: boolean;
}

/** Phần cọc còn thiếu (không âm) — số gợi ý sẵn cho hộp thu cọc. */
export function depositOutstanding(
  prep: Pick<BookingHandoverPrep, 'depositRequired' | 'depositReceived'>,
) {
  const left = subtractMoney(prep.depositRequired, prep.depositReceived);
  return isNegativeMoney(left) ? '0' : left;
}

/** Phần cọc THU DƯ (đã thu − phải thu, không âm) - `'0'` khi chưa vượt. */
export function depositOverCollected(
  prep: Pick<BookingHandoverPrep, 'depositRequired' | 'depositReceived'>,
) {
  const over = subtractMoney(prep.depositReceived, prep.depositRequired);
  return isNegativeMoney(over) ? '0' : over;
}

/**
 * Trạng thái từng việc chuẩn bị bàn giao — MỘT nguồn cho cả khối checklist lẫn bước cảnh báo
 * "còn thiếu" khi bấm giao xe, để hai nơi không bao giờ đếm khác nhau.
 *
 * Dòng tiền chỉ có khi gian hàng ghi sổ thu (cùng cổng nút "Thu tiền"); hợp đồng khi người dùng
 * có quyền lập hợp đồng — cả chủ xe cá nhân lẫn gian hàng (SR-245); tài xế chỉ ở đơn có tài.
 */
export function prepRowStates(
  prep: BookingHandoverPrep,
  can: { collect: boolean; contract: boolean },
  collateral?: PrepCollateral,
): PrepRowState[] {
  const manualOf = (item: HandoverPrepManualItem) =>
    prep.manualChecks.find((check) => check.item === item) ?? null;
  const row = (
    key: PrepKey,
    autoDone: boolean,
    manualItem?: HandoverPrepManualItem,
  ): PrepRowState => {
    const manual = manualItem && !autoDone ? manualOf(manualItem) : null;
    return { key, autoDone, manualItem, manual, done: autoDone || manual !== null };
  };

  const plan = collateralPrepPlan(prep, collateral);
  const cashDone = isZeroMoney(depositOutstanding(prep));
  const assetDone = (collateral?.recorded ?? 0) > 0;
  const collateralRows: PrepRowState[] = [];
  if ((plan === 'cash' || plan === 'both') && can.collect) {
    collateralRows.push(row('deposit', cashDone));
  }
  if (plan === 'asset' || plan === 'both') collateralRows.push(row('asset', assetDone));
  // Một trong hai: tài sản xong được cả khi không ghi sổ thu, nên dòng luôn có.
  if (plan === 'either') collateralRows.push(row('collateralEither', cashDone || assetDone));

  return [
    row('confirm', true),
    row('documents', prep.documentsReady, HANDOVER_PREP_ITEM.DOCUMENTS),
    ...(can.collect ? [row('rent', isZeroMoney(prep.rentDueAmount))] : []),
    ...collateralRows,
    ...(can.contract
      ? [row('contract', prep.contractId !== null, HANDOVER_PREP_ITEM.CONTRACT)]
      : []),
    // Ảnh bàn giao KHÔNG đánh dấu tay (26/11/2026): chỉ xong khi biên bản đủ ảnh - cùng luật với
    // phần cảnh báo góc ảnh trống lúc bấm giao xe.
    row('photos', prep.pickupPhotoCount >= prep.pickupPhotoRequired),
    ...(prep.driverReady == null
      ? []
      : [row('driver', prep.driverReady === true, HANDOVER_PREP_ITEM.DRIVER)]),
  ];
}

/**
 * Góc ảnh bắt buộc còn trống của một biên bản (chưa có biên bản = trống cả bộ). Bộ góc theo LOẠI
 * XE (`handoverPhotoSlotsFor`): xe máy không có trái/phải, nên không bao giờ bị báo thiếu hai góc đó.
 */
export function missingPhotoSlots(
  photos: readonly { slot: string }[] | undefined,
  vehicleType: string | null | undefined,
): HandoverPhotoSlot[] {
  const filled = new Set((photos ?? []).map((photo) => photo.slot));
  return handoverPhotoSlotsFor(vehicleType).filter((slot) => !filled.has(slot));
}
