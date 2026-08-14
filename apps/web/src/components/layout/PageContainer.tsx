import type { ReactNode } from 'react';
import styles from './PageContainer.module.css';

interface PageContainerProps {
  children: ReactNode;
}

/**
 * Khống chế bề rộng nội dung trang và canh giữa.
 *
 * Dùng cho các màn **đọc/nhập theo dòng** — chi tiết, thêm mới, chỉnh sửa. Ở màn 1920+ mà để
 * nội dung kéo hết bề rộng thì một hàng chữ dài cả nghìn pixel, mắt phải quét ngang quá xa và
 * hai cột form giãn ra tới mức không còn liên hệ với nhau.
 *
 * KHÔNG dùng cho danh sách: lưới thẻ và bảng có ích thật khi rộng hơn (Figma vẽ lưới xe tràn
 * hết vùng nội dung).
 *
 * Bề rộng lấy từ `--xp-container-max-width` (1280px) thay vì gõ số — token là nguồn duy nhất
 * của bề rộng trang, đổi một chỗ là mọi màn đi theo.
 */
export function PageContainer({ children }: PageContainerProps) {
  return <div className={styles.container}>{children}</div>;
}
