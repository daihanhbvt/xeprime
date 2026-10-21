'use client';

import { RightOutlined } from '@ant-design/icons';
import { Alert, Tag } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import {
  INSURANCE_ISSUE_ERROR,
  INSURANCE_POLICY_STATUS,
  INSURANCE_POLICY_STATUS_META,
  INSURANCE_POLICY_STATUS_VALUES,
  INSURANCE_PRODUCT_KIND_VALUES,
  INSURANCE_QUEUE_STATUS_ANY,
  STATUS_COLOR,
} from '@xeprime/types';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { FilterBar, type FilterField } from '@/components/filter/FilterBar';
import { ROUTES } from '@/constants/routes';
import { useOpenRecordPager } from '@/hooks/use-open-record-pager';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useLocalizedText } from '@/i18n/localized';
import { QueueViewSwitch } from '@/features/platform-money/components/QueueViewSwitch';
import { CERTIFICATE_DEFAULT_LIMIT } from '../api';
import { useCertificateFilters, useCertificates } from '../hooks';
import type { CertificateFilters, InsurancePolicy } from '../types';
import { InsuranceCertificateDrawer } from './InsuranceCertificateDrawer';
import styles from './InsuranceCertificatesPanel.module.css';

const MIN_TABLE_WIDTH = 1040;

/** Hai góc nhìn của hàng đợi — giá trị NỘI BỘ của công tắc, không đi lên URL. */
const CERTIFICATE_VIEW = { TODO: 'todo', ALL: 'everything' } as const;
type CertificateView = (typeof CERTIFICATE_VIEW)[keyof typeof CERTIFICATE_VIEW];

/**
 * Hàng đợi GIẤY CHỨNG NHẬN bảo hiểm (ADR 0032 điều 4 · ADR 0064) — dùng ở tab "Chứng nhận" của
 * màn Bảo hiểm VÀ ở hàng đợi bảo hiểm trong màn Tài chính: một bảng, hai lối vào.
 *
 * Lọc/tìm/phân trang ở SERVER, bộ lọc trên URL (ADR 0004). "Cần xử lý ↔ Tất cả" là GÓC NHÌN, không
 * phải bộ lọc (`QueueViewSwitch`, ngoài `FilterBar`): bỏ trống `status` = hàng đợi VIỆC CẦN LÀM
 * (`failed`); `INSURANCE_QUEUE_STATUS_ANY` = mọi trạng thái — không dùng `all` vì `useUrlFilters`
 * xoá nó. Bộ lọc trạng thái chỉ hiện ở góc nhìn "Tất cả" và chỉ lọc TRONG góc nhìn đó.
 * Bấm một dòng mở panel làm việc (`?open=`), nơi có thử lại / thu hồi và payload với đối tác.
 */
