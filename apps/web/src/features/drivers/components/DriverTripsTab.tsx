'use client';

import { UploadOutlined } from '@ant-design/icons';
import { App, Button } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  DRIVER_ASSIGNMENT_OUTCOME_META,
  type DriverAssignmentOutcome,
} from '@xeprime/types';
import { driverWageLine } from '@xeprime/domain';
import { StatusBadge } from '@/components/data-display/StatusBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { fetchAllDriverAssignments } from '../api';
import { useDriverAssignments } from '../hooks/use-drivers';
import type { DriverAssignmentRow, DriverTripFilters } from '../types';
import { downloadCsv, wageStatementCsv } from '../wage-statement';
import { DriverTripsTable, DriverTripsToolbar, type DriverTripTableRow } from './DriverDetailParts';
import styles from './DriverDetail.module.css';

/**
 * Kết cục một lượt ĐÃ NHẬN có thể mang — lựa chọn của ô "Trạng thái" (lượt chưa nhận không vào
 * bảng: từ chối / để quá hạn không có tiền công nào).
 */
const TRIP_OUTCOMES: readonly DriverAssignmentOutcome[] = [
  DRIVER_ASSIGNMENT_OUTCOME.COMPLETED,
  DRIVER_ASSIGNMENT_OUTCOME.CANCELLED,
  DRIVER_ASSIGNMENT_OUTCOME.NO_SHOW,
  DRIVER_ASSIGNMENT_OUTCOME.DROPPED,
  DRIVER_ASSIGNMENT_OUTCOME.UNASSIGNED,
];

/**
 * Tab "Chuyến & tiền công" — Figma `24051:80844`: các chuyến tài xế đã nhận, KẾT THÚC trong tháng
 * (giờ VN), tìm theo mã đơn / khách / xe / biển và lọc kết cục ở server. "Xuất bảng kê" gom cả
 * tháng (không theo bộ lọc) rồi dựng CSV theo ngôn ngữ đang dùng — để chủ xe đối chiếu khi trả tài
 * xế. XePrime không giữ hay chi khoản này.
 */
export function DriverTripsTab({
  driverId,
  driverPhone,
  month,
  wageTotal,
  filters,
  onFilters,
}: {
  driverId: string;
  driverPhone: string;
  /** `YYYY-MM` đã chốt (server trả). */
  month: string;
  /** Tổng ghi nhận của tháng — cùng số với thẻ "Tiền công ghi nhận". */
  wageTotal: string;
  filters: DriverTripFilters;
  onFilters: (patch: Partial<DriverTripFilters>) => void;
}) {
  const t = useTranslations('Drivers.detailPage.trips');
  const tOld = useTranslations('Drivers.detail.trips');
  const tLine = useTranslations('Drivers.wage.line');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const query = useDriverAssignments(driverId, { ...filters, month });
  const [exporting, setExporting] = useState(false);
  const filtered = Boolean(filters.q || filters.status);

  async function exportStatement() {
    if (exporting) return;
    setExporting(true);
    try {
      const rows = await fetchAllDriverAssignments(driverId, month);
      const csv = wageStatementCsv(rows, {
        headers: {
          booking: tOld('csv.booking'),
          vehicle: tOld('csv.vehicle'),
          plate: tOld('csv.plate'),
          pickupAt: tOld('csv.pickupAt'),
          returnAt: tOld('csv.returnAt'),
          days: tOld('csv.days'),
          outcome: tOld('csv.outcome'),
          wage: tOld('csv.wage'),
        },
        total: tOld('csv.total'),
        outcome: (o) => domainLabel('driverAssignmentOutcome', o),
        dateTime: (iso) => fmt.dateTime(iso),
      });
      downloadCsv(`${tOld('csv.fileName', { month })}-${driverPhone}.csv`, csv);
      message.success(tOld('exported', { count: rows.length }));
    } catch (err) {
      message.error(errorMessage(err));
    } finally {
      setExporting(false);
    }
  }

  const toRow = (row: DriverAssignmentRow): DriverTripTableRow => {
    const line = driverWageLine({ amount: row.wageAmount, stage: row.stage });
    return {
      key: row.id,
      bookingId: row.bookingId,
      bookingCode: row.bookingCode,
      vehicleName: row.vehicleName,
      vehiclePlate: row.vehiclePlate,
      vehicleImageUrl: row.vehicleImageUrl,
      customerName: row.customerName,
      customerPhone: row.customerPhone,
      pickupAt: row.pickupAt,
      returnAt: row.returnAt,
      status: (
        <StatusBadge
          value={row.outcome as DriverAssignmentOutcome}
          meta={DRIVER_ASSIGNMENT_OUTCOME_META}
          group="driverAssignmentOutcome"
        />
      ),
      wage: !line ? (
        <span className={styles.muted}>-</span>
      ) : line.kind === 'none' ? (
        <span className={styles.muted}>{tLine('none')}</span>
      ) : (
        <span className={styles.money}>{fmt.money(line.amount)}</span>
      ),
    };
  };

  const page = query.data
    ? { items: query.data.items.map(toRow), meta: query.data.meta }
    : undefined;
  const empty = !query.isFetching && (query.data?.meta.total ?? 0) === 0;

  return (
    <>
      <DriverTripsToolbar
        q={filters.q}
        status={filters.status}
        statusOptions={TRIP_OUTCOMES.map((value) => ({
          value,
          label: domainLabel('driverAssignmentOutcome', value),
        }))}
        onSearch={(q) => onFilters({ q, page: undefined })}
        onStatus={(status) => onFilters({ status, page: undefined })}
        end={
          <>
            <span className={styles.recorded}>
              {t('totalRecorded')}
              <b>{fmt.money(wageTotal)}</b>
            </span>
            <Button
              size="large"
              icon={<UploadOutlined />}
              loading={exporting}
              disabled={empty && !filtered}
              onClick={() => void exportStatement()}
            >
              {t('export')}
            </Button>
          </>
        }
      />
      <DriverTripsTable
        label={tOld('tableLabel')}
        page={page}
        loading={query.isFetching}
        error={
          query.isError && !query.data
            ? { title: tOld('loadError'), onRetry: () => void query.refetch() }
            : null
        }
        empty={
          filtered
            ? { title: t('emptyFiltered'), description: t('emptyFilteredHint') }
            : { title: tOld('empty'), description: tOld('emptyHint') }
        }
        onPage={(next, limit) => onFilters({ page: next > 1 ? next : undefined, limit })}
        withWage
      />
    </>
  );
}
