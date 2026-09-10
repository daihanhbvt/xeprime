import { LIST_SEPARATOR } from './display';

/**
 * Tóm tắt cấu hình giao nhận hiển thị với khách đặt — đúng dòng preview của thiết kế.
 *
 * Hàm THUẦN: chữ và bộ định dạng tiền đi VÀO từ ngoài, nên nó nói đúng ngôn ngữ đang bật và in
 * tiền giống hệt phần còn lại của màn.
 *
 * Ở `@xeprime/domain` vì đây là NGHĨA của một chính sách giao nhận, không phải cách vẽ nó: web
 * và app native cùng phải đọc ra một câu, và hai bản chép tay là hai câu sẽ lệch nhau ở lần sửa
 * đầu tiên.
 */
export function deliverySummaryText(
  values: {
    deliveryTiers: { toKm: number | null | undefined; fee: number | null | undefined }[];
    deliveryMaxRadiusKm: number | null | undefined;
  },
  { money, free, quote }: { money: (value: string) => string; free: string; quote: string },
): string {
  const parts: string[] = [];
  let from = 0;
  for (const tier of values.deliveryTiers) {
    if (tier.toKm == null) continue;
    const fee = !tier.fee || tier.fee === 0 ? free : money(String(tier.fee));
    parts.push(`${from === 0 ? '0' : `>${from}`}–${tier.toKm} km: ${fee}`);
    from = tier.toKm;
  }
  if (values.deliveryMaxRadiusKm != null) {
    parts.push(`>${values.deliveryMaxRadiusKm} km: ${quote}`);
  }
  return parts.join(LIST_SEPARATOR);
}
