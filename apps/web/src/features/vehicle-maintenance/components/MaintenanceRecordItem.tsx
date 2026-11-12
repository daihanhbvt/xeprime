'use client';

import { Tag } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  MAINTENANCE_STATUS,
  MAINTENANCE_STATUS_META,
  MAINTENANCE_TYPE_LABEL,
  type MaintenanceStatus,
  type MaintenanceType,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import type { MaintenanceRecord } from '../types';
import styles from './VehicleMaintenanceWorkspace.module.css';

/**
 * Một phiếu bảo dưỡng dạng ô có viền (design "Bảo dưỡng & số KM"): tên + trạng thái + thao tác,
 * rồi hàng thông số và dòng ghi chú. Dùng chung cho thẻ "Lịch bảo dưỡng sắp tới" và hộp lịch sử.
 *
 * Chi phí và mã phiếu chi VẮNG MẶT khỏi response khi thiếu quyền tiền (server lược) — khi đó hai
 * cột không có mặt, khác với `null` = chưa nhập (hiện "—").
 */
export function MaintenanceRecordItem({
  record,
  showStatus,
  canViewFiles,
  actions,
}: {
  record: MaintenanceRecord;
  /** Hộp lịch sử luôn hiện trạng thái; thẻ sắp tới chỉ hiện khi đang thực hiện. */
  showStatus: boolean;
  canViewFiles: boolean;
  actions?: ReactNode;
}) {
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const empty = tCommon('labels.emptyValue');

  const title =
    record.title ||
    record.customTypeName ||
    MAINTENANCE_TYPE_LABEL[record.type as MaintenanceType] ||
    record.type;
  const completed = record.status === MAINTENANCE_STATUS.COMPLETED && record.completedAt;
  const status = record.status as MaintenanceStatus;

  const facts: Array<{ key: string; label: string; value: string }> = [
    {
      key: 'date',
      label: completed ? t('record.completedDate') : t('record.plannedDate'),
      value: completed
        ? fmt.date(record.completedAt!)
        : record.plannedStartAt
          ? fmt.date(record.plannedStartAt)
          : empty,
    },
    {
      key: 'odometer',
      label: t('record.odometer'),
      value: record.odometerKm != null ? fmt.km(record.odometerKm) : empty,
    },
    { key: 'provider', label: t('record.provider'), value: record.providerName || empty },
  ];
  if (record.cost !== undefined) {
    facts.push({
      key: 'cost',
      label: t('record.costShort'),
      value: record.cost != null ? fmt.money(record.cost) : empty,
    });
  }
  if (record.receiptCode !== undefined) {
    facts.push({ key: 'receipt', label: t('record.receipt'), value: record.receiptCode || empty });
  }

  return (
    <article className={styles.recordItem}>
      <div className={styles.recordHead}>
        <strong className={styles.recordTitle}>{title}</strong>
        {showStatus || status === MAINTENANCE_STATUS.IN_PROGRESS ? (
          <StatusTag value={status} meta={MAINTENANCE_STATUS_META} group="maintenanceStatus" />
        ) : null}
        {canViewFiles && record.attachmentCount > 0 ? (
          <Tag>{t('workspace.attachments', { count: record.attachmentCount })}</Tag>
        ) : null}
        {actions ? <div className={styles.recordActions}>{actions}</div> : null}
      </div>
      <dl className={styles.recordFacts}>
        {facts.map((fact) => (
          <div key={fact.key} className={styles.recordFact}>
            <dt>{fact.label}</dt>
            <dd>{fact.value}</dd>
          </div>
        ))}
      </dl>
      <p className={styles.recordNotes}>
        {t('record.notesValue', { value: record.notes || empty })}
      </p>
    </article>
  );
}
