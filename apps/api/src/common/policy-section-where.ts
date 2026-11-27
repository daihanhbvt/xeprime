import type { Prisma } from '@xeprime/prisma';
import type { PolicySection } from '@xeprime/types';

/**
 * Vị từ Prisma "xe đang KẾ THỪA mục chính sách này của gian hàng" (ADR 0112 điều 1): không có dòng
 * `rental_policies` riêng, hoặc có dòng mà mục nằm trong `inherited_sections`. Dùng cho các lượt
 * đồng bộ hàng loạt khi gian hàng sửa mặc định - cùng luật với `policySectionInherited`.
 */
export function vehicleInheritsSectionWhere(section: PolicySection): Prisma.VehicleWhereInput {
  return {
    OR: [
      { rentalPolicy: { is: null } },
      { rentalPolicy: { is: { inheritedSections: { has: section } } } },
    ],
  };
}
