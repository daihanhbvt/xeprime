/**
 * Form chia TAB: đếm trường đang lỗi của từng tab từ `errors` của React Hook Form.
 *
 * Một lỗi nằm ở tab đang khuất thì nút lưu như "không làm gì" — nhãn tab phải mang số lỗi, và lượt
 * lưu hỏng phải kéo người dùng tới tab lỗi đầu tiên (`firstTabWithError`). Chỉ cần biết khoá nào có
 * mặt trong `errors`, không đọc nội dung lỗi.
 */
export function tabErrorCounts<Tab extends string, Field extends string>(
  fieldsByTab: Readonly<Record<Tab, readonly Field[]>>,
  errors: Partial<Record<Field, unknown>>,
): Record<Tab, number> {
  return Object.fromEntries(
    (Object.keys(fieldsByTab) as Tab[]).map((tab) => [
      tab,
      fieldsByTab[tab].filter((field) => errors[field] != null).length,
    ]),
  ) as Record<Tab, number>;
}

/** Tab đầu tiên (theo thứ tự đang hiện) có lỗi — `undefined` khi không tab nào lỗi. */
export function firstTabWithError<Tab extends string>(
  order: readonly Tab[],
  counts: Record<Tab, number>,
): Tab | undefined {
  return order.find((tab) => counts[tab] > 0);
}
