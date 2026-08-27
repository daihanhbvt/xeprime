/**
 * Nhãn nhận diện một chiếc xe: `Tên xe (biển số)`.
 *
 * Cùng một chuỗi này từng được ghép tay ở bốn chỗ (bảng sổ, thẻ mobile, form phiếu, drawer chi
 * tiết) — mỗi chỗ tự quyết khi thiếu biển số hay thiếu tên, nên bốn màn nói về cùng một chiếc xe
 * theo bốn cách. Ghép ở một nơi để chúng không trôi khỏi nhau.
 *
 * Thiếu cả hai → chuỗi rỗng; nơi gọi tự quyết hiển thị gạch ngang hay ẩn hẳn dòng.
 */
export function vehicleLabel(
  name: string | null | undefined,
  plateNumber: string | null | undefined,
): string {
  if (!name) return plateNumber ?? '';
  return plateNumber ? `${name} (${plateNumber})` : name;
}
