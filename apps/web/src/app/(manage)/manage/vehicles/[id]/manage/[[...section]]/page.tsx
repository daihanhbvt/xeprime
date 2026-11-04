import { redirect } from 'next/navigation';

import { editTabOfLegacyManageSection, vehicleTabPath } from '@/constants/routes';

/**
 * Không gian "Quản lý xe" CŨ của chủ xe tuyến hoa hồng (`/vehicles/<id>/manage/<mục>`). Từ 03/11/2026
 * hai tuyến dùng chung màn sửa xe (sổ cái §3.6 E24) — mọi mục cũ, kể cả link trong email và
 * bookmark, chuyển tới đúng mục tương ứng. Tham số khác trên URL (vd `branchId`) đi theo.
 */
export default async function LegacyVehicleManagePage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string; section?: string[] }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { id, section } = await params;
  const query = new URLSearchParams();
  for (const [key, value] of Object.entries(await searchParams)) {
    if (key !== 'tab' && typeof value === 'string') query.set(key, value);
  }
  const extra = query.toString();
  redirect(
    `${vehicleTabPath(id, editTabOfLegacyManageSection(section))}${extra ? `&${extra}` : ''}`,
  );
}
