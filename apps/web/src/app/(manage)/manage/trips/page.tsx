'use client';

import { OWNER_STAGE } from '@xeprime/types';
import { Suspense } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { OwnerGate } from '@/features/account/components/OwnerGate';
import { OwnerTripsView } from '@/features/trips/components/OwnerTripsView';

/**
 * Chuyến cho thuê — trang RIÊNG của CHỦ xe tuyến hoa hồng (Owner Lite): một danh sách thẻ gộp yêu
 * cầu và đơn thuê.
 *
 * Ai KHÔNG được ở đây thì `partnerPageRedirect` (AppShell) đã đưa đi trước khi trang dựng: gian hàng
 * tuyến gói và thành viên không phải chủ về hộp thư `/booking-requests` — server chỉ dựng phía chủ
 * xe của `/trips` cho CHỦ gian hàng (`CustomerTripsService.resolveScope`).
 *
 * `Suspense` bắt buộc vì `OwnerTripsView` đọc `useSearchParams` (tab + trang ở URL, ADR 0004).
 */
export default function Page() {
  return (
    <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
      <Suspense fallback={<LoadingState variant="cards" />}>
        <OwnerTripsView />
      </Suspense>
    </OwnerGate>
  );
}
