import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import type { ReactNode } from 'react';

import { OwnerGate } from '@/features/account/components/OwnerGate';
import { VehicleManageWorkspace } from '@/features/vehicle-manage/components/VehicleManageWorkspace';

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('VehicleManage');
  return { title: t('title'), robots: { index: false, follow: false } };
}

/**
 * Vỏ của không gian "Quản lý xe" (08/09/2026) — đặt MỘT lần cho cả 13 mục con.
 *
 * `OwnerGate` đứng ngoài để người không phải chủ gian hàng không render gì bên trong (không có
 * request tenant nào bay đi rồi 403). `VehicleManageWorkspace` là client island: tải hồ sơ xe một
 * lần, giữ nguyên qua các lần đổi mục, và F5 ở mục nào cũng dựng lại đúng mục đó từ URL.
 */
export default async function VehicleManageLayout({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  return (
    <OwnerGate>
      <VehicleManageWorkspace vehicleId={id}>{children}</VehicleManageWorkspace>
    </OwnerGate>
  );
}
