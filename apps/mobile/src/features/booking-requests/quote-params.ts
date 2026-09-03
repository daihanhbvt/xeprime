import { SERVICE_TYPE } from '@xeprime/types';
import type { PublicQuoteParams } from './api';

/**
 * Lựa chọn hiện tại → tham số báo giá.
 *
 * Hai hình thái, đúng hai mô hình giá: dịch vụ theo NGÀY gửi khoảng nhận–trả; THUÊ DÀI HẠN gửi
 * `packageMonths` và KHÔNG gửi ngày nào — giá gói không phụ thuộc ngày nhận (ADR 0011).
 *
 * `null` = chưa đủ dữ liệu để hỏi giá. Trả `null` thay vì gửi một câu hỏi thiếu vế: server sẽ
 * trả 400, và một lỗi đỏ cho việc "khách chưa chọn xong" là sai hoàn toàn.
 *
 * Ở module riêng vì hai nơi cần cùng câu trả lời — khối tiền dính đáy và bước Xác nhận. Hai bản
 * sao là hai dịp để chúng hỏi hai câu khác nhau rồi hiện hai con số.
 */
export function toQuoteParams(input: {
  serviceType: string;
  longTermPackageMonths?: number | null;
  pickupAt?: string;
  returnAt?: string;
  routeType?: string | null;
}): PublicQuoteParams | null {
  if (input.serviceType === SERVICE_TYPE.LONG_TERM) {
    return input.longTermPackageMonths
      ? { serviceType: SERVICE_TYPE.LONG_TERM, packageMonths: input.longTermPackageMonths }
      : null;
  }
  if (!input.pickupAt || !input.returnAt) return null;

  return {
    pickupAt: input.pickupAt,
    returnAt: input.returnAt,
    serviceType: input.serviceType,
    ...(input.routeType ? { routeType: input.routeType } : {}),
  };
}
