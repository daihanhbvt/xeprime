import type { Metadata } from 'next';
import { getTranslations } from 'next-intl/server';
import { CalendarPage } from '@/features/calendar/components/CalendarPage';

/** Tiêu đề tab theo ngôn ngữ của cookie `XP_LOCALE` (ADR 0012) — cùng nhãn với mục menu. */
export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations('Navigation');
  return { title: t('manage.calendar') };
}

/** Thân trang ở `src/features/calendar/components/CalendarPage`. */
export default function Page() {
  return <CalendarPage />;
}
