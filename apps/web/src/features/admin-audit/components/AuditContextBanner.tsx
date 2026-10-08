'use client';

import { HistoryOutlined } from '@ant-design/icons';
import { Button, Typography } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useAuditLabels } from '../hooks/use-audit-labels';
import { shortAuditId } from '../labels';
import type { AuditLog } from '../types';
import styles from './AuditContextBanner.module.css';

interface AuditContextBannerProps {
  targetType?: string;
  targetId?: string;
  tenantId?: string;
  actorUserId?: string;
  /** Các dòng của trang hiện tại — nguồn của tên đối tượng / gian hàng / người đang được lọc. */
  items: readonly AuditLog[];
  total: number;
  onViewAll: () => void;
}

/**
 * Dải ngữ cảnh khi trang được mở bằng tham số "sâu" (`targetId` / `tenantId` / `actorUserId`) từ
 * một màn khác — chi tiết đối tác, đơn thuê, xe. Không có nó, người xem rơi vào một danh sách đã
 * lọc mà không ô lọc nào cho biết vì sao chỉ thấy vài dòng, và không có đường về toàn bộ nhật ký
 * ngoài việc sửa URL.
 *
 * Tên đối tượng / gian hàng lấy từ CHÍNH các dòng đang hiện (server đã tra tên) — không gọi thêm.
 */
export function AuditContextBanner({
  targetType,
  targetId,
  tenantId,
  actorUserId,
  items,
  total,
  onViewAll,
}: AuditContextBannerProps) {
  const t = useTranslations('AdminAudit.context');
  const tCommon = useTranslations('Common.actions');
  const labels = useAuditLabels();

  if (!targetId && !tenantId && !actorUserId) return null;

  const sameTarget = items.find((item) => item.targetId === targetId);
  const tenantName =
    (tenantId ? items.find((item) => item.tenantId === tenantId) : sameTarget)?.tenantName ?? null;
  const actorName = actorUserId
    ? (items.find((item) => item.actorUserId === actorUserId)?.actorName ?? null)
    : null;
  const subjectId = targetId ?? tenantId ?? actorUserId ?? '';

  let subject: ReactNode;
  if (targetId) {
    subject = (
      <>
        <span className={styles.kind}>
          {labels.targetType(targetType ?? sameTarget?.targetType ?? '')}
        </span>
        <span className={styles.name}>{sameTarget?.targetLabel ?? shortAuditId(targetId)}</span>
      </>
    );
  } else if (tenantId) {
    subject = (
      <>
        <span className={styles.kind}>{t('tenantKind')}</span>
        <span className={styles.name}>{tenantName ?? shortAuditId(tenantId)}</span>
      </>
    );
  } else {
    subject = (
      <>
        <span className={styles.kind}>{t('actorKind')}</span>
        <span className={styles.name}>{actorName ?? shortAuditId(subjectId)}</span>
      </>
    );
  }

  return (
    <section className={styles.banner} aria-label={t('title')}>
      <span className={styles.icon} aria-hidden>
        <HistoryOutlined />
      </span>
      <div className={styles.body}>
        <div className={styles.eyebrow}>{t('title')}</div>
        <div className={styles.subject}>{subject}</div>
        <div className={styles.meta}>
          {targetId && tenantName ? (
            <>
              {t('tenant', { name: tenantName })}
              {LIST_SEPARATOR}
            </>
          ) : null}
          {t('count', { count: total })}
          {LIST_SEPARATOR}
          <Typography.Text
            className={styles.code}
            copyable={{ text: subjectId, tooltips: [tCommon('copy'), tCommon('copied')] }}
          >
            {t('id', { id: shortAuditId(subjectId) })}
          </Typography.Text>
        </div>
      </div>
      <Button className={styles.action} onClick={onViewAll}>
        {t('viewAll')}
      </Button>
    </section>
  );
}
