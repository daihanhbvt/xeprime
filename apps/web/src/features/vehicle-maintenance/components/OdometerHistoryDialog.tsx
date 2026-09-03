'use client';

import { Alert, List, Pagination, Skeleton, Tag } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useOdometerHistory } from '../hooks';
import styles from './VehicleMaintenanceWorkspace.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * Lịch sử KM — CHỈ-THÊM. Mỗi dòng nói rõ số cũ → số mới, nguồn nào và ai ghi; lần giảm KM
 * được đánh dấu riêng vì đó là thứ cần soi khi đối soát (§9.1).
 * Phân trang server-side: mỗi chuyến thuê đều sinh một dòng nên danh sách này chỉ có lớn thêm.
 */
export function OdometerHistoryDialog({
  open,
  vehicleId,
  onClose,
}: {
  open: boolean;
  vehicleId: string;
  onClose: () => void;
}) {
  const fmt = useAppFormat();
  const t = useTranslations('Maintenance');
  const domainLabel = useDomainLabel();

  const [page, setPage] = useState(1);
  const history = useOdometerHistory(vehicleId, page, open);

  return (
    <ResponsiveDialog
      open={open}
      title={t('history.title')}
      size="md"
      mobileMode="fullscreen"
      onClose={onClose}
      footer={null}
    >
      {history.isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
      {history.isError ? <Alert type="error" showIcon message={t('history.loadError')} /> : null}
      {history.data ? (
        history.data.items.length === 0 ? (
          <p className={styles.emptyText}>{t('history.empty')}</p>
        ) : (
          <>
            <List
              dataSource={history.data.items}
              renderItem={(reading) => (
                <List.Item key={reading.id} className={styles.historyRow}>
                  <div className={styles.historyBody}>
                    <div className={styles.historyHead}>
                      <strong>{fmt.km(reading.odometerKm)}</strong>
                      {reading.previousKm != null ? (
                        <span className={styles.historyPrevious}>
                          {t('history.from', { value: fmt.km(reading.previousKm) })}
                        </span>
                      ) : null}
                      {reading.isDecrease ? <Tag color={STATUS_COLOR.DANGER}>{t('history.decrease')}</Tag> : null}
                    </div>
                    <div className={styles.historyMeta}>
                      <span>
                        {domainLabel('odometerSource', reading.source, reading.source)}
                      </span>
                      <span>{fmt.dateTime(reading.recordedAt)}</span>
                      {reading.recordedByName ? <span>{reading.recordedByName}</span> : null}
                    </div>
                    {reading.reason ? (
                      <p className={styles.historyReason}>{reading.reason}</p>
                    ) : null}
                  </div>
                </List.Item>
              )}
            />
            {history.data.meta.total > history.data.meta.limit ? (
              <div className={styles.historyPagination}>
                <Pagination
                  size="small"
                  current={history.data.meta.page}
                  pageSize={history.data.meta.limit}
                  total={history.data.meta.total}
                  showSizeChanger={false}
                  showTotal={(total) => t('history.total', { count: total })}
                  onChange={setPage}
                />
              </div>
            ) : null}
          </>
        )
      ) : null}
    </ResponsiveDialog>
  );
}
