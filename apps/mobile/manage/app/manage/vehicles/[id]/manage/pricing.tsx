import { Redirect, useLocalSearchParams } from 'expo-router';
import { ownerServicesHref } from '@/features/vehicle-manage/owner-edit-nav';

/**
 * Đường dẫn CŨ của không gian "Quản lý xe" Owner Lite — "Giá & chính sách" (trước 03/11/2026) → "Dịch vụ & giá", tab của dịch vụ đầu tiên xe đang phục vụ.
 * Cùng bảng chuyển hướng với web (`editTabOfLegacyManageSection`).
 */
export default function LegacyOwnerPricingRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ownerServicesHref(id)} />;
}
