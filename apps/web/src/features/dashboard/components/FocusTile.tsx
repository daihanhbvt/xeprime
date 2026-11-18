'use client';

import { Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { LineIcon } from '@/components/icons/LineIcon';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import styles from './FocusTile.module.css';

export type FocusTileTone = 'danger' | 'warning' | 'info' | 'success';

/**
 * Một ô việc của Tổng quan partner — Figma "Performance Summary" `24138:80355`: icon 24 trong ô
 * màu 40 bo 12 · nhãn 12 medium IN HOA · số 24 semibold (+ viên đỏ "N quá hạn") · dòng phụ 12 ·
 * mũi tên phải. Cả ô là một link.
 *
 * Cùng mô hình với `FocusTile` của app Partner: `count` `undefined` = đang tải, `null` = lỗi,
 * `0` = yên (dòng phụ là câu "không có …").
 */
export function FocusTile({
  icon,
  tone,
  label,
  count,
  href,
  badge,
  lines,
  emptyText,
}: {
  icon: string;
  tone: FocusTileTone;
  label: string;
  count: number | null | undefined;
  href: string;
  badge?: string;
  lines: readonly { key: string; text: string }[];
  emptyText: string;
}) {
  const t = useTranslations('Dashboard.focus');
  const fmt = useAppFormat();
  const loading = count === undefined;
  const failed = count === null;

  const sub = failed
    ? [{ key: 'error', text: t('loadError') }]
    : count === 0
      ? [{ key: 'empty', text: emptyText }]
      : lines;

  return (
    <Link href={href} className={styles.tile}>
      <span className={cx(styles.iconBox, styles[tone])} aria-hidden="true">
        {/* SVG của Figma mang sẵn màu của ô — `<img>` thay vì mask. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={icon} alt="" width={24} height={24} />
      </span>
      <span className={styles.body}>
        <span className={styles.label}>{label}</span>
        {loading ? (
          <Skeleton active title={false} paragraph={{ rows: 2, width: ['30%', '80%'] }} />
        ) : (
          <>
            <span className={styles.countRow}>
              <span className={styles.count}>{failed ? '-' : fmt.count(count)}</span>
              {!failed && count > 0 && badge ? <span className={styles.badge}>{badge}</span> : null}
            </span>
            {sub.map((line) => (
              <span key={line.key} className={styles.line}>
                {line.text}
              </span>
            ))}
          </>
        )}
      </span>
      <LineIcon name="chevron-right" className={styles.chevron} />
    </Link>
  );
}
