'use client';

import { useParams } from 'next/navigation';
import { VehicleEditPage } from '@/features/vehicles/components/VehicleEditPage';

/** Sửa xe — thân trang dùng chung với phiên hỗ trợ gian hàng (ADR 0050), xem `VehicleEditPage`. */
export default function EditVehiclePage() {
  const params = useParams<{ id: string }>();
  return <VehicleEditPage vehicleId={params.id} />;
}
