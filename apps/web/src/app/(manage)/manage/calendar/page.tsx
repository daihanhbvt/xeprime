import type { Metadata } from 'next';
import { CalendarScheduler } from '@/features/calendar/components/CalendarScheduler';

export const metadata: Metadata = { title: 'Lịch thuê xe' };

export default function CalendarPage() {
  return <CalendarScheduler />;
}
