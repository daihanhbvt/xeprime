/**
 * Vi phạm unique (P2002) — kể cả unique PARTIAL viết tay ở migration. Dùng khi constraint DB là
 * người gác thật của một bất biến và caller cần đổi vi phạm thành một 409 có mã ổn định thay vì
 * để bộ lọc lỗi chung trả 409 chung chung.
 *
 * Kiểm theo HÌNH (`code === 'P2002'`) chứ không `instanceof`: lỗi đi qua driver adapter, qua một
 * transaction lồng, hay từ một bản client khác trong test vẫn mang đúng mã đó, nhưng không chắc
 * là cùng một lớp.
 */
export function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' && error !== null && (error as { code?: unknown }).code === 'P2002'
  );
}
