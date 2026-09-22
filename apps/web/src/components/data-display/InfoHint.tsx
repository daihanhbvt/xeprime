'use client';

import { InfoCircleOutlined } from '@ant-design/icons';
import { Tooltip } from 'antd';
import { useId, type ReactNode } from 'react';
import styles from './InfoHint.module.css';

/**
 * Dấu "i" mở một lời giải thích BỔ SUNG, đứng cạnh thứ nó giải thích.
 *
 * Vì sao là một component dùng chung chứ không phải `<Tooltip><InfoCircleOutlined /></Tooltip>`
 * viết tại chỗ — cách viết đó có hai lỗ mà mắt thường không thấy:
 *
 *  1. **Không dùng được bằng bàn phím.** `InfoCircleOutlined` render ra một `<span>`: nó không
 *     nhận focus, nên người dùng bàn phím không có cách nào mở tooltip. Ở đây phần tử kích hoạt
 *     là một `<button type="button">` thật.
 *  2. **Trình đọc màn hình không đọc được nội dung.** Tooltip của AntD gắn vào DOM khi mở, và
 *     thời điểm gắn không nằm trong tầm kiểm soát của chúng ta. Nên nội dung còn được trả thêm
 *     một bản ẩn-thị-giác nối vào nút bằng `aria-describedby` — luôn có mặt, không phụ thuộc
 *     trạng thái mở.
 *
 * Ba cách mở đều chạy: hover và focus (desktop), và chạm (`click` — trên cảm ứng không có
 * hover, và `Tooltip` của AntD KHÔNG tự thêm `click` khi ta đã khai `trigger`).
 *
 * `type="button"`: khối này hay nằm trong form (bảng giá ở bước đặt xe) và mặc định của
 * `<button>` trong form là `submit` — một dấu "i" gửi đi cả biểu mẫu là lỗi khó truy nhất.
 *
 * KHÔNG dùng nó để giấu thông tin bắt buộc. Số tiền, hạn thanh toán và hệ quả khi hết hạn phải
 * đọc được mà không cần bấm gì; dấu "i" chỉ mang phần giải thích thêm cho người muốn biết sâu.
 */
export function InfoHint({
  content,
  label,
  className,
}: {
  /** Lời giải thích. Câu ngắn — tooltip không phải chỗ để một đoạn văn. */
  content: ReactNode;
  /**
   * Tên khả truy cập của chính cái nút ("Giải thích về tiền giữ chỗ").
   *
   * Tách khỏi `content` là cố ý: trình đọc màn hình đọc TÊN trước, rồi mới tới phần mô tả, nên
   * một cái tên bằng đúng nội dung sẽ khiến người dùng nghe cùng một câu hai lần.
   */
  label: string;
  className?: string;
}) {
  const describedBy = useId();

  return (
    <span className={className}>
      <Tooltip title={content} trigger={['hover', 'focus', 'click']}>
        <button
          type="button"
          className={styles.trigger}
          aria-label={label}
          aria-describedby={describedBy}
        >
          <InfoCircleOutlined aria-hidden />
        </button>
      </Tooltip>
      {/*
        Bản ẩn-thị-giác của nội dung. `hidden` thật sẽ bị trình đọc màn hình bỏ qua luôn, nên nó
        dùng kỹ thuật "sr-only" (cắt về 1px) — vẫn nằm trong cây khả truy cập.
      */}
      <span id={describedBy} className={styles.srOnly}>
        {content}
      </span>
    </span>
  );
}
