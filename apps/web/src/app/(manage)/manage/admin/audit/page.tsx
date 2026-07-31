'use client';

import { Button, DatePicker, Empty, Result, Segmented, Select, Space, Spin } from 'antd';
import { Suspense, useState } from 'react';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { DAY_PARAM_FORMAT, dayjs, type Dayjs } from '@/lib/datetime';
import { AUDIT_LOGS_DEFAULT_LIMIT } from '@/features/admin-audit/api';
import {
  AUDIT_ACTION_OPTIONS,
  AUDIT_SCOPE_OPTIONS,
  AUDIT_TARGET_TYPE_OPTIONS,
} from '@/features/admin-audit/constants';
import { AuditLogDetailDrawer } from '@/features/admin-audit/components/AuditLogDetailDrawer';
import { AuditLogTable } from '@/features/admin-audit/components/AuditLogTable';
import { useAuditFilters } from '@/features/admin-audit/hooks/use-audit-filters';
import { useAuditLogs } from '@/features/admin-audit/hooks/use-audit-logs';
import styles from './audit-page.module.css';

export default function AdminAuditPage() {
  return (
    <Suspense fallback={<Spin size="large" className={styles.state} />}>
      <AdminAuditView />
    </Suspense>
  );
}

function AdminAuditView() {
  const { filters, setFilters } = useAuditFilters();
  const { data, isError, refetch, isFetching } = useAuditLogs(filters);
  const [selected, setSelected] = useState<string | null>(null);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: AUDIT_LOGS_DEFAULT_LIMIT, total: 0, hasNext: false };
  const hasFilters = Boolean(
    (filters.actorScope && filters.actorScope !== 'all') ||
      (filters.action && filters.action !== 'all') ||
      (filters.targetType && filters.targetType !== 'all') ||
      filters.dateFrom ||
      filters.dateTo,
  );

  const range: [Dayjs | null, Dayjs | null] = [
    filters.dateFrom ? dayjs(filters.dateFrom, DAY_PARAM_FORMAT) : null,
    filters.dateTo ? dayjs(filters.dateTo, DAY_PARAM_FORMAT) : null,
  ];

  return (
    <div>
      <ManagePageHeader
        title="Nhật ký hệ thống"
        extra={
          <Space wrap>
            <Segmented
              value={filters.actorScope ?? 'all'}
              options={AUDIT_SCOPE_OPTIONS}
              onChange={(value) => setFilters({ actorScope: String(value) })}
            />
            <Select
              className={styles.actionSelect}
              size="large"
              showSearch
              optionFilterProp="label"
              value={filters.action ?? 'all'}
              options={AUDIT_ACTION_OPTIONS}
              onChange={(value: string) => setFilters({ action: value })}
            />
            <Select
              className={styles.targetSelect}
              size="large"
              value={filters.targetType ?? 'all'}
              options={AUDIT_TARGET_TYPE_OPTIONS}
              onChange={(value: string) => setFilters({ targetType: value })}
            />
            <DatePicker.RangePicker
              className={styles.rangePicker}
              size="large"
              allowEmpty={[true, true]}
              value={range}
              format="DD/MM/YYYY"
              onChange={(dates) =>
                setFilters({
                  dateFrom: dates?.[0] ? dates[0].format(DAY_PARAM_FORMAT) : undefined,
                  dateTo: dates?.[1] ? dates[1].format(DAY_PARAM_FORMAT) : undefined,
                })
              }
            />
          </Space>
        }
      />

      {isError && !data ? (
        <Result
          status="error"
          title="Không tải được nhật ký"
          extra={
            <Button type="primary" onClick={() => void refetch()}>
              Thử lại
            </Button>
          }
        />
      ) : !isFetching && items.length === 0 ? (
        <Empty
          className={styles.state}
          description={hasFilters ? 'Không có dòng nhật ký khớp bộ lọc' : 'Chưa có nhật ký nào'}
        >
          {hasFilters ? (
            <Button
              onClick={() =>
                setFilters({
                  actorScope: 'all',
                  action: 'all',
                  targetType: 'all',
                  dateFrom: undefined,
                  dateTo: undefined,
                })
              }
            >
              Xoá bộ lọc
            </Button>
          ) : null}
        </Empty>
      ) : (
        <AuditLogTable
          items={items}
          meta={meta}
          loading={isFetching}
          onView={(id) => setSelected(id)}
          onPageChange={(page, pageSize) => setFilters({ page, limit: pageSize })}
        />
      )}

      <AuditLogDetailDrawer logId={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
