import type { ReactNode } from 'react';
import styles from './PageContainer.module.css';

/** `default` = trang đọc/nhập một cột · `wide` = workspace nhiều cột (xem chú thích bên dưới). */
type PageContainerWidth = 'default' | 'wide';

interface PageContainerProps {
  children: ReactNode;
  width?: PageContainerWidth;
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
 * `width="wide"` dành cho màn đã tách thành NHIỀU CỘT (menu mục + nội dung + cột xem nhanh —
 * hồ sơ xe và màn sửa xe). Lý do một cột hẹp không còn áp dụng: mỗi cột tự giới hạn bề ngang
 * của nó, nên trần 1280px chỉ bóp ba cột lại và để trống hơn 300px mỗi bên.
 *
 * Bề rộng lấy từ token (`--xp-container-max-width` / `--xp-shell-workspace-max-width`) thay vì
 * gõ số — token là nguồn duy nhất của bề rộng trang, đổi một chỗ là mọi màn đi theo.
 */
export function PageContainer({ children, width = 'default' }: PageContainerProps) {
  return (
    <div className={width === 'wide' ? `${styles.container} ${styles.wide}` : styles.container}>
      {children}
    </div>
  );
}
