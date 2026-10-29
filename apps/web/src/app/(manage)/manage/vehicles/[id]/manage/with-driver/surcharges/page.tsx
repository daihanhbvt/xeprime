import { redirect } from 'next/navigation';

import { VEHICLE_MANAGE_SECTION, ownerVehicleManagePath } from '@/constants/routes';

/**
 * Đường dẫn CŨ — phụ phí tài xế đã gỡ (ADR 0075): giá có tài xế là giá trọn gói. Link cũ (bookmark,
 * thông báo) mở "Nhận chuyến & thủ tục" của dịch vụ có tài xế.
 */
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  redirect(ownerVehicleManagePath.section(id, VEHICLE_MANAGE_SECTION.WITH_DRIVER_OPTIMIZATION));
}
