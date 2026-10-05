'use client';

import type { ReactNode } from 'react';

import { LoadingState } from '@/components/feedback/LoadingState';
import { PARTNER_TRACK, resolvePartnerTrack } from '@/features/auth/post-auth-destination';
import { useCurrentUser } from '@/hooks/use-current-user';

/**
 * MỘT URL, nội dung theo TUYẾN — ADR 0051 điều 3: "trang có cùng ý nghĩa ở hai tuyến dùng một URL;
 * nội dung chọn theo tuyến hiệu lực do server trả".
 *
 * Tuyến đọc từ `/auth/me` (`resolvePartnerTrack`) — cùng phép suy với menu và với đích sau đăng
 * nhập, nên ba nơi không thể trả lời khác nhau. Chỉ chọn GIAO DIỆN: quyền và tuyến tiền vẫn do
 * server quyết ở từng endpoint.
 */
export function PartnerTrackView({
  packageView,
  commissionView,
}: {
  /** Gian hàng tuyến gói — Full Manage. */
  packageView: ReactNode;
  /** Chủ xe tuyến hoa hồng — Owner Lite. */
  commissionView: ReactNode;
}) {
  const { data: user, isLoading } = useCurrentUser();
  if (isLoading || !user) return <LoadingState variant="page" />;
  return <>{resolvePartnerTrack(user) === PARTNER_TRACK.PACKAGE ? packageView : commissionView}</>;
}
