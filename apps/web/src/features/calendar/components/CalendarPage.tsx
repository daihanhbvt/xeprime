import { CalendarScheduler } from './CalendarScheduler';
import styles from './CalendarPage.module.css';

/**
 * Trang lịch — shell đã khoá viewport cho đường dẫn này (AppShell), nên trang chỉ cần cột dọc
 * `min-height: 0` và để CalendarScheduler chiếm phần còn lại; vùng cuộn dọc nằm TRONG lưới.
 *
 * KHÔNG có khối tiêu đề/mô tả chiếm chỗ: breadcrumb của Topbar đã nói tên màn, còn mọi pixel dọc
 * ở màn này thuộc về LƯỚI (yêu cầu review 14/08). Tiêu đề ngữ nghĩa đã do header chung của portal
 * cung cấp, nên trang không dựng thêm `h1` ẩn gây trùng cấu trúc.
 *
 * Dùng chung bởi `/manage/calendar` và lịch của phiên hỗ trợ gian hàng (ADR 0050).
 */
export function CalendarPage() {
  return (
    <div className={styles.page}>
      <CalendarScheduler />
    </div>
  );
}
