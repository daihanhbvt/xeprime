'use client';

import { ExportOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import Link from 'next/link';
import { useId } from 'react';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { PERMISSION, SUPPORT_CASE_STATUS_META, type SupportCaseStatus } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ROUTES } from '@/constants/routes';
import { usePermissions } from '@/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import type { AdminBookingDetail } from '../../types';
import styles from './BookingDetail.module.css';

/**
 * Case hỗ trợ CÒN MỞ của đơn (ADR 0095 điều 4) — người xem đơn biết ngay đơn đang bị giữ ở đâu và
 * mở thẳng case đó. Nút kết luận chuyến chỉ sống ở chi tiết case: một nơi ra quyết định, một dòng
 * thời gian ghi lại. Không có case mở thì khối này không hiện.
 */
export function BookingSupportCases({ booking }: { booking: AdminBookingDetail }) {
  const t = useTranslations('AdminBookings.supportCases');
  const titleId = useId();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { has } = usePermissions();
  const canOpen = has(PERMISSION.PLATFORM_SUPPORT_MANAGE);
  const cases = booking.openSupportCases;
  if (cases.length === 0) return null;

  return (
    <section className={styles.section} aria-labelledby={titleId}>
      <h3 id={titleId} className={styles.sectionTitle}>
        {t('title')}
      </h3>
      <p className={styles.supportHint}>{t('hint')}</p>
      <ul className={styles.supportCases}>
        {cases.map((c) => (
          <li key={c.id} className={styles.supportCase}>
            <div className={styles.supportCaseMain}>
              <span className={styles.supportCaseCode}>{c.code}</span>
              <StatusTag
                value={c.status as SupportCaseStatus}
                meta={SUPPORT_CASE_STATUS_META}
                group="supportCaseStatus"
              />
              {c.tripVerdictAvailable ? <Tag color="orange">{t('verdictTag')}</Tag> : null}
            </div>
            <div className={styles.supportCaseMeta}>
              {[
                domainLabel('supportCaseCategory', c.category),
                domainLabel('supportCasePriority', c.priority),
                t('openedAt', { time: fmt.shortDateTime(c.createdAt) }),
              ].join(LIST_SEPARATOR)}
            </div>
            {canOpen ? (
              <Link href={`${ROUTES.ADMIN.SUPPORT}?open=${encodeURIComponent(c.id)}`}>
                <Button size="small" icon={<ExportOutlined />}>
                  {t('open')}
                </Button>
              </Link>
            ) : null}
          </li>
        ))}
      </ul>
    </section>
  );
}