export function InsuranceCertificatesPanel() {
  const t = useTranslations('AdminInsurance.certificates');
  const localized = useLocalizedText();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const { filters, setFilters } = useCertificateFilters();
  const { data, isError, isFetching, refetch } = useCertificates(filters);

  const items = data?.items ?? [];
  const meta = data?.meta ?? {
    page: 1,
    limit: CERTIFICATE_DEFAULT_LIMIT,
    total: 0,
    hasNext: false,
  };
  const pager = useOpenRecordPager(
    items.map((row) => row.id),
    filters.open,
  );

  /*
   * "Chưa cắm đối tác" là tình trạng CỦA CẢ MÔI TRƯỜNG, không của từng dòng — nói một lần ở đầu
   * bảng, và chỉ khi nó thật sự đang xảy ra trên dữ liệu đang xem.
   */
  const partnerMissing = items.some(
    (p) => p.lastErrorCode === INSURANCE_ISSUE_ERROR.PARTNER_NOT_CONFIGURED,
  );
  /** Góc nhìn: bỏ trống `status` = "Cần xử lý"; có `status` (kể cả `any`) = "Tất cả". */
  const showAll = Boolean(filters.status);
  /** Trạng thái đang lọc TRONG góc nhìn "Tất cả" — `any` không phải một lựa chọn của bộ lọc. */
  const statusFilter =
    filters.status && filters.status !== INSURANCE_QUEUE_STATUS_ANY ? filters.status : undefined;
  const filtered = Boolean(filters.q || filters.productKind || statusFilter);

  const filterFields: FilterField[] = [
    {
      kind: 'search',
      key: 'q',
      label: t('filters.search'),
      placeholder: t('filters.searchPlaceholder'),
    },
    ...(showAll
      ? [
          {
            kind: 'select' as const,
            key: 'status',
            label: t('filters.status'),
            allowClear: true,
            options: INSURANCE_POLICY_STATUS_VALUES.map((value) => ({
              value,
              label: domainLabel('insurancePolicyStatus', value),
            })),
          },
        ]
      : []),
    {
      kind: 'select',
      key: 'productKind',
      label: t('filters.productKind'),
      allowClear: true,
      options: INSURANCE_PRODUCT_KIND_VALUES.map((value) => ({
        value,
        label: domainLabel('insuranceProductKind', value),
      })),
    },
  ];

  const productName = (row: InsurancePolicy) =>
    localized(row.productNameVi, row.productNameEn) ??
    domainLabel('insuranceProductKind', row.productKind);

  const certificateCell = (row: InsurancePolicy) =>
    row.certificateNumber ? (
      <span className={styles.certCell}>
        {row.certificateUrl ? (
          <a
            href={row.certificateUrl}
            target="_blank"
            rel="noopener noreferrer"
            className={styles.mono}
            // Mở GCN không được mở luôn panel của dòng.
            onClick={(e) => e.stopPropagation()}
          >
            {row.certificateNumber}
          </a>
        ) : (
          <span className={styles.mono}>{row.certificateNumber}</span>
        )}
        {row.isTest ? (
          <Tag color={STATUS_COLOR.WARNING} className={styles.tag}>
            {t('testTag')}
          </Tag>
        ) : null}
      </span>
    ) : (
      <span className={styles.muted}>{t('noCertificate')}</span>
    );

  const columns: DataTableColumn<InsurancePolicy>[] = [
    {
      title: t('columns.booking'),
      key: 'booking',
      width: 170,
      render: (_, row) => (
        <div className={styles.stack}>
          <Link
            href={`${ROUTES.ADMIN.BOOKINGS}?q=${encodeURIComponent(row.bookingCode)}`}
            className={styles.strong}
            onClick={(e) => e.stopPropagation()}
          >
            {row.bookingCode}
          </Link>
          <span className={styles.muted}>{row.customerName}</span>
        </div>
      ),
    },
    {
      title: t('columns.tenant'),
      key: 'tenant',
      render: (_, row) => (
        <div className={styles.stack}>
          <span className={styles.strong}>{row.tenantName}</span>
          <span className={styles.muted}>{row.vehicleName}</span>
        </div>
      ),
    },
    { title: t('columns.product'), key: 'product', render: (_, row) => productName(row) },
    {
      title: t('columns.premium'),
      key: 'premium',
      align: 'right',
      width: 120,
      render: (_, row) => <span className={styles.amount}>{fmt.money(row.premiumAmount)}</span>,
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 170,
      render: (_, row) => (
        <StatusTag
          value={row.status}
          meta={INSURANCE_POLICY_STATUS_META}
          group="insurancePolicyStatus"
        />
      ),
    },
    {
      title: t('columns.certificate'),
      key: 'certificate',
      render: (_, row) => certificateCell(row),
    },
    {
      title: t('columns.attempts'),
      key: 'attempts',
      width: 170,
      render: (_, row) => (
        <div className={styles.stack}>
          <span>{t('attemptCount', { count: row.issueAttempts })}</span>
          {/*
            `nextAttemptAt` rỗng ở trạng thái lỗi nghĩa là hệ thống ĐÃ THÔI tự thử lại — người trực
            phải biết, nếu không họ sẽ ngồi đợi một lần thử không bao giờ tới.
          */}
          {row.status === INSURANCE_POLICY_STATUS.FAILED ? (
            <span className={styles.muted}>
              {row.nextAttemptAt
                ? t('nextAttempt', { time: fmt.dateTime(row.nextAttemptAt) })
                : t('noAutoRetry')}
            </span>
          ) : null}
        </div>
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

  function renderCard(row: InsurancePolicy) {
    return (
      <div className={styles.card}>
        <div className={styles.cardHead}>
          <span className={styles.strong}>{row.bookingCode}</span>
          <StatusTag
            value={row.status}
            meta={INSURANCE_POLICY_STATUS_META}
            group="insurancePolicyStatus"
          />
        </div>
        <span>{productName(row)}</span>
        <span className={styles.muted}>
          {row.tenantName} · {fmt.money(row.premiumAmount)}
        </span>
        {certificateCell(row)}
      </div>
    );
  }

  const open = (id: string) => {
    pager.remember();
    setFilters({ open: id }, { resetPage: false });
  };

  return (
    <div className={styles.panel}>
      <QueueViewSwitch<CertificateView>
        label={t('view.label')}
        value={showAll ? CERTIFICATE_VIEW.ALL : CERTIFICATE_VIEW.TODO}
        options={[
          { value: CERTIFICATE_VIEW.TODO, label: t('view.todo') },
          { value: CERTIFICATE_VIEW.ALL, label: t('view.all') },
        ]}
        // "Cần xử lý" là mặc định — không ghi lên URL; đổi góc nhìn bỏ luôn bộ lọc trạng thái cũ.
        onChange={(next) =>
          setFilters({
            status: next === CERTIFICATE_VIEW.ALL ? INSURANCE_QUEUE_STATUS_ANY : undefined,
          })
        }
      />
      <FilterBar
        fields={filterFields}
        values={{ q: filters.q, status: statusFilter, productKind: filters.productKind }}
        // `FilterBar` gửi đúng TRƯỜNG vừa đổi — ghi thẳng bản vá, không dựng lại cả bộ. Xoá bộ lọc
        // trạng thái ở góc nhìn "Tất cả" là quay về MỌI trạng thái, không rơi về "Cần xử lý".
        onChange={(patch) => {
          const next = patch as Partial<CertificateFilters>;
          setFilters(
            'status' in next && !next.status
              ? { ...next, status: INSURANCE_QUEUE_STATUS_ANY }
              : next,
          );
        }}
        onClear={() =>
          setFilters({
            q: undefined,
            productKind: undefined,
            status: showAll ? INSURANCE_QUEUE_STATUS_ANY : undefined,
          })
        }
      />
      {!showAll ? <p className={styles.hint}>{t('defaultViewHint')}</p> : null}

      {partnerMissing ? (
        <Alert
          type="warning"
          showIcon
          title={t('partnerMissing.title')}
          description={t('partnerMissing.body')}
        />
      ) : null}

      <DataTable<InsurancePolicy>
        label={t('tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        filtered={filtered}
        empty={
          showAll
            ? { title: t('emptyAll.title'), description: t('emptyAll.description') }
            : { title: t('empty.title'), description: t('empty.description') }
        }
        noResults={{ title: t('noResults') }}
        onRowClick={(row) => open(row.id)}
        selectedRowKey={filters.open ?? null}
        renderCard={renderCard}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters({ page, limit }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />

      <InsuranceCertificateDrawer
        id={filters.open ?? null}
        previousId={pager.previousId}
        nextId={pager.nextId}
        onNavigate={(id) => setFilters({ open: id }, { resetPage: false })}
        onClose={() => setFilters({ open: undefined }, { resetPage: false })}
      />
    </div>
  );
}
