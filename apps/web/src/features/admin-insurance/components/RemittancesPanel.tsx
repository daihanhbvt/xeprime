'use client';

import { DownloadOutlined, PlusOutlined, RightOutlined } from '@ant-design/icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import * as yup from 'yup';
import {
  INSURANCE_REMITTANCE_LIMITS,
  INSURANCE_REMITTANCE_STATUS,
  INSURANCE_REMITTANCE_STATUS_COLOR,
  type InsuranceRemittanceStatus,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { DateTimeField } from '@/components/form/DateTimeField';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import {
  WORK_DRAWER_BODY_CLASS,
  WorkDrawerFacts,
  WorkDrawerFooter,
  WorkDrawerTitle,
} from '@/components/overlay/WorkDrawer';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { MONTH_PARAM_FORMAT, nowInAppTz, dayjs, type Dayjs } from '@/lib/datetime';
import { REMITTANCE_DEFAULT_LIMIT, remittanceCsvHref } from '../api';
import {
  useCreateRemittance,
  useDeleteRemittance,
  useFinalizeRemittance,
  usePayRemittance,
  useRemittance,
  useRemittanceFilters,
  useRemittanceLines,
  useRemittancePending,
  useRemittances,
} from '../hooks';
import type { InsuranceRemittance, InsuranceRemittanceLine } from '../types';
import styles from './InsuranceCertificatesPanel.module.css';

const MIN_TABLE_WIDTH = 960;
/** Số tháng gần nhất đã kết thúc cho bộ chọn kỳ kê. */
const MONTH_CHOICES = 12;

function RemittanceStatusTag({ status }: { status: InsuranceRemittanceStatus }) {
  const t = useTranslations('AdminInsurance.remittances');
  return <Tag color={INSURANCE_REMITTANCE_STATUS_COLOR[status]}>{t(`status.${status}`)}</Tag>;
}

/**
 * Bảng kê TRẢ PHÍ bảo hiểm cho hãng — ADR 0088 điều 6.
 *
 * Phí bảo hiểm khách trả là tiền XePrime GIỮ HỘ hãng; hợp đồng được cấp thì thành khoản phải trả.
 * Mỗi tháng: lập bảng kê (gom hợp đồng đã cấp chưa kê) → chốt số, xuất CSV gửi MIC đối chiếu → ghi
 * nhận chuyển khoản. Danh sách phân trang ở server, bảng kê đang mở nằm trên URL (`?remittance=`).
 */
export function RemittancesPanel() {
  const t = useTranslations('AdminInsurance.remittances');
  const fmt = useAppFormat();
  const { filters, setFilters } = useRemittanceFilters();
  const { data, isError, isFetching, refetch } = useRemittances(filters);
  const pending = useRemittancePending();
  const [creating, setCreating] = useState(false);

  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: REMITTANCE_DEFAULT_LIMIT, total: 0, hasNext: false };

  const columns: DataTableColumn<InsuranceRemittance>[] = [
    {
      title: t('columns.period'),
      key: 'period',
      width: 120,
      render: (_, row) => <span className={styles.strong}>{monthLabel(row.periodMonth)}</span>,
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 140,
      render: (_, r) => <RemittanceStatusTag status={r.status} />,
    },
    {
      title: t('columns.policies'),
      key: 'policies',
      width: 110,
      align: 'right',
      render: (_, r) => r.policyCount,
    },
    {
      title: t('columns.gross'),
      key: 'gross',
      align: 'right',
      render: (_, r) => <span className={styles.amount}>{fmt.money(r.grossPremium)}</span>,
    },
    {
      title: t('columns.commission'),
      key: 'commission',
      align: 'right',
      render: (_, r) => (
        <span className={styles.amount}>
          {fmt.money(r.commissionAmount)} ({fmt.rate(r.commissionPercent)}%)
        </span>
      ),
    },
    {
      title: t('columns.payable'),
      key: 'payable',
      align: 'right',
      render: (_, r) => <span className={styles.amount}>{fmt.money(r.payableAmount)}</span>,
    },
    {
      title: t('columns.paid'),
      key: 'paid',
      align: 'right',
      render: (_, r) =>
        r.paidAmount ? (
          <span className={styles.amount}>{fmt.money(r.paidAmount)}</span>
        ) : (
          <span className={styles.muted}>-</span>
        ),
    },
    {
      title: <span className={styles.srOnly}>{t('columns.open')}</span>,
      key: 'open',
      width: 36,
      align: 'right',
      render: () => <RightOutlined className={styles.muted} aria-hidden />,
    },
  ];

  return (
    <div className={styles.panel}>
      <Alert
        type={pending.data && pending.data.policyCount > 0 ? 'info' : 'success'}
        showIcon
        title={
          pending.data
            ? pending.data.policyCount > 0
              ? t('pending.some', {
                  count: pending.data.policyCount,
                  amount: fmt.money(pending.data.grossPremium),
                })
              : t('pending.none')
            : t('pending.loading')
        }
        description={
          pending.data?.oldestIssuedAt
            ? t('pending.oldest', { date: fmt.date(pending.data.oldestIssuedAt) })
            : t('pending.hint')
        }
        action={
          <Button
            type="primary"
            icon={<PlusOutlined aria-hidden />}
            disabled={!pending.data}
            onClick={() => setCreating(true)}
          >
            {t('actions.create')}
          </Button>
        }
      />

      <DataTable<InsuranceRemittance>
        label={t('tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        filtered={false}
        empty={{ title: t('empty.title'), description: t('empty.description') }}
        noResults={{ title: t('empty.title') }}
        onRowClick={(row) => setFilters({ remittance: row.id }, { resetPage: false })}
        selectedRowKey={filters.remittance ?? null}
        renderCard={(row) => (
          <div className={styles.card}>
            <div className={styles.cardHead}>
              <span className={styles.strong}>{monthLabel(row.periodMonth)}</span>
              <RemittanceStatusTag status={row.status} />
            </div>
            <span>{t('card.policies', { count: row.policyCount })}</span>
            <span className={styles.muted}>
              {t('card.payable', { amount: fmt.money(row.payableAmount) })}
            </span>
          </div>
        )}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      {creating && pending.data ? (
        <CreateRemittanceDialog
          defaultCommissionPercent={Number(pending.data.agencyCommissionPercent)}
          onClose={() => setCreating(false)}
          onCreated={(id) => setFilters({ remittance: id }, { resetPage: false })}
        />
      ) : null}

      <RemittanceDrawer
        id={filters.remittance ?? null}
        onClose={() => setFilters({ remittance: undefined }, { resetPage: false })}
      />
    </div>
  );
}

/** `YYYY-MM` → `MM/YYYY` — kỳ kê là tháng lịch Việt Nam, không phải mốc thời gian. */
function monthLabel(month: string): string {
  const [y, m] = month.split('-');
  return `${m}/${y}`;
}

// ── Lập bảng kê ─────────────────────────────────────────────────────────────

function CreateRemittanceDialog({
  defaultCommissionPercent,
  onClose,
  onCreated,
}: {
  /** % hoa hồng đại lý cấu hình trên sản phẩm (ADR 0097) — người lập vẫn sửa được. */
  defaultCommissionPercent: number;
  onClose: () => void;
  onCreated: (id: string) => void;
}) {
  const t = useTranslations('AdminInsurance.remittances.create');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const create = useCreateRemittance();
  /** 12 tháng ĐÃ KẾT THÚC gần nhất — tháng hiện tại chưa chốt được (server cũng chặn). */
  const months = useMemo(
    () =>
      Array.from({ length: MONTH_CHOICES }, (_, i) => {
        // Tháng theo giờ Việt Nam — kỳ kê là tháng lịch VN, cùng mốc server dùng.
        const value = nowInAppTz()
          .startOf('month')
          .subtract(i + 1, 'month')
          .format(MONTH_PARAM_FORMAT);
        return { value, label: monthLabel(value) };
      }),
    [],
  );
  const schema = useMemo(
    () =>
      yup.object({
        periodMonth: yup.string().required(t('validation.required')),
        commissionPercent: yup
          .number()
          .typeError(t('validation.required'))
          .required(t('validation.required'))
          .min(
            0,
            t('validation.commission', { max: INSURANCE_REMITTANCE_LIMITS.commissionPercentMax }),
          )
          .max(
            INSURANCE_REMITTANCE_LIMITS.commissionPercentMax,
            t('validation.commission', { max: INSURANCE_REMITTANCE_LIMITS.commissionPercentMax }),
          ),
        note: yup.string().trim().max(INSURANCE_REMITTANCE_LIMITS.note.max).default(''),
      }),
    [t],
  );
  type Values = yup.InferType<typeof schema>;
  const { control, handleSubmit } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: {
      periodMonth: months[0]!.value,
      commissionPercent: defaultCommissionPercent,
      note: '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (create.isPending) return;
    create.mutate(
      {
        periodMonth: values.periodMonth,
        commissionPercent: String(Math.round(values.commissionPercent * 100) / 100),
        ...(values.note ? { note: values.note } : {}),
      },
      {
        onSuccess: (created) => {
          message.success(t('done', { count: created.policyCount }));
          onClose();
          onCreated(created.id);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('title')}
      open
      onClose={onClose}
      okText={t('submit')}
      onOk={() => void onSubmit()}
      confirmLoading={create.isPending}
    >
      <p className={styles.hint}>{t('intro')}</p>
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <SelectField
          control={control}
          name="periodMonth"
          label={t('period')}
          options={months}
          required
        />
        <NumberField
          control={control}
          name="commissionPercent"
          label={t('commission')}
          percent
          min={0}
          max={INSURANCE_REMITTANCE_LIMITS.commissionPercentMax}
          precision={2}
          help={t('commissionHelp')}
          required
        />
        <TextAreaField control={control} name="note" label={t('note')} rows={2} />
      </DialogForm>
    </ResponsiveDialog>
  );
}

// ── Chi tiết bảng kê ────────────────────────────────────────────────────────

function RemittanceDrawer({ id, onClose }: { id: string | null; onClose: () => void }) {
  const t = useTranslations('AdminInsurance.remittances');
  const fmt = useAppFormat();
  const { message, modal } = App.useApp();
  const errorMessage = useErrorMessage();
  const detail = useRemittance(id);
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(REMITTANCE_DEFAULT_LIMIT);
  const lines = useRemittanceLines(id, page, limit);
  const finalize = useFinalizeRemittance();
  const remove = useDeleteRemittance();
  const [paying, setPaying] = useState(false);
  const r = detail.data;

  const busy = finalize.isPending || remove.isPending;
  const lineColumns: DataTableColumn<InsuranceRemittanceLine>[] = [
    {
      title: t('lines.booking'),
      key: 'booking',
      render: (_, l) => <span className={styles.strong}>{l.bookingCode}</span>,
    },
    {
      title: t('lines.contract'),
      key: 'contract',
      render: (_, l) => (
        <span className={styles.mono}>
          {l.contractNumber ?? l.certificateNumber ?? '-'}
          {l.isTest ? <Tag className={styles.tag}>{t('lines.test')}</Tag> : null}
        </span>
      ),
    },
    { title: t('lines.plate'), key: 'plate', render: (_, l) => l.plateNumber ?? '-' },
    { title: t('lines.customer'), key: 'customer', render: (_, l) => l.customerName },
    {
      title: t('lines.coverage'),
      key: 'coverage',
      render: (_, l) =>
        l.coverageFrom && l.coverageTo ? fmt.dateTimeRange(l.coverageFrom, l.coverageTo) : '-',
    },
    {
      title: t('lines.premium'),
      key: 'premium',
      align: 'right',
      render: (_, l) => fmt.money(l.premiumAmount),
    },
    {
      title: t('lines.partnerPremium'),
      key: 'partnerPremium',
      align: 'right',
      render: (_, l) => (l.partnerPremiumAmount ? fmt.money(l.partnerPremiumAmount) : '-'),
    },
  ];

  const confirmFinalize = () => {
    if (!r || busy) return;
    modal.confirm({
      title: t('confirmFinalize.title'),
      content: t('confirmFinalize.body', { amount: fmt.money(r.payableAmount) }),
      okText: t('actions.finalize'),
      onOk: () =>
        finalize.mutateAsync(r.id).then(
          () => void message.success(t('finalized')),
          (err: unknown) => void message.error(errorMessage(err)),
        ),
    });
  };
  const confirmDelete = () => {
    if (!r || busy) return;
    modal.confirm({
      title: t('confirmDelete.title'),
      content: t('confirmDelete.body'),
      okText: t('actions.delete'),
      okButtonProps: { danger: true },
      onOk: () =>
        remove.mutateAsync(r.id).then(
          () => {
            message.success(t('deleted'));
            onClose();
          },
          (err: unknown) => void message.error(errorMessage(err)),
        ),
    });
  };

  return (
    <DetailDrawer
      open={Boolean(id)}
      onClose={onClose}
      size="xl"
      closeAtEnd
      bodyClassName={WORK_DRAWER_BODY_CLASS}
      ariaLabel={t('drawer.title')}
      loading={detail.isLoading}
      error={detail.isError}
      onRetry={() => void detail.refetch()}
      title={
        <WorkDrawerTitle
          label={t('drawer.title')}
          code={r ? monthLabel(r.periodMonth) : null}
          status={r ? <RemittanceStatusTag status={r.status} /> : null}
        />
      }
      footer={
        r ? (
          <WorkDrawerFooter
            hint={t(`hint.${r.status}`)}
            actions={
              <>
                <Button href={remittanceCsvHref(r.id)} icon={<DownloadOutlined aria-hidden />}>
                  {t('actions.export')}
                </Button>
                {r.status === INSURANCE_REMITTANCE_STATUS.DRAFT ? (
                  <>
                    <Button danger onClick={confirmDelete} disabled={busy}>
                      {t('actions.delete')}
                    </Button>
                    <Button type="primary" onClick={confirmFinalize} loading={finalize.isPending}>
                      {t('actions.finalize')}
                    </Button>
                  </>
                ) : null}
                {r.status === INSURANCE_REMITTANCE_STATUS.FINALIZED ? (
                  <Button type="primary" onClick={() => setPaying(true)}>
                    {t('actions.pay')}
                  </Button>
                ) : null}
              </>
            }
          />
        ) : null
      }
    >
      {r ? (
        <div className={styles.panel}>
          <WorkDrawerFacts
            items={[
              { key: 'count', label: t('facts.policies'), value: r.policyCount },
              { key: 'gross', label: t('facts.gross'), value: fmt.money(r.grossPremium) },
              {
                key: 'collected',
                label: t('facts.collected'),
                value: fmt.money(r.collectedPremiumTotal),
              },
              {
                key: 'commission',
                label: t('facts.commission', { percent: fmt.rate(r.commissionPercent) }),
                value: fmt.money(r.commissionAmount),
              },
              {
                key: 'payable',
                label: t('facts.payable'),
                value: <strong>{fmt.money(r.payableAmount)}</strong>,
              },
              ...(r.testPolicyCount > 0
                ? [
                    {
                      key: 'test',
                      label: t('facts.test'),
                      value: t('facts.testCount', { count: r.testPolicyCount }),
                    },
                  ]
                : []),
              ...(r.paidAmount
                ? [
                    { key: 'paid', label: t('facts.paid'), value: fmt.money(r.paidAmount) },
                    {
                      key: 'paidAt',
                      label: t('facts.paidAt'),
                      value: r.paidAt ? fmt.dateTime(r.paidAt) : '-',
                    },
                    { key: 'ref', label: t('facts.bankReference'), value: r.bankReference ?? '-' },
                  ]
                : []),
              ...(r.note
                ? [{ key: 'note', label: t('facts.note'), value: r.note, wide: true }]
                : []),
            ]}
          />
          {r.partnerPremiumMissingCount > 0 ? (
            <Alert
              type="warning"
              showIcon
              title={t('mismatch', { count: r.partnerPremiumMissingCount })}
            />
          ) : null}
          <DataTable<InsuranceRemittanceLine>
            label={t('lines.label')}
            columns={lineColumns}
            items={lines.data?.items ?? []}
            rowKey={(l) => l.policyId}
            minWidth={900}
            loading={lines.isFetching}
            error={
              lines.isError ? { title: t('loadError'), onRetry: () => void lines.refetch() } : null
            }
            filtered={false}
            empty={{ title: t('lines.empty') }}
            noResults={{ title: t('lines.empty') }}
            pagination={{
              meta: lines.data?.meta ?? { page, limit, total: 0, hasNext: false },
              onChange: (p, l) => {
                setPage(p);
                setLimit(l);
              },
              totalLabel: (total) => t('lines.total', { count: total }),
            }}
          />
          {paying ? (
            <PayRemittanceDialog key={r.id} remittance={r} onClose={() => setPaying(false)} />
          ) : null}
        </div>
      ) : null}
    </DetailDrawer>
  );
}

// ── Ghi nhận đã chuyển ──────────────────────────────────────────────────────

function PayRemittanceDialog({
  remittance,
  onClose,
}: {
  remittance: InsuranceRemittance;
  onClose: () => void;
}) {
  const t = useTranslations('AdminInsurance.remittances.pay');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const pay = usePayRemittance();
  const schema = useMemo(
    () =>
      yup.object({
        paidAmount: yup
          .number()
          .typeError(t('validation.required'))
          .required(t('validation.required'))
          .moreThan(0, t('validation.amount')),
        paidAt: yup.mixed<Dayjs>().required(t('validation.required')),
        bankReference: yup
          .string()
          .trim()
          .required(t('validation.required'))
          .max(INSURANCE_REMITTANCE_LIMITS.bankReference.max),
        note: yup.string().trim().max(INSURANCE_REMITTANCE_LIMITS.note.max).default(''),
      }),
    [t],
  );
  type Values = yup.InferType<typeof schema>;
  const { control, handleSubmit } = useForm<Values>({
    resolver: yupResolver(schema),
    defaultValues: {
      paidAmount: Number(remittance.payableAmount),
      paidAt: dayjs(),
      bankReference: '',
      note: '',
    },
  });

  const onSubmit = handleSubmit((values) => {
    if (pay.isPending) return;
    pay.mutate(
      {
        id: remittance.id,
        body: {
          paidAmount: String(Math.round(values.paidAmount)),
          paidAt: values.paidAt.toISOString(),
          bankReference: values.bankReference,
          ...(values.note ? { note: values.note } : {}),
        },
      },
      {
        onSuccess: () => {
          message.success(t('done'));
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  return (
    <ResponsiveDialog
      title={t('title', { period: monthLabel(remittance.periodMonth) })}
      open
      onClose={onClose}
      okText={t('submit')}
      onOk={() => void onSubmit()}
      confirmLoading={pay.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <NumberField
          control={control}
          name="paidAmount"
          label={t('amount')}
          money
          min={0}
          required
        />
        <DateTimeField control={control} name="paidAt" label={t('paidAt')} />
        <TextField control={control} name="bankReference" label={t('bankReference')} required />
        <TextAreaField control={control} name="note" label={t('note')} rows={2} />
      </DialogForm>
    </ResponsiveDialog>
  );
}
