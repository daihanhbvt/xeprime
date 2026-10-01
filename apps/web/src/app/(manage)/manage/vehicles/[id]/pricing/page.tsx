import { redirect } from 'next/navigation';

import { VEHICLE_EDIT_TAB, vehicleTabPath } from '@/constants/routes';

/**
 * Giá & chính sách theo XE — **màn này đã dời vào không gian sửa xe** (29/09/2026).
 *
 * Trước đợt này có HAI bản của cùng một màn: mục "Giá & chính sách" trong `/edit` và route độc
 * lập ở đây. Hai bản không chỉ là hai chỗ phải bảo trì — chúng đã LỆCH thật: bản trong tab ghim
 * cứng `canEdit = true`, còn bản ở đây đọc `vehicles.update`, nên cùng một người thiếu quyền sửa
 * thì một đường cho sửa và một đường không.
 *
 * Giữ route lại dưới dạng CHUYỂN HƯỚNG thay vì xoá: nó đã nằm trong bookmark, trong link chia sẻ
 * và trong màn "tạo xe thành công". Một 404 ở đây là mất đường đi, không phải dọn dẹp.
 */
export default async function VehiclePricingRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(vehicleTabPath(id, VEHICLE_EDIT_TAB.PRICING));
}
