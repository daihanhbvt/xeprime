import {
  SURCHARGE_CATEGORY,
  SURCHARGE_CATEGORY_VALUES,
  isSingleEntrySurchargeCategory,
  surchargeCategoryBlock,
  type SurchargeCategory,
} from '@xeprime/types';

/** Chỉ cần MÃ danh mục — nơi gọi truyền cả dòng phụ phí, hàm này không đọc gì thêm. */
interface RecordedSurcharge {
  category: string;
}

/**
 * Danh mục còn CHỌN ĐƯỢC cho một chuyến.
 *
 * Vài danh mục chỉ ghi được một lần (`SINGLE_ENTRY_SURCHARGE_CATEGORIES` — hiện là phí vượt km).
 * Chặn thật nằm ở `SettlementService` với mã `SURCHARGE_CATEGORY_DUPLICATE`; hàm này để giao diện
 * nói TRƯỚC, thay vì để người dùng đi hết biểu mẫu rồi mới ăn lỗi ở bước gửi.
 *
 * Tách khỏi component vì đây là LUẬT, không phải cách vẽ: nó kiểm được mà không phải dựng một tấm
 * trượt, và khi luật đổi thì chỉ một chỗ đổi theo.
 *
 * Đọc `isSingleEntrySurchargeCategory` chứ không chép tay danh sách — cùng hàm backend dùng để từ
 * chối. Hai danh sách là hai chỗ để chúng lệch nhau sau một lần thêm danh mục.
 *
 * Danh mục đã GỠ (chờ đợi · đường dài · qua đêm) và danh mục không áp cho loại dịch vụ của đơn (đơn
 * có tài xế không ghi quá giờ / vượt km — giá trọn gói) cũng không hiện: `surchargeCategoryBlock`
 * (ADR 0075), cùng hàm server dùng để chặn (`SURCHARGE_CATEGORY_RETIRED`,
 * `SURCHARGE_NOT_ALLOWED_WITH_DRIVER`).
 */
export function visibleSurchargeCategories(
  recorded: readonly RecordedSurcharge[],
  serviceType: string | null = null,
): readonly SurchargeCategory[] {
  const already = new Set(recorded.map((row) => row.category));
  return SURCHARGE_CATEGORY_VALUES.filter(
    (value) =>
      surchargeCategoryBlock(value, serviceType ?? '') === null &&
      !(isSingleEntrySurchargeCategory(value) && already.has(value)),
  );
}

/** Danh mục chọn sẵn khi mở tấm — quá giờ nếu còn ghi được, không thì mục đầu (như web). */
export function defaultSurchargeCategory(
  visible: readonly SurchargeCategory[],
): SurchargeCategory {
  return visible.includes(SURCHARGE_CATEGORY.OVERTIME)
    ? SURCHARGE_CATEGORY.OVERTIME
    : (visible[0] ?? SURCHARGE_CATEGORY.OTHER);
}
