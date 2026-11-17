import { Redirect, useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { ownerPolicyHref } from '@/features/vehicle-manage/owner-edit-nav';

/**
 * Đường dẫn CŨ của không gian "Quản lý xe" Owner Lite — Thủ tục có tài xế → "Chính sách thuê", cuộn tới khối điều khoản có tài xế.
 * Cùng bảng chuyển hướng với web (`editTabOfLegacyManageSection`).
 */
export default function LegacyWithDriverTermsRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ownerPolicyHref(id, SERVICE_TYPE.WITH_DRIVER)} />;
}
