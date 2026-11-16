'use client';

import { DownloadOutlined, InboxOutlined } from '@ant-design/icons';
import {
  BODY_TYPE_VALUES,
  FUEL_TYPE_VALUES,
  STATUS_COLOR,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_DATA_FILE_FIELDS,
  VEHICLE_DATA_IMPORT_LIMITS,
  VEHICLE_DATA_IMPORT_STATUS,
  VEHICLE_DATA_ISSUE_LEVEL,
  VEHICLE_DATA_ROW_ACTION,
  VEHICLE_DATA_STATUS,
  type VehicleDataFileField,
  type VehicleDataImportStatus,
  type VehicleDataIssueCode,
  type VehicleDataRowAction,
  type VehicleDataStatus,
} from '@xeprime/types';
import { Alert, App, Button, Popconfirm, Segmented, Tag, Upload } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';

import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';

import { vehicleDataHref } from '../api';
import {
  useApplyVehicleDataImport,
  useDiscardVehicleDataImport,
  useUploadVehicleDataImport,
  useVehicleDataImport,
  useVehicleDataImportRows,
} from '../hooks';
import type {
  VehicleDataImportChange,
  VehicleDataImportIssue,
  VehicleDataImportRow,
} from '../types';
import styles from './VehicleData.module.css';

const ROWS_LIMIT = 20;
const FILTER_ISSUES = 'issues';
const FILTER_ALL = 'everything';
/** Số ô thay đổi hiện thẳng trong một dòng; phần còn lại gói thành "và n ô khác". */
const CHANGES_SHOWN = 6;

const ACTION_COLOR: Record<VehicleDataRowAction, string> = {
  [VEHICLE_DATA_ROW_ACTION.CREATE]: STATUS_COLOR.SUCCESS,
  [VEHICLE_DATA_ROW_ACTION.UPDATE]: STATUS_COLOR.PROCESSING,
  [VEHICLE_DATA_ROW_ACTION.UNCHANGED]: STATUS_COLOR.NEUTRAL,
  [VEHICLE_DATA_ROW_ACTION.ERROR]: STATUS_COLOR.DANGER,
};

const STATS = [
  'rowsTotal',
  'rowsCreate',
  'rowsUpdate',
  'rowsUnchanged',
  'rowsError',
  'rowsWarning',
  'newBrands',
  'newModels',
] as const;

const isFileField = (v: string | null): v is VehicleDataFileField =>
  v !== null && (VEHICLE_DATA_FILE_FIELDS as readonly string[]).includes(v);

/**
 * Nhập file Dữ liệu xe: tải file → XEM TRƯỚC từng dòng (thêm mới · cập nhật cũ → mới · lỗi) → Áp
 * dụng trong một transaction, hoặc huỷ. Mở lại từ lịch sử thì xem lại kết quả đã áp dụng.
 */
