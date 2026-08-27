'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import type { ReactNode } from 'react';
import styles from './ManagePageHeader.module.css';
import { useTranslations } from 'next-intl';

/**
 * Tiêu đề chuẩn cho các trang trong Management Portal: nút back tuỳ chọn, tiêu đề, và vùng
 * hành động bên phải. Gom một chỗ để mọi trang manage cùng một nhịp bố cục.
 *
 * **P6 (Wave 1D-B): tiêu đề là `<h1>`.** Trước đó là `level={3}` → `<h3>`, nghĩa là không một
 * trang `/manage` nào có `<h1>`; trình đọc màn hình không có mốc "đây là trang gì".
 *
 * Cấp heading và cỡ chữ là hai chuyện khác nhau, và ở đây chúng KHÔNG trùng: cấp lấy theo ngữ
 * nghĩa (`h1`, đúng một cái mỗi trang), cỡ lấy theo Figma. Tiêu đề trang trong Figma
 * (`58:98` "Danh sách xe", khung chữ cao 30px ⇒ ~24px) là **`--xp-font-size-h2`**, không phải
 * 32px của `fontSizeHeading1`. Nên: `level={1}` cho ngữ nghĩa, token h2 cho thị giác — chứ
 * không hạ xuống `level={2}` để lấy cỡ chữ nhỏ.
 *
 * Component này là NƠI DUY NHẤT sinh `<h1>` trong khu `/manage`; trang nào cũng đi qua đây nên
 * không có trang nào có hai `<h1>`.
 */
export interface ManagePageHeaderProps {
  title: ReactNode;
  /**
   * Dòng phụ dưới tiêu đề. Là văn bản MÔ TẢ, không phải chỗ nhét hành động — hành động thuộc
   * `extra` để thứ tự đọc là: tiêu đề → mô tả → hành động.
   */
  subtitle?: ReactNode;
  onBack?: () => void;
  extra?: ReactNode;
}

export function ManagePageHeader({ title, subtitle, onBack, extra }: ManagePageHeaderProps) {
  const t = useTranslations('ManageCommon');
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        {onBack ? (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label={t('shell.back')} />
        ) : null}
        <div className={styles.heading}>
          <Typography.Title level={1} className={styles.title}>
            {title}
          </Typography.Title>
          {subtitle ? <p className={styles.subtitle}>{subtitle}</p> : null}
        </div>
      </div>
      {extra ? <div className={styles.extra}>{extra}</div> : null}
    </div>
  );
}
