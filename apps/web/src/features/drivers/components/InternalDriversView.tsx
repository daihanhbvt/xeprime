'use client';

import { InboxOutlined, PlusOutlined, RollbackOutlined } from '@ant-design/icons';
import { App, Button, Input, Popconfirm, Segmented, Table, type TableColumnsType } from 'antd';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSION } from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { PermissionState } from '@/components/feedback/PermissionState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { usePermissions } from '@/hooks/use-permissions';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useErrorMessage } from '@/i18n/use-error-message';
import { telHref } from '@/lib/contact';
import { DRIVERS_DEFAULT_LIMIT } from '../api';
import {
  useArchiveInternalDriver,
  useInternalDrivers,
  useRestoreInternalDriver,
} from '../hooks/use-internal-drivers';
import type { InternalDriver, InternalDriverFilters } from '../types';
import { InternalDriverModal } from './InternalDriverModal';
import styles from './InternalDriversView.module.css';

const STATE = { ACTIVE: 'active', ARCHIVED: 'archived' } as const;

function parseFilters(params: URLSearchParams): InternalDriverFilters {
  const page = Number(params.get('page'));
  return {
    q: params.get('q') ?? undefined,
    archived: params.get('archived') === 'true' || undefined,
    page: page > 1 ? page : undefined,
    limit: Number(params.get('limit')) || undefined,
  };
}

/**
 * Danh bạ tài xế NỘI BỘ (ADR 0108) — người lái không có tài khoản XePrime (tài xế cố định của xe).
 * Chủ xe tự nhập họ tên + SĐT, gán thẳng vào chuyến có tài xế ở chi tiết đơn; hệ thống không gửi tin
 * cho họ. "Xoá" là lưu trữ: chuyến đã gán giữ nguyên người này.
 *
 * Tìm, trang và "đang dùng / đã lưu trữ" sống trên URL (ADR 0004); danh sách phân trang ở server.
 */
