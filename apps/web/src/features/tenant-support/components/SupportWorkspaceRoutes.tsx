'use client';

import { Suspense } from 'react';
import { SUPPORT_WORKSPACE } from '@xeprime/types';
import { LoadingState } from '@/components/feedback/LoadingState';
import { AccountVehiclesView } from '@/features/account/components/AccountVehiclesView';
import { ManageVehiclesPage } from '@/features/vehicles/components/ManageVehiclesPage';
import { useSupportSession } from '../support-session';

/**
 * Route của phiên có HAI màn gốc tuỳ bộ giao diện của gian hàng — chọn màn ở đây, không dựng
 * màn thứ ba (ADR 0050 §12). Cả hai là CHÍNH component của gian hàng; link bên trong được lớp
 * `SupportNavigationScope` giữ trong phiên.
 */
export function SupportVehiclesRoute() {
  const session = useSupportSession();
  if (session?.context.workspace === SUPPORT_WORKSPACE.MANAGE) return <ManageVehiclesPage />;
  return (
    <Suspense fallback={<LoadingState variant="cards" />}>
      <AccountVehiclesView />
    </Suspense>
  );
}
