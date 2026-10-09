'use client';

import { CheckCircleOutlined, ThunderboltOutlined } from '@ant-design/icons';
import type { ReactNode } from 'react';
import { cx } from '@/lib/cx';
import styles from './DashboardHeader.module.css';

/**
 * Đầu trang của mọi Tổng quan: tiêu đề, ngày, và CÂU TRẢ LỜI (UX §0 nguyên tắc 1) — "Hôm nay:
 * giao 3 xe · 1 yêu cầu chờ bạn trả lời" — trước mọi thẻ số.
 *
 * `answer.busy = false` là câu "hôm nay yên ả": vẫn nói ra, để người mở màn biết là KHÔNG có gì
 * chứ không phải màn chưa tải xong. `answer = null` khi chưa có gì để khẳng định (đang tải, thiếu
 * quyền) — khi đó im lặng đúng hơn một câu đoán.
 */
export function DashboardHeader({
  title,
  subtitle,
  answer,
  actions,
}: {
  title: string;
  subtitle: string;
  answer?: { text: string; busy: boolean } | null;
  actions?: ReactNode;
}) {
  return (
    <header className={styles.header}>
      <div className={styles.top}>
        <div className={styles.heading}>
          <h1 className={styles.title}>{title}</h1>
          <p className={styles.subtitle}>{subtitle}</p>
        </div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </div>
      {answer ? (
        <p className={cx(styles.answer, answer.busy ? styles.busy : styles.calm)} role="status">
          {answer.busy ? (
            <ThunderboltOutlined className={styles.answerIcon} aria-hidden />
          ) : (
            <CheckCircleOutlined className={styles.answerIcon} aria-hidden />
          )}
          <span>{answer.text}</span>
        </p>
      ) : null}
    </header>
  );
}
