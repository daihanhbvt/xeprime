'use client';

import { EyeOutlined } from '@ant-design/icons';
import { Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import {
  AUDIT_ACTOR_SCOPE_META,
  STATUS_COLOR,
  type AuditActorScope,
  type PaginationMeta,
} from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useAuditLabels } from '../hooks/use-audit-labels';
import { auditActorName } from '../labels';
import type { AuditLog } from '../types';
import { AuditCategoryIcon } from './AuditCategoryIcon';
import styles from './AuditLogTable.module.css';

interface AuditLogTableProps {
  items: AuditLog[];
  meta: PaginationMeta;
  loading: boolean;
  /** Chỉ truyền khi tải lần đầu hỏng và không còn dữ liệu — xem hợp đồng của `DataTable`. */
  error?: { onRetry: () => void } | null;
  filtered?: boolean;
  onClearFilters?: () => void;
  onView: (id: string) => void;
  onPageChange: (page: number, pageSize: number) => void;
}

/** Tổng bề rộng năm cột — đủ chỗ cho câu "Sự kiện" mà không cuộn ngang ở màn 1280px. */
const MIN_TABLE_WIDTH = 1040;

/**
 * Bảng nhật ký hệ thống — mỗi dòng đọc như một câu: LÚC NÀO · CHUYỆN GÌ xảy ra với ĐỐI TƯỢNG nào ·
 * AI làm · ở GIAN HÀNG nào.
 *
 * Mã kỹ thuật (mã hành động, ULID) không có trên bảng: chúng nằm ở "Thông tin kỹ thuật" trong
 * panel chi tiết, và ô tìm kiếm vẫn khớp được ULID. Đối tượng hiện bằng TÊN do server tra
 * (`targetLabel`); loại không tra nhãn (dữ liệu cá nhân) rơi về mã rút gọn.
 */
export function AuditLogTable({
  items,
  meta,
  loading,
  error = null,
  filtered = false,
  onClearFilters,
  onView,
  onPageChange,
}: AuditLogTableProps) {
  const t = useTranslations('AdminAudit.table');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const labels = useAuditLabels();

  const columns: DataTableColumn<AuditLog>[] = [
    {
      title: t('columns.time'),
      key: 'createdAt',
      width: 130,
      render: (_, r) => (
        <div>
          <div className={styles.primary}>{fmt.date(r.createdAt)}</div>
          <div className={styles.meta}>{fmt.time(r.createdAt)}</div>
        </div>
      ),
    },
    {
      title: t('columns.event'),
      key: 'event',
      width: 360,
      render: (_, r) => (
        <div className={styles.event}>
          <AuditCategoryIcon action={r.action} />
          <div className={styles.eventText}>
            <div className={styles.action}>{labels.action(r.action)}</div>
            <div className={styles.meta} title={r.targetId ?? undefined}>
              {labels.target(r)}
            </div>
          </div>
        </div>
      ),
    },
    {
      title: t('columns.actor'),
      key: 'actor',
      width: 260,
      render: (_, r) => (
        <div>
          <div className={styles.actorLine}>
            <span className={styles.primary}>
              {auditActorName(r, t('systemActor'), tCommon('labels.emptyValue'))}
            </span>
            <StatusTag
              value={r.actorScope as AuditActorScope}
              meta={AUDIT_ACTOR_SCOPE_META}
              group="auditActorScope"
            />
            {r.viaSupport ? <Tag color={STATUS_COLOR.WAITING}>{t('viaSupport')}</Tag> : null}
          </div>
          {r.actorEmail ? <div className={styles.meta}>{r.actorEmail}</div> : null}
        </div>
      ),
    },
    {
      title: t('columns.tenant'),
      key: 'tenant',
      width: 170,
      render: (_, r) => r.tenantName ?? <span className={styles.meta}>{t('noTenant')}</span>,
    },
    actionColumn<AuditLog>(
      (row) => [
        {
          key: 'view',
          label: tCommon('actions.viewDetail'),
          icon: <EyeOutlined />,
          onClick: () => onView(row.id),
        },
      ],
      { width: 120 },
    ),
  ];

  return (
    <DataTable<AuditLog>
      label={t('label')}
      columns={columns}
      items={items}
      onRowClick={(row) => onView(row.id)}
      minWidth={MIN_TABLE_WIDTH}
      loading={loading}
      error={error ? { title: t('loadError'), onRetry: error.onRetry } : null}
      filtered={filtered}
      empty={{ title: t('empty') }}
      noResults={{
        title: t('noResults'),
        action: onClearFilters ? (
          <Button onClick={onClearFilters}>{tCommon('actions.clear')}</Button>
        ) : undefined,
      }}
      pagination={{
        meta,
        onChange: onPageChange,
        totalLabel: (total) => t('total', { count: total }),
      }}
    />
  );
}
