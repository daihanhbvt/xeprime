import { useEffect, useState } from 'react';
import { Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MEMBER_ROSTER_KIND } from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize } from '@/theme/tokens';
import type { MemberRosterItem } from '../api';
import { describeLastActive } from '../last-active';

/** Nhịp vẽ lại "x phút trước" — đủ để nhãn không đứng yên khi màn mở lâu. */
const TICK_MS = 60_000;

/**
 * "Hoạt động gần nhất" (ADR 0086 điều 6) — bản native của web `LastActiveText`. Lời mời còn chờ thì
 * nói ngày mời, vì người được mời chưa có hoạt động nào trong gian hàng.
 */
export function LastActiveText({ item }: { item: MemberRosterItem }) {
  const colors = useColors();
  const t = useTranslations('Members.lastActive');
  const fmt = useAppFormat();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), TICK_MS);
    return () => clearInterval(timer);
  }, []);

  const muted = (text: string) => (
    <Text col={colors.textMuted} fos={fontSize.body} numberOfLines={1}>
      {text}
    </Text>
  );

  if (item.kind === MEMBER_ROSTER_KIND.INVITE) {
    return muted(t('invited', { date: fmt.date(item.invitedAt) }));
  }

  const last = describeLastActive(item.lastActiveAt, now);
  switch (last.kind) {
    case 'online':
      return (
        <Text col={colors.success} fos={fontSize.body} numberOfLines={1}>
          {t('online')}
        </Text>
      );
    case 'minutes':
    case 'hours':
    case 'days':
      return (
        <Text col={colors.text} fos={fontSize.body} numberOfLines={1}>
          {t(last.kind, { count: last.count })}
        </Text>
      );
    case 'date':
      return (
        <Text col={colors.text} fos={fontSize.body} numberOfLines={1}>
          {fmt.date(last.iso)}
        </Text>
      );
    case 'never':
      return muted(t('never'));
  }
}
