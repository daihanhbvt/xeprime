import { Redirect, useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { ownerServicesHref } from '@/features/vehicle-manage/owner-edit-nav';

/**
 * Đường dẫn CŨ của không gian "Quản lý xe" Owner Lite — Giá tự lái (trước 30/09/2026) → tab Tự lái của "Dịch vụ & giá".
 * Cùng bảng chuyển hướng với web (`editTabOfLegacyManageSection`).
 */
export default function LegacySelfDrivePricingRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ownerServicesHref(id, SERVICE_TYPE.SELF_DRIVE)} />;
}
