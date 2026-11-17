'use client';

import { PlusOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SUPPORT_CASE_CATEGORY_VALUES,
  SUPPORT_CASE_STATUS_META,
  SUPPORT_CASE_STATUS_VALUES,
  isSupportCaseCategory,
  isSupportCaseStatus,
  type SupportCaseStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { positiveIntParam, useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { SUPPORT_DEFAULT_LIMIT } from '../api';
import { useCanWriteSupportCase, useSupportCases } from '../hooks/use-support-cases';
import { SUPPORT_SURFACE, type SupportCase, type SupportCaseFilters, type SupportSurface } from '../types';
import { OpenCaseModal } from './OpenCaseModal';
import { SupportCaseDetailPanel } from './SupportCaseDetailPanel';
import styles from './SupportCasesView.module.css';

const MIN_TABLE_WIDTH = 860;

/** Bộ lọc trên URL + case đang mở (`?open=`). */
interface SupportCaseUrlFilters extends SupportCaseFilters {
  open?: string;
}

function parseFilters(params: URLSearchParams): SupportCaseUrlFilters {
  const status = params.get('status');
  const category = params.get('category');
  return {
    q: params.get('q')?.trim() || undefined,
    status: isSupportCaseStatus(status) ? status : undefined,
    category: isSupportCaseCategory(category) ? category : undefined,
    page: positiveIntParam(params, 'page'),
    limit: positiveIntParam(params, 'limit'),
    open: params.get('open') || undefined,
  };
}

/**
 * Danh sách + chi tiết case, DÙNG CHUNG cho ba bề mặt (khách / gian hàng / nền tảng).
 *
 * Ba màn khác nhau đúng hai thứ: đường dẫn gốc (`SUPPORT_BASE_PATH`) và tập hành động. Viết ba
 * bản là ba nơi để sót một quy tắc — phạm vi đọc vốn đã nằm ở server, nên client không có gì
 * riêng để giấu.
 */
export function SupportCasesView({ surface }: { surface: SupportSurface }) {
  const t = useTranslations('SupportCases');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  // Bộ lọc, trang và case đang mở sống ở URL (ADR 0004): F5, nút Back và link từ màn khác (vd.
  // "Kết luận ở hỗ trợ" của màn Tài chính) đều mở lại đúng chỗ.
  const { filters, setFilters } = useUrlFilters(parseFilters);
  const openId = filters.open ?? null;
  const setOpenId = (id: string | null) =>
    setFilters({ open: id ?? undefined }, { resetPage: false });
  const [formOpen, setFormOpen] = useState(false);

  const { data, isError, isFetching, refetch } = useSupportCases(surface, filters);
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: SUPPORT_DEFAULT_LIMIT, total: 0, hasNext: false };

  // Nền tảng KHÔNG mở case thay người khác: một case phải có người mở thật, và tự mở hộ là cách
  // nhanh nhất để một khiếu nại mất chủ.
  const canWrite = useCanWriteSupportCase(surface);
  const canOpen = surface !== SUPPORT_SURFACE.PLATFORM && canWrite;

  const filterFields: FilterField[] = [
    { kind: 'search', key: 'q', label: t('filters.search'), placeholder: t('filters.searchPlaceholder') },
    {
      kind: 'select',
      key: 'status',
      label: t('filters.status'),
      options: SUPPORT_CASE_STATUS_VALUES.map((status) => ({
        value: status,
        label: domainLabel('supportCaseStatus', status),
      })),
      allowClear: true,
    },
    {
      kind: 'select',
      key: 'category',
      label: t('filters.category'),
      options: SUPPORT_CASE_CATEGORY_VALUES.map((category) => ({
        value: category,
        label: domainLabel('supportCaseCategory', category),
      })),
      allowClear: true,
    },
  ];

  const columns: DataTableColumn<SupportCase>[] = [
    {
      title: t('columns.case'),
      key: 'case',
      render: (_, row) => (
        <div>
          <div className={styles.code}>{row.code}</div>
          <div>{row.subject}</div>
        </div>
      ),
    },
    {
      title: t('columns.category'),
      key: 'category',
      width: 170,
      render: (_, row) => domainLabel('supportCaseCategory', row.category),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 140,
      render: (_, row) => (
        <StatusTag
          value={row.status as SupportCaseStatus}
          meta={SUPPORT_CASE_STATUS_META}
          group="supportCaseStatus"
        />
      ),
    },
    {
      title: t('columns.updatedAt'),
      key: 'updatedAt',
      width: 160,
      render: (_, row) => fmt.dateTime(row.updatedAt),
    },
  ];

  const openButton = canOpen ? (
    <Button type="primary" icon={<PlusOutlined />} onClick={() => setFormOpen(true)}>
      {t('page.openButton')}
    </Button>
  ) : undefined;

  return (
    <div>
      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, status: filters.status, category: filters.category }}
        // `FilterBar` gửi đúng TRƯỜNG vừa đổi — ghi thẳng bản vá, dựng lại cả bộ là xoá các ô kia.
        onChange={(next) => setFilters(next as Partial<SupportCaseUrlFilters>)}
        onClear={() => setFilters({ q: undefined, status: undefined, category: undefined })}
        actions={openButton}
      />

      <DataTable<SupportCase>
        label={t('page.tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('page.loadError'), onRetry: () => void refetch() } : null}
        empty={{ title: t('page.empty'), action: openButton }}
        onRowClick={(row) => setOpenId(row.id)}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('page.total', { count: total }),
        }}
      />

      <ResponsiveDialog
        title={t('detail.title')}
        open={Boolean(openId)}
        onClose={() => setOpenId(null)}
        size="lg"
        footer={null}
      >
        <SupportCaseDetailPanel surface={surface} id={openId} />
      </ResponsiveDialog>

      {canOpen ? (
        <OpenCaseModal
          surface={surface}
          open={formOpen}
          onClose={() => setFormOpen(false)}
          onOpened={(id) => setOpenId(id)}
        />
      ) : null}
    </div>
  );
}
