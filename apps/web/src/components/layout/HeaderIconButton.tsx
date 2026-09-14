'use client';

import { Badge } from 'antd';
import Link from 'next/link';
import {
  forwardRef,
  type AnchorHTMLAttributes,
  type ButtonHTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '@/lib/cx';
import styles from './HeaderIconButton.module.css';

/**
 * Con số lớn hơn NGƯỠNG này hiện thành "9+".
 *
 * Huy hiệu trên thanh trên cùng trả lời đúng một câu hỏi — "có việc mới không, nhiều không" —
 * chứ không phải một phép đếm chính xác. "47" trong một vòng tròn 16px đọc không ra, làm huy
 * hiệu phình ngang và đẩy lệch cả hàng biểu tượng; "9+" giữ vòng tròn tròn ở mọi con số.
 */
const OVERFLOW_COUNT = 9;

export interface HeaderIconButtonProps
  extends Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'children'> {
  readonly icon: ReactNode;
  /** Tên khả truy cập — biểu tượng trần không có chữ nào để đọc. */
  readonly label: string;
  /** 0 hoặc bỏ trống là không có huy hiệu. */
  readonly count?: number;
  /** Có `href` thì đây là một LIÊN KẾT thật (mở tab mới được); không có thì là nút mở popup. */
  readonly href?: string;
  /** Popup của chính nó đang mở — giữ nút ở trạng thái "đang bật". */
  readonly active?: boolean;
}

/**
 * Biểu tượng tròn ở góc phải thanh trên cùng (tin nhắn · thông báo) — MỘT hình dáng cho cả
 * marketplace và cổng quản lý.
 *
 * Trước đây mỗi nơi tự dựng: header khu khách dùng `<Link>` tạo dáng bằng CSS riêng, topbar khu
 * quản lý dùng `<Button type="text" shape="circle">` của AntD, chuông thông báo lại là bản thứ
 * ba. Ba nền, ba cỡ, ba kiểu huy hiệu cạnh nhau trên cùng một hàng. Ở đây chúng dùng chung một
 * "chip": nền trắng, viền mảnh, huy hiệu đỏ có vành trắng để tách khỏi biểu tượng bên dưới.
 *
 * `forwardRef` + trải toàn bộ prop còn lại là điều kiện để `Popover`/`Dropdown` bọc được component
 * này: chúng clone phần tử con, gắn `ref` để neo popup và bơm `onClick`/`aria-expanded` vào.
 * `ref` đi vào vỏ `Badge` (thứ được đo để đặt popup), còn sự kiện đi vào chính nút — bàn phím
 * phải bấm được bằng Enter/Space, thứ chỉ `<button>` mới có.
 */
export const HeaderIconButton = forwardRef<HTMLSpanElement, HeaderIconButtonProps>(
  function HeaderIconButton({ icon, label, count = 0, href, active, className, ...rest }, ref) {
    const chipClassName = cx(styles.chip, active && styles.chipActive, className);
    const content = (
      <span className={styles.glyph} aria-hidden="true">
        {icon}
      </span>
    );

    return (
      <Badge
        ref={ref}
        count={count}
        size="small"
        overflowCount={OVERFLOW_COUNT}
        // Nút tròn: góc trên phải của hộp bao nằm NGOÀI đường cong, kéo huy hiệu vào cho nó
        // tựa lên vành nút thay vì lơ lửng cạnh nút.
        offset={[-3, 3]}
        classNames={{ indicator: styles.indicator }}
        className={styles.badge}
      >
        {href ? (
          <Link
            href={href}
            aria-label={label}
            className={chipClassName}
            {...(rest as unknown as AnchorHTMLAttributes<HTMLAnchorElement>)}
          >
            {content}
          </Link>
        ) : (
          <button type="button" aria-label={label} className={chipClassName} {...rest}>
            {content}
          </button>
        )}
      </Badge>
    );
  },
);
