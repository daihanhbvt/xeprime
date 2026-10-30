'use client';

import { DownloadOutlined } from '@ant-design/icons';
import { App, Button, Tag } from 'antd';
import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { DRIVER_ASSIGNMENT_OUTCOME_META, type DriverAssignmentOutcome } from '@xeprime/types';
import { driverWageLine } from '@xeprime/domain';
import { DataTable, type DataTableColumn } from '@/components/data-display/DataTable';
import { bookingPath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { DRIVER_ASSIGNMENTS_LIMIT, fetchAllDriverAssignments } from '../api';
import { useDriverAssignments } from '../hooks/use-drivers';
import type { Driver, DriverAssignmentRow } from '../types';
import { downloadCsv, wageStatementCsv } from '../wage-statement';
import styles from './DriverDetail.module.css';

/**
 * Tab "Chuyến & tiền công" — các chuyến tài xế đã nhận, KẾT THÚC trong tháng (giờ VN), mỗi chuyến
 * kèm tiền công đã ghi; cùng phép đếm với cột tháng của danh sách. Phân trang ở server.
 *
 * "Tải bảng kê" gom cả tháng qua cùng endpoint (trang lớn) rồi dựng CSV ở trình duyệt theo ngôn
 * ngữ đang dùng — để chủ xe đối chiếu khi trả tài xế. XePrime không giữ hay chi khoản này.
 */
export function DriverTripsTab({
  driver,
  month,
  monthPicker,
}: {
  driver: Driver;
  month: string;
  monthPicker: ReactNode;
}) {
  const t = useTranslations('Drivers.detail.trips');
  const tLine = useTranslations('Drivers.wage.line');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  // Trang thuộc về MỘT tháng: đổi tháng là về trang 1 (state theo cặp tháng–trang).
  const [paging, setPaging] = useState({ month, page: 1 });
  const page = paging.month === month ? paging.page : 1;
  const query = useDriverAssignments(driver.id, month, page);
  const [exporting, setExporting] = useState(false);

  async function exportStatement() {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await fetchAllDriverAssignments(driver.id, month);
      const csv = wageStatementCsv(rows, {
        headers: {
          booking: t('csv.booking'),
          vehicle: t('csv.vehicle'),
          plate: t('csv.plate'),
          pickupAt: t('csv.pickupAt'),
          returnAt: t('csv.returnAt'),
          days: t('csv.days'),
          outcome: t('csv.outcome'),
          wage: t('csv.wage'),
        },
        total: t('csv.total'),
        outcome: (o) => domainLabel('driverAssignmentOutcome', o),
        dateTime: (iso) => fmt.dateTime(iso),
      });
      downloadCsv(`${t('csv.fileName', { month })}-${driver.phone}.csv`, csv);
      message.success(t('exported', { count: rows.length }));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const columns: DataTableColumn<DriverAssignmentRow>[] = [
    {
      title: t('columns.booking'),
      key: 'booking',
      width: 130,
      render: (_, row) => <Link href={bookingPath.detail(row.bookingId)}>{row.bookingCode}</Link>,
    },
    {
      title: t('columns.vehicle'),
      key: 'vehicle',
      width: 200,
      render: (_, row) => (
        <span className={styles.vehicle}>
          <span>{row.vehicleName}</span>
          {row.vehiclePlate ? <span className={styles.muted}>{row.vehiclePlate}</span> : null}
        </span>
      ),
    },
    {
      title: t('columns.period'),
      key: 'period',
      width: 210,
      render: (_, row) => (
        <span className={styles.muted}>{fmt.shortDateTimeRange(row.pickupAt, row.returnAt)}</span>
      ),
    },
    {
      title: t('columns.outcome'),
      key: 'outcome',
      width: 140,
      render: (_, row) => (
        <Tag color={DRIVER_ASSIGNMENT_OUTCOME_META[row.outcome as DriverAssignmentOutcome]?.color}>
          {domainLabel('driverAssignmentOutcome', row.outcome)}
        </Tag>
      ),
    },
    {
      title: t('columns.wage'),
      key: 'wage',
      width: 190,
      align: 'right',
      render: (_, row) => {
        const line = driverWageLine({ amount: row.wageAmount, stage: row.stage });
        if (!line) return <span className={styles.muted}>—</span>;
        return line.kind === 'none' ? (
          <span className={styles.muted}>{tLine('none')}</span>
        ) : (
          <span className={styles.money}>
            {tLine(line.kind, { amount: fmt.money(line.amount), days: row.wageDays ?? 0 })}
          </span>
        );
      },
    },
  ];

  const meta = query.data?.meta ?? { page, limit: DRIVER_ASSIGNMENTS_LIMIT, total: 0, hasNext: false };
  const empty = !query.isFetching && meta.total === 0;

  return (
    <div className={styles.tabBody}>
      <div className={styles.toolbar}>
        <span className={styles.toolbarSummary}>
          {t.rich('summary', {
            trips: driver.monthCompletedTrips,
            amount: fmt.money(driver.monthWageTotal),
            b: (chunks) => <b>{chunks}</b>,
          })}
        </span>
        <div className={styles.toolbarActions}>
          {monthPicker}
          <Button
            icon={<DownloadOutlined />}
            loading={exporting}
            disabled={empty}
            onClick={() => void exportStatement()}
          >
            {t('export')}
          </Button>
        </div>
      </div>
      <DataTable<DriverAssignmentRow>
        label={t('tableLabel')}
        columns={columns}
        items={query.data?.items ?? []}
        rowKey={(row) => row.id}
        minWidth={820}
        loading={query.isFetching}
        error={
          query.isError && !query.data
            ? { title: t('loadError'), onRetry: () => void query.refetch() }
            : null
        }
        empty={{ title: t('empty'), description: t('emptyHint') }}
        pagination={{
          meta,
          onChange: (next) => setPaging({ month, page: next }),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />
    </div>
  );
}
