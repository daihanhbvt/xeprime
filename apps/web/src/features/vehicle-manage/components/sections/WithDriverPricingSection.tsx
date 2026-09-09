'use client';

import { SERVICE_TYPE } from '@xeprime/types';

import { VehiclePricingSection } from './VehiclePricingSection';

/** Giá có tài xế — ba mức theo lộ trình (nội thành · liên tỉnh khứ hồi · một chiều), cùng workspace. */
export function WithDriverPricingSection() {
  return <VehiclePricingSection serviceType={SERVICE_TYPE.WITH_DRIVER} />;
}
