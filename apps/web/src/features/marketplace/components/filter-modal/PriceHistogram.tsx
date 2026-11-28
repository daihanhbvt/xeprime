import { cx } from '@/lib/cx';
import styles from './PriceHistogram.module.css';

/** Số cột — khớp 20 cột của Figma (22588:72174) và 20 luật chiều cao trong CSS. */
const BAR_COUNT = 20;
const BARS = Array.from({ length: BAR_COUNT }, (_, index) => index);

/**
 * Dải cột phía trên thanh trượt giá (Figma "Khoảng giá thuê theo ngày" 22588:72174).
 *
 * MINH HOẠ, không phải dữ liệu: hình dáng cố định (dồn ở mức giá thấp - trung bình, đuôi dài về
 * phía giá cao, như phân bố giá thuê thường gặp), không gọi API (quyết định sản phẩm 28/11/2026).
 * Vì vậy nó `aria-hidden` và không mang con số nào. Phần có nghĩa là MÀU: cột nằm trong khoảng
 * đang chọn tô vàng, nên khách thấy ngay khoảng mình kéo rộng hay hẹp so với cả thang.
 *
 * Cột thứ `i` đại diện cho giá ở giữa cột: `(i + 0,5) / 20 × max`.
 */
export function PriceHistogram({
  min,
  max,
  scaleMax,
}: {
  min: number;
  max: number;
  scaleMax: number;
}) {
  return (
    <div className={styles.histogram} aria-hidden="true">
      {BARS.map((index) => {
        const price = ((index + 0.5) / BAR_COUNT) * scaleMax;
        return (
          <span
            key={index}
            className={cx(styles.bar, price >= min && price <= max && styles.barActive)}
          />
        );
      })}
    </div>
  );
}
