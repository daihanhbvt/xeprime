'use client';

import { ArrowRightOutlined, HistoryOutlined } from '@ant-design/icons';
import { Collapse, Tag, Typography } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  AUDIT_ACTOR_SCOPE_META,
  STATUS_COLOR,
  type AuditActorScope,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { WorkDrawerFacts, type WorkDrawerFact } from '@/components/overlay/WorkDrawer';
import { adminAuditPath, adminPartnerPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useAuditLabels } from '../hooks/use-audit-labels';
import { useAuditLog } from '../hooks/use-audit-logs';
import { auditActorName, shortAuditId } from '../labels';
import type { AuditLogDetail } from '../types';
import { AuditCategoryIcon } from './AuditCategoryIcon';
import { AuditChangeDetails } from './AuditChangeDetails';
import styles from './AuditLogDetailDrawer.module.css';

/**
 * Panel chi tiết một dòng nhật ký — CHỈ ĐỌC.
 *
 * Ba tầng theo thứ tự người vận hành cần:
 *  1. CHUYỆN GÌ, với ĐỐI TƯỢNG nào (bằng tên, không bằng mã), AI làm, LÚC NÀO, ở GIAN HÀNG nào —
 *     kèm lối sang gian hàng và sang toàn bộ lịch sử của đối tượng.
 *  2. NỘI DUNG — kể theo loại thay đổi (`AuditChangeDetails`).
 *  3. KỸ THUẬT — mã hành động, mã bản ghi, IP, thiết bị, JSON gốc — gập lại, chỉ khi điều tra.
 */
export function AuditLogDetailDrawer({
  logId,
  contextTargetId,
  onClose,
}: {
  logId: string | null;
  /** Trang đang lọc theo đối tượng này rồi — không lặp lại lối "Xem lịch sử đối tượng". */
  contextTargetId?: string;
  onClose: () => void;
}) {
  const t = useTranslations('AdminAudit.detail');
  const labels = useAuditLabels();
  const { data, isLoading, isError, refetch } = useAuditLog(logId);

  return (
    <DetailDrawer
      title={data ? labels.action(data.action) : t('title')}
      // Bậc `lg` (720px) của token: đủ cho lưới hai cột và bảng ba cột.
      size="lg"
      open={Boolean(logId)}
      onClose={onClose}
      loading={isLoading}
      error={isError && !data}
      errorTitle={t('loadError')}
      onRetry={() => void refetch()}
      extra={
        data ? (
          <StatusTag
            value={data.actorScope as AuditActorScope}
            meta={AUDIT_ACTOR_SCOPE_META}
            group="auditActorScope"
          />
        ) : null
      }
    >
      {data ? <Body key={data.id} log={data} contextTargetId={contextTargetId} /> : null}
    </DetailDrawer>
  );
}

function Body({ log, contextTargetId }: { log: AuditLogDetail; contextTargetId?: string }) {
  const t = useTranslations('AdminAudit.detail');
  const tTable = useTranslations('AdminAudit.table');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const labels = useAuditLabels();
  const empty = tCommon('labels.emptyValue');

  const facts: WorkDrawerFact[] = [
    { key: 'time', label: t('facts.time'), value: fmt.dateTime(log.createdAt) },
    {
      key: 'actor',
      label: t('facts.actor'),
      value: (
        <span className={styles.stackTight}>
          <span>{auditActorName(log, tTable('systemActor'), empty)}</span>
          {log.actorEmail ? <span className={styles.muted}>{log.actorEmail}</span> : null}
          {log.viaSupport ? (
            <span>
              <Tag color={STATUS_COLOR.WAITING}>{tTable('viaSupport')}</Tag>
            </span>
          ) : null}
        </span>
      ),
    },
    { key: 'category', label: t('facts.category'), value: labels.actionCategory(log.action) },
    { key: 'tenant', label: t('facts.tenant'), value: log.tenantName ?? tTable('noTenant') },
  ];

  const technical: WorkDrawerFact[] = [
    { key: 'code', label: t('facts.code'), value: <Copyable text={log.action} /> },
    { key: 'logId', label: t('facts.logId'), value: <Copyable text={log.id} /> },
    ...(log.targetId
      ? [{ key: 'targetId', label: t('facts.targetId'), value: <Copyable text={log.targetId} /> }]
      : []),
    { key: 'ip', label: t('facts.ip'), value: log.ipAddress ?? empty },
    {
      key: 'ua',
      label: t('facts.userAgent'),
      value: log.userAgent ?? empty,
      wide: true,
    },
  ];

  return (
    <div className={styles.body}>
      <section className={styles.hero}>
        <AuditCategoryIcon action={log.action} size="lg" />
        <div className={styles.heroText}>
          <div className={styles.heroKind}>{labels.targetType(log.targetType)}</div>
          <div className={styles.heroName}>
            {log.targetLabel ?? (log.targetId ? shortAuditId(log.targetId) : empty)}
          </div>
          <div className={styles.heroLinks}>
            {log.tenantId ? (
              <Link href={adminPartnerPath.resolveTenant(log.tenantId)}>
                {t('openTenant')} <ArrowRightOutlined aria-hidden />
              </Link>
            ) : null}
            {log.targetId && log.targetId !== contextTargetId ? (
              <Link href={adminAuditPath.forTarget(log.targetType, log.targetId)}>
                <HistoryOutlined aria-hidden /> {t('targetHistory')}
              </Link>
            ) : null}
          </div>
        </div>
      </section>

      <WorkDrawerFacts items={facts} />

      <section className={styles.section} aria-labelledby="audit-changes-title">
        <h3 id="audit-changes-title" className={styles.sectionTitle}>
          {t('changes.title')}
        </h3>
        <AuditChangeDetails log={log} />
      </section>

      <Collapse
        ghost
        className={styles.technical}
        items={[
          {
            key: 'technical',
            label: t('technical.title'),
            children: (
              <div className={styles.body}>
                <WorkDrawerFacts items={technical} />
                <div>
                  <div className={styles.sectionTitle}>{t('technical.rawJson')}</div>
                  <div className={styles.jsonGrid}>
                    <JsonCol title={t('changes.before')} value={log.beforeJson} />
                    <JsonCol title={t('changes.after')} value={log.afterJson} />
                  </div>
                </div>
              </div>
            ),
          },
        ]}
      />
    </div>
  );
}

/** Mã kỹ thuật kèm nút sao chép — ULID, mã hành động. */
function Copyable({ text }: { text: string }) {
  const tCommon = useTranslations('Common.actions');
  return (
    <Typography.Text
      code
      className={styles.code}
      copyable={{ text, tooltips: [tCommon('copy'), tCommon('copied')] }}
    >
      {text}
    </Typography.Text>
  );
}

function JsonCol({ title, value }: { title: string; value: unknown }) {
  const t = useTranslations('AdminAudit.detail.technical');
  return (
    <div className={styles.jsonCol}>
      <div className={styles.jsonTitle}>{title}</div>
      {value == null ? (
        <div className={styles.jsonEmpty}>{t('noData')}</div>
      ) : (
        <pre className={styles.jsonBox}>{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  );
}
