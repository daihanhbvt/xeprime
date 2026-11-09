'use client';

import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { MEMBER_ROSTER_KIND } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { describeLastActive } from '../last-active';
import type { MemberRosterItem } from '../types';
import styles from './LastActiveText.module.css';

/** Nhịp vẽ lại "x phút trước" — đủ để nhãn không đứng yên khi màn mở lâu. */
const TICK_MS = 60_000;

/**
 * Cột "Hoạt động gần nhất" (ADR 0086 điều 6). Lời mời còn chờ thì nói ngày mời ("Đã mời lúc …"),
 * vì người được mời chưa có hoạt động nào trong gian hàng.
 */
export function LastActiveText({ item }: { item: MemberRosterItem }) {
  const t = useTranslations('Members.lastActive');
  const fmt = useAppFormat();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), TICK_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (item.kind === MEMBER_ROSTER_KIND.INVITE) {
    return <span className={styles.muted}>{t('invited', { date: fmt.date(item.invitedAt) })}</span>;
  }

  const last = describeLastActive(item.lastActiveAt, now);
  switch (last.kind) {
    case 'online':
      return <span className={styles.online}>{t('online')}</span>;
    case 'minutes':
    case 'hours':
    case 'days':
      return <span>{t(last.kind, { count: last.count })}</span>;
    case 'date':
      return <span>{fmt.date(last.iso)}</span>;
    case 'never':
      return <span className={styles.muted}>{t('never')}</span>;
  }
}
