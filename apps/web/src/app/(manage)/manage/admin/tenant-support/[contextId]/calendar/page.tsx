import { SUPPORT_CAPABILITY } from '@xeprime/types';
import { CalendarPage } from '@/features/calendar/components/CalendarPage';
import { SupportRoute } from '@/features/tenant-support/components/SupportWorkspaceGate';

/** Lịch xe — CHÍNH `CalendarPage` (Full Manage và Owner Lite dùng chung `CalendarScheduler`). */
export default function Page() {
  return (
    <SupportRoute requires={SUPPORT_CAPABILITY.CALENDAR_VIEW}>
      <CalendarPage />
    </SupportRoute>
  );
}
