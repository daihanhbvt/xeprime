'use client';

import { RightOutlined } from '@ant-design/icons';
import { Skeleton } from 'antd';
import Link from 'next/link';
import { createElement, type ComponentType, type ReactNode } from 'react';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import styles from './ActionTile.module.css';

export type ActionTileTone = 'calm' | 'attention' | 'urgent';

/** Một dòng phụ của ô — `urgent` tô đỏ (quá giờ, sắp hết hạn), còn lại là chữ phụ. */
export interface ActionTileMeta {
  key: string;
  text: ReactNode;
  urgent?: boolean;
}

/**
 * Ô "VIỆC CẦN LÀM" — hàng đầu của mọi Tổng quan (UX §1.5): một con số việc + vài dòng ngữ cảnh,
 * cả ô là một `<Link>` tới đúng danh sách tạo nên con số đó.
 *
 * Dùng chung cho site partner (yêu cầu chờ duyệt, chờ giao xe…) và site quản trị (xe chờ duyệt,
 * tiền vào chưa khớp…): hai site, một hình dạng — người trực hai bên đọc cùng một ngôn ngữ thị giác.
 *
 * Ba trạng thái tông:
 *  - `calm`: không có việc (`count = 0`) — ô dịu đi và nói một câu, không hiện số 0 to đùng;
 *  - `attention`: có việc;
 *  - `urgent`: có việc ĐÃ quá giờ/sắp hết hạn — viền và số đỏ, để mắt rơi vào đó trước.
 *
 * `count === undefined` là đang tải (skeleton đúng hình dạng); `null` là không đọc được (lỗi) —
 * ô vẫn dẫn tới danh sách, vì người dùng vẫn cần đi làm việc dù con số tạm thời không có.
 */
export function ActionTile({
  icon,
  label,
  count,
  href,
  tone,
  meta = [],
  emptyText,
  errorText,
}: {
  icon: ComponentType<{ className?: string }>;
  label: string;
  count: number | null | undefined;
  href: string;
  tone: ActionTileTone;
  meta?: ActionTileMeta[];
  emptyText: string;
  errorText: string;
}) {
  const fmt = useAppFormat();
  const loading = count === undefined;
  const failed = count === null;
  const empty = count === 0;

  return (
    <Link
      href={href}
      className={cx(
        styles.tile,
        !loading && !failed && empty && styles.calm,
        !loading && !failed && !empty && tone === 'attention' && styles.attention,
        !loading && !failed && !empty && tone === 'urgent' && styles.urgent,
      )}
    >
      <span className={styles.head}>
        <span className={styles.iconTile}>{createElement(icon, { className: styles.icon })}</span>
        <span className={styles.label}>{label}</span>
        <RightOutlined className={styles.chevron} aria-hidden />
      </span>

      {loading ? (
        <Skeleton active title={false} paragraph={{ rows: 2, width: ['40%', '80%'] }} />
      ) : (
        <>
          <span className={styles.count}>{failed ? '—' : fmt.count(count)}</span>
          <span className={styles.meta}>
            {failed ? (
              <span className={styles.metaLine}>{errorText}</span>
            ) : empty || meta.length === 0 ? (
              <span className={styles.metaLine}>{empty ? emptyText : null}</span>
            ) : (
              meta.map((line) => (
                <span key={line.key} className={cx(styles.metaLine, line.urgent && styles.metaUrgent)}>
                  {line.text}
                </span>
              ))
            )}
          </span>
        </>
      )}
    </Link>
  );
}
