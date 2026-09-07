'use client';

import { Descriptions } from 'antd';
import {
  AUDIT_ACTOR_SCOPE_META, type AuditActorScope, } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { auditActionLabel, auditTargetTypeLabel } from '../constants';
import { useAuditLog } from '../hooks/use-audit-logs';
import type { AuditLogDetail } from '../types';
import styles from './AuditLogDetailDrawer.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { LIST_SEPARATOR } from '@xeprime/domain';

export function AuditLogDetailDrawer({
  logId,
  onClose,
}: {
  logId: string | null;
  onClose: () => void;
}) {
  const { data, isLoading } = useAuditLog(logId);

  return (
    <DetailDrawer
      title={data ? auditActionLabel(data.action) : 'Nhật ký'}
      // 640px cũ → bậc `lg` (720px) của token. Panel này có bảng JSON before/after nên cần rộng.
      size="lg"
      open={Boolean(logId)}
      onClose={onClose}
      loading={isLoading || !data}
      extra={
        data ? (
          <StatusTag value={data.actorScope as AuditActorScope} meta={AUDIT_ACTOR_SCOPE_META} group="auditActorScope" />
        ) : null
      }
    >
      {data ? <Body log={data} /> : null}
    </DetailDrawer>
  );
}

function Body({ log }: { log: AuditLogDetail }) {
  const fmt = useAppFormat();

  return (
    <div>
      <Descriptions
        column={1}
        size="small"
        bordered
        items={[
          { key: 'time', label: 'Thời gian', children: fmt.dateTime(log.createdAt) },
          {
            key: 'actor',
            label: 'Người thao tác',
            children: [log.actorName, log.actorEmail].filter(Boolean).join(LIST_SEPARATOR) || '—',
          },
          { key: 'action', label: 'Hành động', children: `${auditActionLabel(log.action)} (${log.action})` },
          {
            key: 'target',
            label: 'Đối tượng',
            children: `${auditTargetTypeLabel(log.targetType)}${log.targetId ? ` · ${log.targetId}` : ''}`,
          },
          { key: 'tenant', label: 'Gian hàng', children: log.tenantName ?? '—' },
          ...(log.ipAddress ? [{ key: 'ip', label: 'IP', children: log.ipAddress }] : []),
          ...(log.userAgent ? [{ key: 'ua', label: 'Trình duyệt', children: log.userAgent }] : []),
        ]}
      />

      <div className={styles.jsonGrid}>
        <JsonCol title="Trước" value={log.beforeJson} />
        <JsonCol title="Sau" value={log.afterJson} />
      </div>
    </div>
  );
}

function JsonCol({ title, value }: { title: string; value: unknown }) {
  return (
    <div className={styles.jsonCol}>
      <div className={styles.jsonTitle}>{title}</div>
      {value == null ? (
        <div className={styles.jsonEmpty}>Không có dữ liệu</div>
      ) : (
        <pre className={styles.jsonBox}>{JSON.stringify(value, null, 2)}</pre>
      )}
    </div>
  );
}
