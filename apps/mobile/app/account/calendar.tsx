import { RequireSession } from '@/features/auth/RequireSession';
import { CalendarScreen } from '@/features/calendar/CalendarScreen';
import { OwnerGate } from '@/features/account/components/OwnerGate';

/**
 * Lịch xe trong khu tài khoản — dùng THẲNG `CalendarScreen`, không fork.
 *
 * Chỉ đổi VỎ điều hướng (`shell="account"`: thanh trên có nút lui thay cho thanh của cổng quản
 * lý). Toàn bộ khoảng ngày, ô lịch, tấm trượt, quyền và cuộn vẫn của lịch dùng chung — y hệt cách
 * `app/(public)/account/calendar/page.tsx` bên web import `CalendarScheduler`.
 */
export default function AccountCalendarRoute() {
  return (
    <RequireSession>
      <OwnerGate>
        <CalendarScreen shell="account" />
      </OwnerGate>
    </RequireSession>
  );
}
