'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import Link from 'next/link';
import type { ReactNode } from 'react';

import styles from './AccountPageHeader.module.css';

export interface AccountPageHeaderProps {
  title: ReactNode;
  /** Dòng mô tả dưới tiêu đề — văn bản, không phải chỗ nhét hành động. */
  subtitle?: ReactNode;
  /** Vùng hành động bên phải (nút "Thêm xe", "Chỉnh sửa"…). */
  extra?: ReactNode;
  /** Đường quay lại — trang chi tiết đặt link về danh sách ở trên tiêu đề. */
  back?: { href: string; label: string };
  /**
   * Cấp tiêu đề. Mặc định `h1` — component này sinh tiêu đề CỦA TRANG.
   *
   * Đặt `h2` khi khối được NHÚNG làm một phần của trang khác (`/manage/security` xếp ba khối
   * dùng lại từ khu tài khoản dưới một `h1` chung). Một trang có ba `h1` không hỏng về hình
   * ảnh nhưng hỏng thật với trình đọc màn hình: danh sách tiêu đề trở thành ba trang chồng lên
   * nhau và người dùng bàn phím mất luôn cách nhảy giữa các phần.
   */
  as?: 'h1' | 'h2';
}

/**
 * Tiêu đề chuẩn của một trang trong khu tài khoản — cặp song sinh của `ManagePageHeader` cho vỏ
 * `/account`.
 *
 * Là NƠI DUY NHẤT sinh `<h1>` của các trang mới trong khu này (trang hồ sơ và `TripsView` có `h1`
 * riêng từ trước và không đi qua đây). Vỏ `AccountShell` không mang tiêu đề chung, nên mỗi trang
 * đúng một `h1`, không hai.
 *
 * Client island vì dùng icon của AntD — mọi component có icon trong repo này đều là client.
 */
export function AccountPageHeader({
  title,
  subtitle,
  extra,
  back,
  as: Heading = 'h1',
}: AccountPageHeaderProps) {
  return (
    <header className={styles.header}>
      {back ? (
        <Link href={back.href} className={styles.back}>
          <ArrowLeftOutlined aria-hidden="true" /> {back.label}
        </Link>
      ) : null}
      <div className={styles.row}>
        <div className={styles.text}>
          <Heading className={styles.title}>{title}</Heading>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
        {extra ? <div className={styles.extra}>{extra}</div> : null}
      </div>
    </header>
  );
}
