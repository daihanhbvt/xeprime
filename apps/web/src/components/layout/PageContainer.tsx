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
 * Bề rộng lấy từ `--xp-container-max-width` (1200px) thay vì gõ số — Figma dựng vùng nội dung
 * 1116px trong workspace 1180px, cùng bậc thang.
 */
export function PageContainer({ children }: PageContainerProps) {
  return <div className={styles.container}>{children}</div>;
}
