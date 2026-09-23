import {
  SURCHARGE_CATEGORY_VALUES,
  isSingleEntrySurchargeCategory,
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
 */
export function visibleSurchargeCategories(
  recorded: readonly RecordedSurcharge[],
): readonly SurchargeCategory[] {
  const already = new Set(recorded.map((row) => row.category));
  return SURCHARGE_CATEGORY_VALUES.filter(
    (value) => !(isSingleEntrySurchargeCategory(value) && already.has(value)),
  );
}
