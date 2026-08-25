import { wholeUnits } from '@/lib/money';

/**
 * RANH GIỚI DUY NHẤT nơi tiền chuyển từ chuỗi sang số.
 *
 * ADR 0007 bắt tiền đi trên dây và trong mọi phép tính bằng CHUỖI. Nhưng recharts phải nhận
 * `number` để đặt chiều cao cột — không có cách nào vẽ một chuỗi. Thay vì mỗi biểu đồ tự
 * `Number(...)` một chỗ, phép quy đổi nằm gọn ở đây, có tên nói rõ nó là gì, và có test riêng.
 *
 * Ba ràng buộc để phép quy đổi này an toàn:
 *  1. Quy về **đồng nguyên** (bỏ phần lẻ) — tiền VND không có hàng xu trên giao diện.
 *  2. Trần `Decimal(14,2)` của DB là ~1e12 đồng, còn số nguyên an toàn của JS là ~9e15: mọi số
 *     tiền hợp lệ đều biểu diễn CHÍNH XÁC, không có sai số dấu phẩy động.
 *  3. Giá trị trả về CHỈ dùng để vẽ. Mọi chữ hiển thị (nhãn, tooltip, bảng) vẫn sinh từ chuỗi
 *     gốc qua `fmt.money()` — không bao giờ từ con số này.
 */
/**
 * Hình dạng một số tiền hợp lệ trên dây. Kiểm TRƯỚC khi gọi `wholeUnits` vì hàm đó ném lỗi với
 * chuỗi không phải số — và một ngoại lệ ném ra giữa lúc render sẽ giết cả trang chỉ vì một ô
 * dữ liệu hỏng. Ở đây một cột sai thà vẽ thành 0 còn hơn làm trắng màn hình.
 */
const MONEY_SHAPE = /^-?\d+(\.\d+)?$/;

export function toChartValue(money: string | null | undefined): number {
  if (!money || !MONEY_SHAPE.test(money)) return 0;
  const value = Number(wholeUnits(money));
  return Number.isFinite(value) ? value : 0;
}

/** Một điểm dữ liệu đã sẵn sàng vẽ: số để đặt hình, chuỗi gốc để hiện chữ. */
export interface ChartPoint {
  /** Khoá trục X — nhãn hiển thị do biểu đồ tự dựng từ khoá này. */
  key: string;
  values: Record<string, number>;
  raw: Record<string, string>;
}
