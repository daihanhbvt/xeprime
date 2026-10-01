import { redirect } from 'next/navigation';

import { VEHICLE_EDIT_TAB, vehicleTabPath } from '@/constants/routes';

/**
 * Tối ưu nhận chuyến — **đã dời vào không gian sửa xe** (29/09/2026).
 *
 * Route này ra đời ngày 17/09/2026 vì xe của gian hàng không có chỗ nào bật "Đặt ngay": thiết
 * lập đó chỉ tồn tại ở bề mặt chủ xe tuyến hoa hồng. Nay menu trái của màn sửa xe có đúng mục
 * ấy cho từng dịch vụ, nên một trang riêng là lối vào thứ hai cho cùng một công tắc.
 *
 * Chuyển hướng về mục của TỰ LÁI: xe chỉ phục vụ có-tài-xế sẽ thấy mục tự lái mờ đi và chọn
 * đúng mục của mình ngay bên dưới — vẫn tốt hơn một 404 cho link đã gửi đi.
 */
export default async function VehicleOptimizationRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(vehicleTabPath(id, VEHICLE_EDIT_TAB.SELF_DRIVE_OPTIMIZATION));
}
