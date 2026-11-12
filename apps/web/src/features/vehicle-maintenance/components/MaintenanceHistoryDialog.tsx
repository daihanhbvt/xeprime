'use client';

import { Button, Pagination } from 'antd';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import type { MaintenanceRecord } from '../types';
import { MaintenanceRecordItem } from './MaintenanceRecordItem';
import styles from './VehicleMaintenanceWorkspace.module.css';

const PAGE_SIZE = 10;

/**
 * Lịch sử bảo dưỡng của một xe — phiếu đã hoàn tất hoặc đã huỷ, mới nhất trước.
 *
 * Danh sách đã có sẵn trong trang (API trả tối đa 200 phiếu của một xe), nên chỉ chia trang ở
 * client cho hộp thoại khỏi dài.
 */
export function MaintenanceHistoryDialog({
  open,
  records,
  canViewFiles,
  onClose,
}: {
  open: boolean;
  records: MaintenanceRecord[];
  canViewFiles: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('Maintenance');
  const tCommon = useTranslations('Common');
  const [page, setPage] = useState(1);
  const lastPage = Math.max(1, Math.ceil(records.length / PAGE_SIZE));
  const current = Math.min(page, lastPage);
  const visible = records.slice((current - 1) * PAGE_SIZE, current * PAGE_SIZE);

  return (
    <ResponsiveDialog
      open={open}
      title={t('recordHistory.title')}
      size="md"
      mobileMode="fullscreen"
      onClose={onClose}
      footer={<Button onClick={onClose}>{tCommon('actions.close')}</Button>}
    >
      {records.length === 0 ? (
        <p className={styles.emptyText}>{t('workspace.historyEmpty')}</p>
      ) : (
        <>
          <div className={styles.historyRecords}>
            {visible.map((record) => (
              <MaintenanceRecordItem
                key={record.id}
                record={record}
                showStatus
                canViewFiles={canViewFiles}
              />
            ))}
          </div>
          {records.length > PAGE_SIZE ? (
            <div className={styles.historyPagination}>
              <Pagination
                size="small"
                current={current}
                pageSize={PAGE_SIZE}
                total={records.length}
                showSizeChanger={false}
                showTotal={(total) => t('recordHistory.total', { count: total })}
                onChange={setPage}
              />
            </div>
          ) : null}
        </>
      )}
    </ResponsiveDialog>
  );
}
