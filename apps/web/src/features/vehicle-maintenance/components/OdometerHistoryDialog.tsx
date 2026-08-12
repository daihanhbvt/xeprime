'use client';

import { Alert, List, Pagination, Skeleton, Tag } from 'antd';
import { useState } from 'react';
import { ODOMETER_SOURCE_LABEL, type OdometerSource } from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { formatDateTime } from '@/lib/datetime';
import { formatKm } from '@/lib/odometer';
import { useOdometerHistory } from '../hooks';
import styles from './VehicleMaintenanceWorkspace.module.css';

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
  const [page, setPage] = useState(1);
  const history = useOdometerHistory(vehicleId, page, open);

  return (
    <ResponsiveDialog
      open={open}
      title="Lịch sử chỉ số KM"
      size="md"
      mobileMode="fullscreen"
      onClose={onClose}
      footer={null}
    >
      {history.isLoading ? <Skeleton active paragraph={{ rows: 4 }} /> : null}
      {history.isError ? (
        <Alert type="error" showIcon message="Không tải được lịch sử KM" />
      ) : null}
      {history.data ? (
        history.data.items.length === 0 ? (
          <p className={styles.emptyText}>Chưa có lần ghi nhận KM nào cho xe này.</p>
        ) : (
          <>
            <List
              dataSource={history.data.items}
              renderItem={(reading) => (
                <List.Item key={reading.id} className={styles.historyRow}>
                  <div className={styles.historyBody}>
                    <div className={styles.historyHead}>
                      <strong>{formatKm(reading.odometerKm)}</strong>
                      {reading.previousKm != null ? (
                        <span className={styles.historyPrevious}>
                          từ {formatKm(reading.previousKm)}
                        </span>
                      ) : null}
                      {reading.isDecrease ? <Tag color="red">Giảm KM</Tag> : null}
                    </div>
                    <div className={styles.historyMeta}>
                      <span>
                        {ODOMETER_SOURCE_LABEL[reading.source as OdometerSource] ?? reading.source}
                      </span>
                      <span>{formatDateTime(reading.recordedAt)}</span>
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
                  showTotal={(total) => `${total} lần ghi nhận`}
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
