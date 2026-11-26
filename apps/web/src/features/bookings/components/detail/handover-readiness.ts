import {
  HANDOVER_PREP_ITEM,
  handoverPhotoSlotsFor,
  type HandoverPhotoSlot,
  type HandoverPrepItem,
} from '@xeprime/types';
import { isNegativeMoney, isZeroMoney, subtractMoney } from '@/lib/money';
import type { BookingHandoverPrep } from '../../types';

/** Một dòng của khối "Chuẩn bị bàn giao". `confirm` luôn xong — đơn đã tồn tại là đã xác nhận. */
export type PrepKey =
  'confirm' | 'documents' | 'rent' | 'deposit' | 'contract' | 'photos' | 'driver';

export type ManualCheck = BookingHandoverPrep['manualChecks'][number];

export interface PrepRowState {
  key: PrepKey;
  /** Xong theo dữ liệu thật (server suy). */
  autoDone: boolean;
  /** Việc đánh dấu tay được — hai việc TIỀN không bao giờ có (03/11/2026). */
  manualItem?: HandoverPrepItem;
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
): PrepRowState[] {
  const manualOf = (item: HandoverPrepItem) =>
    prep.manualChecks.find((check) => check.item === item) ?? null;
  const row = (key: PrepKey, autoDone: boolean, manualItem?: HandoverPrepItem): PrepRowState => {
    const manual = manualItem && !autoDone ? manualOf(manualItem) : null;
    return { key, autoDone, manualItem, manual, done: autoDone || manual !== null };
  };

  return [
    row('confirm', true),
    row('documents', prep.documentsReady, HANDOVER_PREP_ITEM.DOCUMENTS),
    ...(can.collect ? [row('rent', isZeroMoney(prep.rentDueAmount))] : []),
    ...(can.collect && !isZeroMoney(prep.depositRequired)
      ? [row('deposit', isZeroMoney(depositOutstanding(prep)))]
      : []),
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
