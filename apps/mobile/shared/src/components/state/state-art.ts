import type { ImageSourcePropType } from 'react-native';

/**
 * Bộ hình trạng thái DÙNG CHUNG (Figma Xe-Prime "States Page" `22306:65271`) - PNG xuất @1x/@2x/@3x,
 * cùng bộ với `apps/web/public/states/*.webp`. Một chỗ khai, mọi màn đọc qua `ScreenMessage` /
 * `EmptyState`.
 */
export type StateKind =
  'empty' | 'no-results' | 'error' | 'not-found' | 'maintenance' | 'coming-soon';

const NO_RESULTS = require('../../../assets/images/states/no-results.png') as ImageSourcePropType;

export const STATE_ART: Readonly<Record<StateKind, ImageSourcePropType>> = {
  empty: NO_RESULTS,
  'no-results': NO_RESULTS,
  error: require('../../../assets/images/states/error.png') as ImageSourcePropType,
  'not-found': require('../../../assets/images/states/not-found.png') as ImageSourcePropType,
  maintenance: require('../../../assets/images/states/maintenance.png') as ImageSourcePropType,
  'coming-soon': require('../../../assets/images/states/coming-soon.png') as ImageSourcePropType,
};
