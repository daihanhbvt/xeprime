import { Redirect, useLocalSearchParams } from 'expo-router';
import { SERVICE_TYPE } from '@xeprime/types';
import { ownerPolicyHref } from '@/features/vehicle-manage/owner-edit-nav';

/**
 * Đường dẫn CŨ của không gian "Quản lý xe" Owner Lite — Thủ tục tự lái → "Chính sách thuê", cuộn tới khối điều khoản tự lái.
 * Cùng bảng chuyển hướng với web (`editTabOfLegacyManageSection`).
 */
export default function LegacySelfDriveTermsRedirect() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <Redirect href={ownerPolicyHref(id, SERVICE_TYPE.SELF_DRIVE)} />;
}
