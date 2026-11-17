import { Redirect, useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { ownerServicesHref } from '@/features/vehicle-manage/owner-edit-nav';

/**
 * Đường dẫn CŨ của không gian "Quản lý xe" Owner Lite — Phụ phí tài xế đã gỡ (ADR 0075) → tab Có tài xế của "Dịch vụ & giá".
 * Cùng bảng chuyển hướng với web (`editTabOfLegacyManageSection`).
 */
export default function LegacyWithDriverSurchargesRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ownerServicesHref(id, SERVICE_TYPE.WITH_DRIVER)} />;
}
