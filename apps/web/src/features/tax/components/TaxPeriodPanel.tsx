'use client';

import { App, Alert, Button, DatePicker, Descriptions, Input, Modal, Skeleton, Space, Statistic } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import {
  TAX_WITHHOLDING_STATUS,
  TAX_WITHHOLDING_STATUS_META,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { dayjs, nowInAppTz } from '@/lib/datetime';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { taxExportUrl } from '../api';
import {
  useMarkPeriodDeclared,
  useMarkPeriodRemitted,
  useReverseTaxRow,
  useTaxPeriodSummary,
  useTaxRows,
} from '../hooks/use-tax';
import type { TaxRow } from '../types';

import styles from './TaxPeriodPanel.module.css';

/** Kỳ thuế là `YYYY-MM` — DatePicker ở chế độ tháng dùng đúng định dạng đó. */
const PERIOD_FORMAT = 'YYYY-MM';
const MIN_TABLE_WIDTH = 1100;

/**
 * SỔ THUẾ theo KỲ — Phase 8 (ADR 0032 điều 3).
 *
 * Màn này phục vụ một việc có thật: người làm tờ khai mở nó, đọc tổng của kỳ, đối chiếu phần
 * chia theo LOẠI CHỦ THỂ (vì cá nhân / hộ kinh doanh / doanh nghiệp đi vào những tờ khai khác
 * nhau), xuất CSV, rồi đánh dấu kỳ đã khai và đã nộp.
 *
 * Hai điều cố ý:
 *
 *  - **Chuyển trạng thái theo KỲ, không theo dòng.** Cơ quan thuế làm việc theo tờ khai tháng;
 *    cho bấm từng dòng sẽ sinh ra những kỳ nửa-khai mà không tờ khai nào khớp.
 *  - **Nhóm `unknown` hiện ra**, không gộp vào `individual`. Đó là gian hàng chưa khai hồ sơ
 *    người bán, và gộp là đoán hộ họ một nghĩa vụ pháp lý.
 */
export function TaxPeriodPanel() {
  const t = useTranslations('PlatformMoney.tax');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const [period, setPeriod] = useState(() => nowInAppTz().format(PERIOD_FORMAT));
  const [page, setPage] = useState(1);
  const [reversing, setReversing] = useState<TaxRow | null>(null);
  const [reason, setReason] = useState('');

  const summary = useTaxPeriodSummary(period);
  const rows = useTaxRows({ period, page });
  const declare = useMarkPeriodDeclared();
  const remit = useMarkPeriodRemitted();
  const reverse = useReverseTaxRow();

  const items = useMemo(() => rows.data?.data ?? [], [rows.data]);

  const columns = useMemo<DataTableColumn<TaxRow>[]>(
    () => [
      {
        key: 'booking',
        title: t('columns.booking'),
        render: (row) => (
          <div>
            <p className={styles.strong}>{row.bookingCode}</p>
            <p className={styles.muted}>{row.tenantName}</p>
          </div>
        ),
      },
      {
        key: 'entity',
        title: t('columns.entity'),
        render: (row) => (
          <div>
            <p>
              {row.entityType
                ? domainLabel('sellerEntityType', row.entityType, t('unknownEntity'))
                : t('unknownEntity')}
            </p>
            <p className={styles.muted}>{row.taxCode ?? '—'}</p>
          </div>
        ),
      },
      {
        key: 'base',
        title: t('columns.base'),
        render: (row) => (
          <div>
            <p>{fmt.money(row.taxableBase)}</p>
            <p className={styles.muted}>{t('percentOf', { percent: row.percent })}</p>
          </div>
        ),
      },
      {
        key: 'amount',
        title: t('columns.amount'),
        render: (row) => (
          /* Dòng ÂM là bút toán ĐẢO — nó phải đọc được là âm, không chỉ là một số nhỏ hơn. */
          <span className={Number(row.amount) < 0 ? styles.negative : styles.amount}>
            {fmt.money(row.amount)}
          </span>
        ),
      },
      {
        key: 'status',
        title: t('columns.status'),
        render: (row) => (
          <div>
            <StatusTag
              value={row.status}
              meta={TAX_WITHHOLDING_STATUS_META}
              group="taxWithholdingStatus"
            />
            {row.reversalReason ? <p className={styles.muted}>{row.reversalReason}</p> : null}
          </div>
        ),
      },
      {
        key: 'actions',
        title: tCommon('labels.actions'),
        render: (row) => (
          <Button
            size="small"
            danger
            // Dòng đảo không đảo được, và dòng đã nộp phải sửa bằng tờ khai điều chỉnh.
            disabled={row.reversalOfId !== null || row.status === TAX_WITHHOLDING_STATUS.REMITTED}
            onClick={() => {
              setReason('');
              setReversing(row);
            }}
          >
            {t('actions.reverse')}
          </Button>
        ),
      },
    ],
    [t, tCommon, fmt, domainLabel],
  );

  const data = summary.data;

  return (
    <div className={styles.panel}>
      <div className={styles.toolbar}>
        <DatePicker
          picker="month"
          value={dayjs(period, PERIOD_FORMAT)}
          allowClear={false}
          aria-label={t('period')}
          onChange={(value) => {
            if (value) {
              setPeriod(value.format(PERIOD_FORMAT));
              setPage(1);
            }
          }}
        />
        <Space size="small" wrap>
          {/*
            Tải CSV bằng thẻ <a> chứ không fetch: session là httpOnly cookie (ADR 0002) nên
            trình duyệt tự mang đủ credential, và một kỳ vài nghìn dòng không cần đi qua bộ nhớ JS.
          */}
          <Button href={taxExportUrl(period)} target="_blank" rel="noreferrer">
            {t('actions.export')}
          </Button>
          <Button
            loading={declare.isPending}
            onClick={() =>
              declare.mutate(period, {
                onSuccess: () => message.success(t('actions.declaredDone')),
                onError: (error) => message.error(errorMessage(error)),
              })
            }
          >
            {t('actions.markDeclared')}
          </Button>
          <Button
            type="primary"
            loading={remit.isPending}
            onClick={() =>
              remit.mutate(period, {
                onSuccess: () => message.success(t('actions.remittedDone')),
                onError: (error) => message.error(errorMessage(error)),
              })
            }
          >
            {t('actions.markRemitted')}
          </Button>
        </Space>
      </div>

      {summary.isLoading ? <Skeleton active paragraph={{ rows: 6 }} /> : null}

      {summary.isError && !data ? (
        <Alert
          type="error"
          showIcon
          title={t('loadError')}
          action={
            <Button size="small" onClick={() => void summary.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : null}

      {data ? (
        <>
          <div className={styles.stats}>
            <Statistic title={t('stats.total')} value={fmt.money(data.totalAmount)} />
            <Statistic title={t('stats.accrued')} value={fmt.money(data.accruedAmount)} />
            <Statistic title={t('stats.declared')} value={fmt.money(data.declaredAmount)} />
            <Statistic title={t('stats.remitted')} value={fmt.money(data.remittedAmount)} />
          </div>

          {/*
            Chia theo LOẠI CHỦ THỂ là số liệu người làm thuế cần, không phải một chiều lọc thêm:
            ba loại chủ thể có nghĩa vụ khác nhau và đi vào những tờ khai khác nhau.
          */}
          <Descriptions size="small" column={1} bordered title={t('byEntity.title')}>
            {data.byEntityType.map((entry) => (
              <Descriptions.Item
                key={entry.entityType}
                label={
                  entry.entityType === 'unknown'
                    ? t('unknownEntity')
                    : domainLabel('sellerEntityType', entry.entityType, entry.entityType)
                }
              >
                {t('byEntity.value', { amount: fmt.money(entry.amount), count: entry.rows })}
              </Descriptions.Item>
            ))}
          </Descriptions>

          {data.byEntityType.some((e) => e.entityType === 'unknown' && Number(e.amount) > 0) ? (
            <Alert
              type="warning"
              showIcon
              title={t('unknownWarning.title')}
              description={t('unknownWarning.body')}
            />
          ) : null}
        </>
      ) : null}

      <DataTable<TaxRow>
        label={t('title')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={rows.isFetching}
        error={
          rows.isError && !rows.data
            ? { title: t('loadError'), onRetry: () => void rows.refetch() }
            : null
        }
        empty={{ title: t('empty.title'), description: t('empty.description') }}
        pagination={{
          meta: rows.data?.meta ?? { page: 1, limit: 20, total: 0, hasNext: false },
          onChange: (next) => setPage(next),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      <Modal
        open={reversing !== null}
        title={t('reverseModal.title')}
        okText={t('actions.reverse')}
        okButtonProps={{ danger: true, disabled: reason.trim().length < 5 }}
        cancelText={tCommon('actions.cancel')}
        confirmLoading={reverse.isPending}
        onCancel={() => setReversing(null)}
        onOk={() => {
          if (!reversing) return;
          reverse.mutate(
            { id: reversing.id, reason: reason.trim() },
            {
              onSuccess: () => {
                setReversing(null);
                message.success(t('reverseModal.done'));
              },
              onError: (error) => message.error(errorMessage(error)),
            },
          );
        }}
      >
        <p>{t('reverseModal.hint')}</p>
        <Input.TextArea
          value={reason}
          rows={3}
          maxLength={500}
          aria-label={t('reverseModal.reasonLabel')}
          placeholder={t('reverseModal.reasonPlaceholder')}
          onChange={(e) => setReason(e.target.value)}
        />
      </Modal>
    </div>
  );
}