export function VehicleDataImportDialog({
  open,
  importId,
  onClose,
}: {
  open: boolean;
  /** Mở thẳng một lượt nhập (từ lịch sử). */
  importId?: string | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminVehicleData.import');
  const [currentId, setCurrentId] = useState<string | null>(importId ?? null);
  const close = () => {
    setCurrentId(null);
    onClose();
  };
  return (
    <ResponsiveDialog open={open} onClose={close} size="xl" title={t('title')} footer={null}>
      {currentId ? (
        <ImportPreview id={currentId} onUploadAnother={() => setCurrentId(null)} onDone={close} />
      ) : (
        <ImportUpload onUploaded={setCurrentId} />
      )}
    </ResponsiveDialog>
  );
}

function ImportUpload({ onUploaded }: { onUploaded: (id: string) => void }) {
  const t = useTranslations('AdminVehicleData.import');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const upload = useUploadVehicleDataImport();
  return (
    <div className={styles.stack}>
      <p className={styles.note}>{t('intro')}</p>
      <div className={styles.actions}>
        <Button icon={<DownloadOutlined aria-hidden />} href={vehicleDataHref.template()}>
          {t('template')}
        </Button>
      </div>
      <Upload.Dragger
        accept=".xlsx,.csv"
        multiple={false}
        showUploadList={false}
        disabled={upload.isPending}
        beforeUpload={(file) => {
          if (file.size > VEHICLE_DATA_IMPORT_LIMITS.maxBytes) {
            message.error(t('tooLarge'));
            return Upload.LIST_IGNORE;
          }
          upload.mutate(file, {
            onSuccess: (result) => onUploaded(result.id),
            onError: (err) => message.error(errorMessage(err)),
          });
          // Tự gửi bằng mutation — chặn AntD tự POST.
          return false;
        }}
      >
        <p className={styles.dropIcon}>
          <InboxOutlined aria-hidden />
        </p>
        <p>{upload.isPending ? t('uploading') : t('dropTitle')}</p>
        <p className={styles.note}>{t('dropHint')}</p>
      </Upload.Dragger>
    </div>
  );
}

function ImportPreview({
  id,
  onUploadAnother,
  onDone,
}: {
  id: string;
  onUploadAnother: () => void;
  onDone: () => void;
}) {
  const t = useTranslations('AdminVehicleData.import');
  const tRoot = useTranslations('AdminVehicleData');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const detail = useVehicleDataImport(id);
  const [filter, setFilter] = useState<string>(FILTER_ISSUES);
  const [page, setPage] = useState(1);
  const rows = useVehicleDataImportRows(id, {
    ...(filter === FILTER_ISSUES
      ? { withIssues: true }
      : filter !== FILTER_ALL
        ? { action: filter }
        : {}),
    page,
    limit: ROWS_LIMIT,
  });
  const apply = useApplyVehicleDataImport();
  const discard = useDiscardVehicleDataImport();
  // Đồng hồ dùng chung (nhịp phút) — bản xem trước tự chuyển sang "hết hạn" khi tới giờ.
  const now = useNow();

  const record = detail.data;
  if (detail.isLoading) return null;
  if (!record) return <Alert type="error" showIcon title={t('loadError')} />;
  const s = record.summary;
  const expired = new Date(record.expiresAt).getTime() < now;
  const canApply = record.status === VEHICLE_DATA_IMPORT_STATUS.PREVIEWED && !expired;

  /** Giá trị một ô để hiện "cũ → mới": mã danh mục dịch ra nhãn, tiền định dạng. */
  const valueText = (field: string, value: string | null): string => {
    if (value == null || value === '') return t('emptyValue');
    if (field === 'fuelType' && (FUEL_TYPE_VALUES as readonly string[]).includes(value)) {
      return domainLabel('fuelType', value);
    }
    if (
      field === 'transmission' &&
      (TRANSMISSION_TYPE_EXT_VALUES as readonly string[]).includes(value)
    ) {
      return domainLabel('transmissionType', value);
    }
    if (field === 'bodyType' && (BODY_TYPE_VALUES as readonly string[]).includes(value)) {
      return domainLabel('bodyType', value);
    }
    if (field === 'status' && value in STATUS_LABEL_KEY) {
      return tRoot(`status.${STATUS_LABEL_KEY[value]!}`);
    }
    if (/Price$/.test(field) && /^\d+$/.test(value)) return fmt.money(value);
    return value;
  };

  const changeText = (c: VehicleDataImportChange) => {
    const field = isFileField(c.field) ? t(`fields.${c.field}`) : c.field;
    return c.before == null
      ? t('changeNew', { field, after: valueText(c.field, c.after) })
      : t('change', {
          field,
          before: valueText(c.field, c.before),
          after: valueText(c.field, c.after),
        });
  };

  const columns: DataTableColumn<VehicleDataImportRow>[] = [
    {
      title: t('columns.row'),
      key: 'row',
      width: 110,
      render: (_, r) => t('rowNumber', { row: r.rowNumber }),
    },
    {
      title: t('columns.action'),
      key: 'action',
      width: 120,
      render: (_, r) => (
        <Tag color={ACTION_COLOR[r.action as VehicleDataRowAction]} className={styles.tag}>
          {t(`action.${r.action as VehicleDataRowAction}`)}
        </Tag>
      ),
    },
    {
      title: t('columns.title'),
      key: 'title',
      width: 260,
      render: (_, r) => <span className={styles.strong}>{r.title}</span>,
    },
    {
      title: t('columns.detail'),
      key: 'detail',
      render: (_, r) => (
        <ul className={styles.issues}>
          {r.issues.map((issue, i) => (
            <li key={`i${i}`} className={issueClass(issue)}>
              {issueText(t, issue)}
            </li>
          ))}
          {r.changes.slice(0, CHANGES_SHOWN).map((c) => (
            <li key={`c${c.field}`} className={styles.change}>
              {changeText(c)}
            </li>
          ))}
          {r.changes.length > CHANGES_SHOWN ? (
            <li className={styles.issueInfo}>
              {t('changesMore', { count: r.changes.length - CHANGES_SHOWN })}
            </li>
          ) : null}
        </ul>
      ),
    },
  ];

  return (
    <section className={styles.stack} aria-labelledby="vd-import-preview">
      <header className={styles.previewHead}>
        <div className={styles.stack}>
          <h3 id="vd-import-preview" className={styles.sectionTitle}>
            {t('previewTitle', { file: record.fileName })}
          </h3>
          <span className={styles.muted}>
            {record.status === VEHICLE_DATA_IMPORT_STATUS.PREVIEWED
              ? expired
                ? t('expired')
                : t('expiresAt', { time: fmt.dateTime(record.expiresAt) })
              : t(`status.${record.status as VehicleDataImportStatus}`)}
          </span>
        </div>
        <div className={styles.actions}>
          {canApply ? (
            <>
              <Button
                loading={discard.isPending}
                onClick={() =>
                  discard.mutate(id, {
                    onSuccess: () => {
                      message.success(t('discarded'));
                      onUploadAnother();
                    },
                    onError: (err) => message.error(errorMessage(err)),
                  })
                }
              >
                {t('discard')}
              </Button>
              <Popconfirm
                title={t('applyConfirm', {
                  create: s.rowsCreate,
                  update: s.rowsUpdate,
                  error: s.rowsError,
                })}
                okText={t('apply')}
                cancelText={t('cancel')}
                onConfirm={() =>
                  apply.mutate(id, {
                    onSuccess: () => {
                      message.success(t('applied'));
                      onDone();
                    },
                    onError: (err) => message.error(errorMessage(err)),
                  })
                }
              >
                <Button
                  type="primary"
                  loading={apply.isPending}
                  disabled={s.rowsCreate + s.rowsUpdate === 0}
                >
                  {t('apply')}
                </Button>
              </Popconfirm>
            </>
          ) : (
            <Button onClick={onUploadAnother}>{t('uploadAnother')}</Button>
          )}
        </div>
      </header>

      {canApply && s.rowsCreate + s.rowsUpdate === 0 ? (
        <Alert type="info" showIcon title={t('nothingToApply')} />
      ) : null}

      <dl className={styles.stats}>
        {STATS.map((key) => (
          <div key={key} className={styles.stat}>
            <dt>{t(`stats.${key}`)}</dt>
            <dd>{s[key]}</dd>
          </div>
        ))}
      </dl>
      {s.unknownColumns.length > 0 ? (
        <p className={styles.note}>
          {t('unknownColumns', { columns: s.unknownColumns.join(', ') })}
        </p>
      ) : null}

      <Segmented<string>
        value={filter}
        onChange={(next) => {
          setFilter(next);
          setPage(1);
        }}
        options={[
          { value: FILTER_ISSUES, label: t('rowFilter.issues') },
          { value: FILTER_ALL, label: t('rowFilter.all') },
          { value: VEHICLE_DATA_ROW_ACTION.CREATE, label: t('rowFilter.create') },
          { value: VEHICLE_DATA_ROW_ACTION.UPDATE, label: t('rowFilter.update') },
          { value: VEHICLE_DATA_ROW_ACTION.ERROR, label: t('rowFilter.error') },
        ]}
      />
      <DataTable<VehicleDataImportRow>
        label={t('rowsTableLabel')}
        columns={columns}
        items={rows.data?.items ?? []}
        rowKey={(r) => `${r.rowNumber}:${r.title}`}
        minWidth={820}
        loading={rows.isFetching}
        error={
          rows.isError && !rows.data
            ? { title: t('loadError'), onRetry: () => void rows.refetch() }
            : null
        }
        filtered={filter !== FILTER_ALL}
        empty={{ title: t('rowsNone') }}
        noResults={{ title: t('rowsNoneFiltered') }}
        pagination={{
          meta: rows.data?.meta ?? { page, limit: ROWS_LIMIT, total: 0, hasNext: false },
          onChange: (next) => setPage(next),
          totalLabel: (total) => t('rowsTotal', { count: total }),
        }}
      />
    </section>
  );
}

const STATUS_LABEL_KEY: Record<string, VehicleDataStatus> = {
  [VEHICLE_DATA_STATUS.ACTIVE]: VEHICLE_DATA_STATUS.ACTIVE,
  [VEHICLE_DATA_STATUS.HIDDEN]: VEHICLE_DATA_STATUS.HIDDEN,
  [VEHICLE_DATA_STATUS.PENDING]: VEHICLE_DATA_STATUS.PENDING,
};

function issueClass(issue: VehicleDataImportIssue): string {
  if (issue.level === VEHICLE_DATA_ISSUE_LEVEL.ERROR) return styles.issueError ?? '';
  if (issue.level === VEHICLE_DATA_ISSUE_LEVEL.WARNING) return styles.issueWarning ?? '';
  return styles.issueInfo ?? '';
}

function issueText(
  t: ReturnType<typeof useTranslations<'AdminVehicleData.import'>>,
  issue: VehicleDataImportIssue,
): string {
  const field = isFileField(issue.field) ? t(`fields.${issue.field}`) : (issue.field ?? '');
  return t(`issues.${issue.code as VehicleDataIssueCode}`, { field, value: issue.value ?? '' });
}
