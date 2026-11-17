import { Redirect, useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { ownerServicesHref } from '@/features/vehicle-manage/owner-edit-nav';

/**
 * Đường dẫn CŨ của không gian "Quản lý xe" Owner Lite — "Nhận chuyến & thủ tục" tự lái → tab Tự lái của "Dịch vụ & giá" (nhận chuyến tự động nằm ở đó).
 * Cùng bảng chuyển hướng với web (`editTabOfLegacyManageSection`).
 */
export default function LegacySelfDriveOptimizationRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ownerServicesHref(id, SERVICE_TYPE.SELF_DRIVE)} />;
}
