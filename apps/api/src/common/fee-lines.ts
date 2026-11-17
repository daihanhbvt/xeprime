import type { CustomerFeeBreakdown, FeeLineKey } from '@xeprime/types';

/**
 * Số tiền của MỘT dòng phụ phí trong bảng phí đã đóng băng — `'0'` khi chuyến không có dòng đó
 * (tuyến gói không có `H`, chuyến không mua bảo hiểm không có `IV`/`IP`).
 *
 * Một chỗ đọc cho cả lượt tạo khoản giữ chỗ (năm cột tiền) lẫn bảng tiền của chi tiết đơn phía nền
 * tảng: hai nơi tự `find` là hai nơi có thể đọc lệch khoá dòng.
 */
export function feeLineAmount(fees: Pick<CustomerFeeBreakdown, 'lines'>, key: FeeLineKey): string {
  return fees.lines.find((line) => line.key === key)?.amount ?? '0';
}
