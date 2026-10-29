import { DRIVER_WAGE_STAGE } from '@xeprime/types';

/**
 * Dòng tiền công của một chuyến — ADR 0075. XePrime chỉ GHI NHẬN số chủ xe và tài xế thoả thuận;
 * chủ xe trả trực tiếp. Hàm này quy giai đoạn tiền công của lượt gán thành MỘT dòng hiển thị.
 *
 * Ở `@xeprime/domain` vì web (thẻ/chi tiết chuyến lái, khu quản lý) và app native vẽ cùng một câu
 * từ cùng một DTO; mỗi nơi chỉ dịch `kind` (namespace `Driving.wage` / `Drivers.wage`).
 *
 *  - `offer`    chờ tài xế nhận — "Tiền công x · N ngày"
 *  - `running`  đã nhận, chuyến chưa xong — "Tiền công x"
 *  - `received` chuyến hoàn thành — "Đã nhận x" (mặc định coi là đã trả, không có nút xác nhận)
 *  - `agreed`   đã nhận nhưng không chạy, chủ xe ghi số thoả thuận — "Thoả thuận x"
 *  - `none`     đã nhận nhưng không chạy, chưa ghi gì — "Không phát sinh tiền công"
 *
 * `null` khi không có gì để hiện: lượt chưa từng được nhận, hoặc lượt gán trước tính năng.
 */
export type DriverWageLineKind = 'offer' | 'running' | 'received' | 'agreed' | 'none';

export interface DriverWageLine {
  kind: DriverWageLineKind;
  /** VND chuỗi (ADR 0007) — `'0'` ở dòng `none`. */
  amount: string;
}

export function driverWageLine(
  wage: { amount?: string | null; stage: string } | null | undefined,
): DriverWageLine | null {
  if (!wage || wage.amount == null || wage.stage === DRIVER_WAGE_STAGE.NOT_APPLICABLE) return null;
  switch (wage.stage) {
    case DRIVER_WAGE_STAGE.OFFER:
      return { kind: 'offer', amount: wage.amount };
    case DRIVER_WAGE_STAGE.RUNNING:
      return { kind: 'running', amount: wage.amount };
    case DRIVER_WAGE_STAGE.COMPLETED:
      return { kind: 'received', amount: wage.amount };
    case DRIVER_WAGE_STAGE.NOT_RUN:
      return Number(wage.amount) > 0
        ? { kind: 'agreed', amount: wage.amount }
        : { kind: 'none', amount: '0' };
    default:
      return null;
  }
}
