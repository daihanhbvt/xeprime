import { VEHICLE_SOURCE_TYPE, type VehicleSourceType } from '@xeprime/types';
import type { LineIconName } from '@/components/icons/LineIcon';

/**
 * Icon của bốn hình thức nguồn xe - Figma `24238:60447` / Thêm xe MB `24486:112020`: Home 4 · Card 1 ·
 * Search 1 · Group 2. Dùng chung cho tab "Nguồn xe & tài chính" và lưới nguồn xe của wizard thêm xe.
 */
export const VEHICLE_SOURCE_ICON: Record<VehicleSourceType, LineIconName> = {
  [VEHICLE_SOURCE_TYPE.OWNED]: 'home-4',
  [VEHICLE_SOURCE_TYPE.FINANCED]: 'card-1',
  [VEHICLE_SOURCE_TYPE.RENTED]: 'search-1',
  [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: 'users-group-2',
};
