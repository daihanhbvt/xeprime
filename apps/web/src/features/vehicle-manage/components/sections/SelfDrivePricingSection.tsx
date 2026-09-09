'use client';

import { SERVICE_TYPE } from '@xeprime/types';

import { VehiclePricingSection } from './VehiclePricingSection';

/** Giá tự lái — một lớp mỏng quanh `VehiclePricingSection` để route trỏ tới tên rõ nghĩa. */
export function SelfDrivePricingSection() {
  return <VehiclePricingSection serviceType={SERVICE_TYPE.SELF_DRIVE} />;
}
