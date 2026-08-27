import type { MoneyString } from '@xeprime/types';

/**
 * Giá hiển thị trên sàn sau khuyến mãi — dùng ở cả form tạo/sửa (`60:327`) và trang chi tiết
 * (`65:240`), nên công thức chỉ được viết MỘT lần ở đây.
 *
 * Dùng cho preview phía client; `PricingService` là nguồn chốt báo giá và áp cùng công
 * thức. `public_listings` do backend dựng (ADR 0008), client không tự ghi giá đã giảm.
 *
 * Về ADR 0007 (tiền không đi qua `number`): giá VND là số nguyên đồng, và phần nguyên của
 * `Decimal(14,2)` tối đa 12 chữ số — vẫn nằm trong `Number.MAX_SAFE_INTEGER` (~9·10¹⁵), nên
 * phép nhân ở đây không mất chính xác. Phần thập phân bị bỏ có chủ đích: giá thuê xe niêm yết
 * theo đồng chẵn, hiển thị lẻ xu là nhiễu. Trả về chuỗi để đi thẳng vào `formatMoneyVnd`.
 */
export function discountedPriceVnd(
  price: MoneyString | null | undefined,
  discountPercent: number | null | undefined,
): MoneyString | null {
  if (!price || !discountPercent) return null;

  const [integerPart = '0'] = price.split('.');
  const base = Number(integerPart);
  if (!Number.isFinite(base)) return null;

  return String(Math.round((base * (100 - discountPercent)) / 100));
}
