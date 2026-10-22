import {
  DRIVER_LICENCE_TRIP_GATE,
  evaluateDriverLicenceForTrip,
  licenceValidThrough,
} from '@xeprime/domain';
import { DRIVER_LICENCE_STATUS, VEHICLE_TYPE } from '@xeprime/types';
import type { DriverLicence, DriverLicenceOverview } from '@/api/driver-licence/api';

/**
 * Chuyến mà bằng phải dùng được — có thì soát luôn hạng và hạn cho chuyến đó (cùng
 * `evaluateDriverLicenceForTrip` với cổng ở server), không thì chỉ cần "đã xác thực, còn hạn".
 */
export interface DriverLicenceTrip {
  vehicleType: string | null | undefined;
  /** Ngày cuối của chuyến theo giờ Việt Nam, `YYYY-MM-DD`. */
  lastDayKey: string;
}

export type TripIssue = 'expired' | 'expiredToday' | 'classMismatchCar' | 'classMismatchMotorbike';

/**
 * Màn hình của bộ xác thực — đúng hai nhánh của `DriverLicenceVerifier` bên web (ADR 0070 gỡ
 * nhánh chờ duyệt tay):
 *
 *  - `usable`  : bằng dùng được (cho chuyến này, nếu có chuyến) và khách không đang thay bằng.
 *  - `submit`  : cần nộp (lại) / đang thay bằng / máy đang đọc — CÙNG một khung.
 */
export type VerifierView =
  | { kind: 'usable'; verified: DriverLicence; rejected: DriverLicence | null }
  | {
      kind: 'submit';
      processing: DriverLicence | null;
      /** Kết quả bị từ chối cần hiện (đã lọc theo `showResult`). */
      rejected: DriverLicence | null;
      /** Bằng đã xác thực nhưng không đủ cho chuyến / đã hết hạn (đã lọc theo `showResult`). */
      tripIssue: TripIssue | null;
      verified: DriverLicence | null;
      /** Chưa có bằng nào và không bị từ chối ⇒ hiện danh sách giấy tờ được chấp nhận. */
      showAccepted: boolean;
    };

/**
 * Logic thuần của bộ xác thực — tách khỏi component để khoá bằng test, vì đây là phần dễ lệch với
 * web nhất (thứ tự các nhánh, khi nào kết quả cũ phải ẩn đi).
 *
 * `pickedOver`: khách vừa chọn ảnh MỚI khi kết quả gần nhất là lượt nộp này (`latest.id`, hoặc
 * `null` khi chưa có) — lý do bị từ chối CŨ ẩn ngay, không đứng cạnh ảnh mới đang đọc.
 */
export function resolveVerifierView(input: {
  overview: DriverLicenceOverview;
  trip?: DriverLicenceTrip | null;
  replacing: boolean;
  pickedOver: string | null | undefined;
  today: string;
}): VerifierView {
  const { overview, trip, replacing, pickedOver, today } = input;
  const { verified, latest } = overview;

  let usable: boolean;
  let tripIssue: TripIssue | null = null;
  if (trip) {
    const gate = evaluateDriverLicenceForTrip({ verified, latest }, trip);
    usable = gate === DRIVER_LICENCE_TRIP_GATE.OK;
    if (gate === DRIVER_LICENCE_TRIP_GATE.EXPIRED) tripIssue = 'expired';
    if (gate === DRIVER_LICENCE_TRIP_GATE.CLASS_MISMATCH) {
      tripIssue =
        trip.vehicleType === VEHICLE_TYPE.MOTORBIKE ? 'classMismatchMotorbike' : 'classMismatchCar';
    }
  } else {
    usable = Boolean(verified && licenceValidThrough(verified, today));
    if (verified && !usable) tripIssue = 'expiredToday';
  }

  const status = latest?.status;
  const processing = status === DRIVER_LICENCE_STATUS.PROCESSING && latest ? latest : null;
  const rejected =
    latest && status === DRIVER_LICENCE_STATUS.REJECTED && latest.id !== verified?.id
      ? latest
      : null;

  if (usable && verified && !replacing && !processing) {
    return { kind: 'usable', verified, rejected };
  }

  const showResult =
    !processing && !(pickedOver !== undefined && pickedOver === (latest?.id ?? null));
  const shownRejected = showResult ? rejected : null;
  return {
    kind: 'submit',
    processing,
    rejected: shownRejected,
    tripIssue: showResult && !shownRejected && !replacing && verified ? tripIssue : null,
    verified,
    showAccepted: !verified && !rejected,
  };
}
