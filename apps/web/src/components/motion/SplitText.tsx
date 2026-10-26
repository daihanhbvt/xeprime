import { Fragment, type CSSProperties } from 'react';
import { cx } from '@/lib/cx';
import { motionDelayClass, type MotionDelay } from './motion-classes';
import { splitText } from './split-text';
import styles from './motion.module.css';

/**
 * Tiêu đề hiện ra TỪNG KÝ TỰ — trượt 50px từ phải, so le 0.02s, vượt đích nhẹ rồi về (≈ GSAP
 * SplitText `.rts-slide-anim` của trang mẫu), nhưng là CSS thuần: không GSAP, không JS phía client.
 *
 * Dùng được ở cả Server lẫn Client Component. Chạy khi được vẽ; đặt trong `Reveal` thì chờ cuộn tới.
 * Trình đọc màn hình đọc nguyên câu (bản ẩn thị giác); các ký tự rời bị `aria-hidden` — không đọc
 * thành từng chữ cái.
 *
 * Chỉ nhận CHUỖI: chữ có định dạng (gradient, `t.rich`) giữ nguyên node, dùng `enterClass` thay.
 */
export function SplitText({
  text,
  delay,
  className,
}: {
  text: string;
  delay?: MotionDelay;
  className?: string;
}) {
  const words = splitText(text);

  return (
    <span className={cx(motionDelayClass(delay), className)}>
      <span className={styles.srOnly}>{text}</span>
      <span aria-hidden="true">
        {words.map((word, w) => (
          <Fragment key={w}>
            {w > 0 ? ' ' : null}
            <span className={styles.splitWord}>
              {word.chars.map(({ char, index }, c) => (
                <span
                  key={c}
                  className={styles.splitChar}
                  // Vị trí ký tự trong câu ĐÃ DỊCH — chỉ biết lúc render (ngoại lệ inline style, ADR 0003).
                  style={{ '--char-index': index } as CSSProperties}
                >
                  {char}
                </span>
              ))}
            </span>
          </Fragment>
        ))}
      </span>
    </span>
  );
}
