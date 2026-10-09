'use client';

import { OWNER_STAGE } from '@xeprime/types';

import { LoadingState } from '@/components/feedback/LoadingState';
import { OwnerDashboardView } from '@/features/dashboard/components/OwnerDashboardView';

import { useOwnerAccess } from '../hooks/use-owner-access';
import { AccountTrackNotice } from './AccountTrackNotice';
import { OwnerGate } from './OwnerGate';
import { OwnerRegistrationView } from './OwnerRegistrationView';
import styles from './OwnerLiteHome.module.css';

/**
 * TRANG CHỦ OWNER LITE — gốc site partner của chủ xe tuyến hoa hồng (bảng B1, ADR 0051 điều 3).
 *
 * Nội dung theo BẬC chủ xe (`resolveOwnerStage`), đúng như đích làm việc cũ của họ:
 *  - đang đăng ký (hồ sơ/xe đầu tiên chưa qua vòng duyệt) → màn tiến trình đăng ký;
 *  - đã có xe trên chợ → TỔNG QUAN của chủ xe (`OwnerDashboardView`): việc cần làm, lịch giao nhận,
 *    tiền, xe và uy tín. Trước 09/10/2026 đây là danh sách xe — trùng hệt mục "Xe của tôi" ngay
 *    bên dưới trên menu, nên "Tổng quan" của chủ xe cá nhân thực chất không tồn tại.
 *
 * `AccountTrackNotice` đứng đầu: với tuyến `unconfigured` (danh mục gói hỏng) đó là cảnh báo KHÔNG
 * chặn mà ADR 0038 điều 11 yêu cầu — họ vẫn làm việc bình thường, đường ghi tiền do server chặn.
 *
 * THÀNH VIÊN không phải chủ (vd nhân viên của gian hàng vừa hết gói) đi qua `OwnerGate`: bộ công cụ
 * chủ xe là của chủ, nên họ thấy lời giải thích chứ không thấy form đăng ký chủ xe.
 */
export function OwnerLiteHome() {
  const { stage, isLoading } = useOwnerAccess();

  if (isLoading) return <LoadingState variant="page" />;

  return (
    <div className={styles.stack}>
      <AccountTrackNotice />
      <OwnerGate minStage={OWNER_STAGE.REGISTERING}>
        {stage === OWNER_STAGE.OWNER ? <OwnerDashboardView /> : <OwnerRegistrationView />}
      </OwnerGate>
    </div>
  );
}