export function InternalDriversView({ viewSwitch }: { viewSwitch: ReactNode }) {
  const t = useTranslations('Drivers');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const errorMessage = useErrorMessage();
  const { filters, setFilters } = useUrlFilters(parseFilters);
  const [editing, setEditing] = useState<InternalDriver | null>(null);
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState(filters.q ?? '');

  const canView = has(PERMISSION.DRIVER_VIEW);
  const canManage = has(PERMISSION.DRIVER_MANAGE);
  const query = useInternalDrivers(filters, canView);
  const archive = useArchiveInternalDriver();
  const restore = useRestoreInternalDriver();

  const items = query.data?.items ?? [];
  const meta = query.data?.meta ?? {
    page: 1,
    limit: DRIVERS_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };

  const feedback = (key: 'internal.toast.archived' | 'internal.toast.restored') => ({
    onSuccess: () => message.success(t(key)),
    onError: (err: unknown) => message.error(errorMessage(err)),
  });

  const columns: TableColumnsType<InternalDriver> = [
    {
      key: 'name',
      title: t('internal.columns.name'),
      dataIndex: 'name',
      render: (name: string, row) => (
        <span className={styles.nameCell}>
          <span className={styles.name}>{name}</span>
          {row.note ? <span className={styles.note}>{row.note}</span> : null}
        </span>
      ),
    },
    {
      key: 'phone',
      title: t('internal.columns.phone'),
      dataIndex: 'phone',
      render: (phone: string) => {
        const href = telHref(phone);
        return href ? <a href={href}>{phone}</a> : phone;
      },
    },
    {
      key: 'trips',
      title: t('internal.columns.activeTrips'),
      dataIndex: 'activeTripCount',
      align: 'right',
      width: 160,
    },
    ...(canManage
      ? [
          {
            key: 'actions',
            title: <span className={styles.srOnly}>{t('internal.columns.actions')}</span>,
            align: 'right' as const,
            width: 220,
            render: (_: unknown, row: InternalDriver) =>
              row.archivedAt ? (
                <Button
                  size="small"
                  icon={<RollbackOutlined />}
                  loading={restore.isPending && restore.variables === row.id}
                  onClick={() => restore.mutate(row.id, feedback('internal.toast.restored'))}
                >
                  {t('internal.actions.restore')}
                </Button>
              ) : (
                <span className={styles.actions}>
                  <Button size="small" onClick={() => setEditing(row)}>
                    {tCommon('actions.edit')}
                  </Button>
                  <Popconfirm
                    title={t('internal.actions.archiveConfirm', { name: row.name })}
                    description={
                      row.activeTripCount > 0
                        ? t('internal.actions.archiveHasTrips', { count: row.activeTripCount })
                        : undefined
                    }
                    okText={t('internal.actions.archive')}
                    cancelText={tCommon('actions.cancel')}
                    onConfirm={() => archive.mutate(row.id, feedback('internal.toast.archived'))}
                  >
                    <Button
                      size="small"
                      icon={<InboxOutlined />}
                      loading={archive.isPending && archive.variables === row.id}
                    >
                      {t('internal.actions.archive')}
                    </Button>
                  </Popconfirm>
                </span>
              ),
          },
        ]
      : []),
  ];

  const addButton = canManage ? (
    <Button type="primary" size="large" icon={<PlusOutlined />} onClick={() => setCreating(true)}>
      {t('internal.actions.add')}
    </Button>
  ) : null;

  const hasQuery = Boolean(filters.q);

  if (!canView) {
    return <PermissionState kind="forbidden" missingPermissions={[PERMISSION.DRIVER_VIEW]} />;
  }

  return (
    <div className={styles.page}>
      <ManagePageHeader
        title={t('page.heading')}
        subtitle={t('internal.subtitle')}
        extra={addButton}
      />
      {viewSwitch}

      <div className={styles.toolbar}>
        <div className={styles.search}>
          <Input.Search
            size="large"
            allowClear
            value={search}
            placeholder={t('internal.searchPlaceholder')}
            aria-label={t('internal.searchPlaceholder')}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!e.target.value) setFilters({ q: undefined });
            }}
            onSearch={(value) => setFilters({ q: value.trim() || undefined })}
          />
        </div>
        <Segmented
          size="large"
          value={filters.archived ? STATE.ARCHIVED : STATE.ACTIVE}
          options={[
            { value: STATE.ACTIVE, label: t('internal.state.active') },
            { value: STATE.ARCHIVED, label: t('internal.state.archived') },
          ]}
          onChange={(value) => setFilters({ archived: value === STATE.ARCHIVED || undefined })}
        />
      </div>

      {query.isError ? (
        <EmptyState
          variant="error"
          title={t('page.loadError')}
          description={errorMessage(query.error)}
          action={
            <Button onClick={() => void query.refetch()} loading={query.isFetching}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : !query.isLoading && items.length === 0 ? (
        <EmptyState
          variant={hasQuery ? 'no-results' : 'empty'}
          title={
            hasQuery
              ? t('internal.empty.noResults')
              : filters.archived
                ? t('internal.empty.noArchived')
                : t('internal.empty.title')
          }
          description={hasQuery || filters.archived ? undefined : t('internal.empty.description')}
          action={hasQuery || filters.archived ? undefined : (addButton ?? undefined)}
        />
      ) : (
        <Table<InternalDriver>
          rowKey="id"
          columns={columns}
          dataSource={items}
          loading={query.isLoading || query.isFetching}
          scroll={{ x: 720 }}
          pagination={{
            current: meta.page,
            pageSize: meta.limit,
            total: meta.total,
            size: 'small',
            showTotal: (total) => t('internal.total', { total }),
            onChange: (page, pageSize) => setFilters({ page, limit: pageSize }),
          }}
        />
      )}

      <InternalDriverModal
        open={creating || editing !== null}
        driver={editing}
        onClose={() => {
          setCreating(false);
          setEditing(null);
        }}
      />
    </div>
  );
}
