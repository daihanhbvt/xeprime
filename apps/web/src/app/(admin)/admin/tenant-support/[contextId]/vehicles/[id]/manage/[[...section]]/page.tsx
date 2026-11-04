import { redirect } from 'next/navigation';

import { adminTenantSupportPath, editTabOfLegacyManageSection } from '@/constants/routes';

/**
 * Không gian "Quản lý xe" CŨ của chủ xe tuyến hoa hồng trong phiên hỗ trợ — chuyển tới mục tương
 * ứng của màn sửa xe dùng chung hai tuyến (03/11/2026). Phiên tự giấu mục nó không mở.
 */
export default async function SupportLegacyVehicleManagePage({
  params,
}: {
  params: Promise<{ contextId: string; id: string; section?: string[] }>;
}) {
  const { contextId, id, section } = await params;
  redirect(
    `${adminTenantSupportPath.vehicleEdit(contextId, id)}?tab=${editTabOfLegacyManageSection(section)}`,
  );
}
