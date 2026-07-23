'use client';

import { ArrowLeftOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import type { ReactNode } from 'react';
import styles from './ManagePageHeader.module.css';

/**
 * Tiêu đề chuẩn cho các trang trong Management Portal: nút back tuỳ chọn, tiêu đề, và vùng
 * hành động bên phải. Gom một chỗ để mọi trang manage cùng một nhịp bố cục.
 */
export function ManagePageHeader({
  title,
  onBack,
  extra,
}: {
  title: ReactNode;
  onBack?: () => void;
  extra?: ReactNode;
}) {
  return (
    <div className={styles.header}>
      <div className={styles.left}>
        {onBack ? (
          <Button type="text" icon={<ArrowLeftOutlined />} onClick={onBack} aria-label="Quay lại" />
        ) : null}
        <Typography.Title level={3} className={styles.title}>
          {title}
        </Typography.Title>
      </div>
      {extra ? <div className={styles.extra}>{extra}</div> : null}
    </div>
  );
}
