'use client';

import { OWNER_STAGE } from '@xeprime/types';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { AccountVehiclesView } from '@/features/account/components/AccountVehiclesView';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { PartnerTrackView } from '@/features/partner/components/PartnerTrackView';
import { ManageVehiclesPage } from '@/features/vehicles/components/ManageVehiclesPage';

/**
 * Danh sách xe — MỘT URL hai tuyến (ADR 0051 điều 3): đội xe đầy đủ của gian hàng gói, hoặc danh
 * sách gọn của chủ xe tuyến hoa hồng (cùng `features/vehicles`, khác vỏ). Phiên hỗ trợ gian hàng
 * dùng cùng phép chọn (`SupportVehiclesRoute`).
 */
export default function Page() {
  return (
    <PartnerTrackView
      packageView={<ManageVehiclesPage />}
      commissionView={
        <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
          <Suspense fallback={<LoadingState variant="cards" />}>
            <AccountVehiclesView />
          </Suspense>
        </OwnerGate>
      }
    />
  );
}
