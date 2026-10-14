'use client';

import { CheckCircleOutlined, CopyOutlined, DeleteOutlined, EditOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, App, Button, Input, Tag } from 'antd';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { adminAppConfigPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  useActivatePlanGuideTemplate,
  useDeletePlanGuideTemplate,
  usePlanGuideTemplateFilters,
  usePlanGuideTemplates,
} from '../hooks/use-app-config';
import type { PlanGuideTemplateSummary } from '../types';
import { DuplicateTemplateDialog } from './DuplicateTemplateDialog';
import styles from './PlanGuideTemplateList.module.css';

const MIN_TABLE_WIDTH = 900;

/**
 * Danh sách mẫu email hướng dẫn gói — tìm + phân trang Ở SERVER, bộ lọc trên URL (ADR 0004).
 * Đúng MỘT mẫu đang dùng (DB gác bằng partial unique index); mẫu đó không xoá được.
 */
export function PlanGuideTemplateList() {
  const t = useTranslations('AdminAppConfig');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const router = useRouter();
  const { message, modal } = App.useApp();

  const { filters, setFilters } = usePlanGuideTemplateFilters();
  const { data, isError, isFetching, refetch } = usePlanGuideTemplates(filters);
  const activate = useActivatePlanGuideTemplate();
  const remove = useDeletePlanGuideTemplate();
  const [duplicating, setDuplicating] = useState<PlanGuideTemplateSummary | null>(null);

  const hasFilters = Boolean(filters.q);

  const confirmAction = (
    row: PlanGuideTemplateSummary,
    kind: 'activate' | 'delete',
  ) => {
    const mutation = kind === 'activate' ? activate : remove;
    modal.confirm({
      title: t(`templates.confirm.${kind}Title`, { name: row.name }),
      content: t(`templates.confirm.${kind}Body`),
      okText: t('templates.confirm.ok'),
      cancelText: t('templates.confirm.cancel'),
      okButtonProps: kind === 'delete' ? { danger: true } : undefined,
      onOk: () =>
        new Promise<void>((resolve) => {
          mutation.mutate(row.id, {
            onSuccess: () => {
              message.success(
                t(kind === 'activate' ? 'templates.toast.activated' : 'templates.toast.deleted', {
                  name: row.name,
                }),
              );
              resolve();
            },
            onError: (err) => {
              message.error(errorMessage(err));
              resolve();
            },
          });
        }),
    });
  };

  const createButton = (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => router.push(adminAppConfigPath.newTemplate())}>
      {t('templates.create')}
    </Button>
  );

  const columns: DataTableColumn<PlanGuideTemplateSummary>[] = [
    {
      title: t('templates.column.name'),
      key: 'name',
      render: (_, row) => (
        <div className={styles.cellStack}>
          <Link href={adminAppConfigPath.template(row.id)} className={styles.cellMain}>
            {row.name}
          </Link>
          <span className={styles.code}>{row.code}</span>
        </div>
      ),
    },
    {
      title: t('templates.column.status'),
      key: 'status',
      width: 130,
      render: (_, row) =>
        row.isActive ? (
          <Tag color={STATUS_COLOR.SUCCESS}>{t('templates.active')}</Tag>
        ) : (
          <Tag color={STATUS_COLOR.NEUTRAL}>{t('templates.inactive')}</Tag>
        ),
    },
    {
      title: t('templates.column.updatedAt'),
      key: 'updatedAt',
      width: 190,
      render: (_, row) => (
        <div className={styles.cellStack}>
          <span>{fmt.dateTime(row.updatedAt)}</span>
          {row.updatedByName ? (
            <span className={styles.cellSub}>{t('templates.updatedBy', { name: row.updatedByName })}</span>
          ) : null}
        </div>
      ),
    },
    actionColumn<PlanGuideTemplateSummary>(
      (row) => [
        {
          key: 'edit',
          label: t('templates.action.edit'),
          icon: <EditOutlined />,
          onClick: () => router.push(adminAppConfigPath.template(row.id)),
        },
        ...(row.isActive
          ? []
          : [
              {
                key: 'activate',
                label: t('templates.action.activate'),
                icon: <CheckCircleOutlined />,
                loading: activate.isPending && activate.variables === row.id,
                onClick: () => confirmAction(row, 'activate'),
              },
            ]),
        {
          key: 'duplicate',
          label: t('templates.action.duplicate'),
          icon: <CopyOutlined />,
          onClick: () => setDuplicating(row),
        },
        // Mẫu đang dùng không xoá được (server trả PLAN_GUIDE_TEMPLATE_ACTIVE) ⇒ ẩn hẳn nút.
        ...(row.isActive
          ? []
          : [
              {
                key: 'delete',
                label: t('templates.action.delete'),
                icon: <DeleteOutlined />,
                danger: true,
                loading: remove.isPending && remove.variables === row.id,
                onClick: () => confirmAction(row, 'delete'),
              },
            ]),
      ],
      { width: 200, maxInline: 2 },
    ),
  ];

  return (
    <div>
      <div className={styles.head}>
        <Alert type="info" showIcon message={t('templates.explain')} />
        <div className={styles.toolbar}>
          <Input.Search
            className={styles.search}
            allowClear
            placeholder={t('templates.search')}
            aria-label={t('templates.search')}
            defaultValue={filters.q ?? ''}
            onSearch={(value) => setFilters({ q: value.trim() || undefined })}
          />
          {createButton}
        </div>
      </div>

      <DataTable<PlanGuideTemplateSummary>
        label={t('page.tabs.templates')}
        columns={columns}
        items={data?.items ?? []}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        filtered={hasFilters}
        error={isError && !data ? { title: t('templates.error'), onRetry: () => void refetch() } : null}
        empty={{ title: t('templates.empty.title'), description: t('templates.empty.hint'), action: createButton }}
        noResults={{ title: t('templates.emptyFiltered') }}
        pagination={
          data
            ? {
                meta: data.meta,
                onChange: (page) => setFilters({ page }),
                totalLabel: (total) => t('templates.total', { count: total }),
              }
            : undefined
        }
      />

      <DuplicateTemplateDialog
        key={duplicating?.id ?? 'none'}
        source={duplicating}
        onClose={() => setDuplicating(null)}
      />
    </div>
  );
}
