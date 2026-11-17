import { Redirect, useLocalSearchParams } from 'expo-router';
import { ownerPolicyHref } from '@/features/vehicle-manage/owner-edit-nav';

/**
 * Đường dẫn CŨ của không gian "Quản lý xe" Owner Lite — Thời gian giao nhận / thời gian chết (trước 03/11/2026) → "Chính sách thuê".
 * Cùng bảng chuyển hướng với web (`editTabOfLegacyManageSection`).
 */
export default function LegacyOwnerHandoverTimeRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ownerPolicyHref(id)} />;
}
