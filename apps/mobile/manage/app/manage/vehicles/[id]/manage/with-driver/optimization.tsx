import { Redirect, useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { ownerServicesHref } from '@/features/vehicle-manage/owner-edit-nav';

/**
 * Đường dẫn CŨ của không gian "Quản lý xe" Owner Lite — "Nhận chuyến & thủ tục" có tài xế → tab Có tài xế của "Dịch vụ & giá".
 * Cùng bảng chuyển hướng với web (`editTabOfLegacyManageSection`).
 */
export default function LegacyWithDriverOptimizationRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ownerServicesHref(id, SERVICE_TYPE.WITH_DRIVER)} />;
}
