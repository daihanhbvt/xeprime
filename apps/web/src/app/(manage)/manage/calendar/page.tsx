import type { Metadata } from 'next';
import { CalendarScheduler } from '@/features/calendar/components/CalendarScheduler';
import styles from './calendar-page.module.css';

export const metadata: Metadata = { title: 'Lịch thuê xe' };

/**
 * Route lịch — shell đã khoá viewport cho đường dẫn này (AppShell), nên trang chỉ cần cột dọc
 * `min-height: 0` và để CalendarScheduler chiếm phần còn lại; vùng cuộn dọc nằm TRONG lưới.
 *
 * KHÔNG có khối tiêu đề/mô tả chiếm chỗ: breadcrumb của Topbar đã nói "Lịch thuê xe", còn mọi
 * pixel dọc ở màn này thuộc về LƯỚI (yêu cầu review 14/08). `<h1>` giữ cho ngữ nghĩa/SR nhưng
 * ẩn thị giác.
 */
export default function CalendarPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.srTitle}>Lịch thuê xe</h1>
      <CalendarScheduler />
    </div>
  );
}
