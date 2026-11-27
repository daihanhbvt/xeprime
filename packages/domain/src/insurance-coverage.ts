/**
 * Phạm vi bảo vệ của một sản phẩm bảo hiểm (`insurance_products.coverage_*`) là CHỮ THƯỜNG, mỗi
 * dòng một mục - admin sửa bằng danh sách mục, app và trang /insurance đọc nguyên văn, snapshot
 * trên đơn giữ nguyên văn. Đây là phép tách DUY NHẤT dòng → mục cho web, app và API (chuẩn hoá lúc
 * lưu), để "một mục" có cùng nghĩa ở mọi nơi.
 */

/** Các mục phạm vi: bỏ khoảng trắng hai đầu, bỏ dòng trống, bỏ gạch đầu dòng gõ tay (`-`, `•`). */
export function insuranceCoverageItems(text: string | null | undefined): string[] {
  if (!text) return [];
  return text
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*[-•*]\s+/, '').trim())
    .filter((line) => line.length > 0);
}

/** Dạng lưu chuẩn của danh sách mục - mỗi mục một dòng, không dòng trống. */
export function joinInsuranceCoverageItems(items: readonly string[]): string {
  return insuranceCoverageItems(items.join('\n')).join('\n');
}
