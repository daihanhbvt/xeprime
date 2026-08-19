'use client';

import { Alert, Button, Card, Popconfirm, Space } from 'antd';
import {
  TENANT_STATUS, TENANT_STATUS_META, TENANT_STATUS_SUBMITTABLE, type TenantStatus, } from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import type { MyShop } from '../types';
import styles from './ShopStatusCard.module.css';
import { useAppFormat } from '@/i18n/use-app-format';

interface ShopStatusCardProps {
  shop: MyShop;
  submitting: boolean;
  onSubmit: () => void;
}

export function ShopStatusCard({ shop, submitting, onSubmit }: ShopStatusCardProps) {
  const fmt = useAppFormat();

  const status = shop.status as TenantStatus;
  const canSubmit = TENANT_STATUS_SUBMITTABLE.includes(status);
  const approval = shop.latestApproval;

  return (
    <Card className={styles.card}>
      <div className={styles.row}>
        <Space size="middle" wrap>
          <span className={styles.label}>Trạng thái gian hàng</span>
          <StatusTag value={status} meta={TENANT_STATUS_META} group="tenantStatus" />
        </Space>
        {canSubmit ? (
          <Popconfirm
            title="Gửi hồ sơ cho nền tảng duyệt?"
            description="Sau khi gửi, bạn không sửa hồ sơ cho tới khi có kết quả."
            okText="Gửi duyệt"
            cancelText="Huỷ"
            onConfirm={onSubmit}
          >
            <Button type="primary" loading={submitting}>
              {status === TENANT_STATUS.DRAFT ? 'Gửi duyệt' : 'Gửi lại duyệt'}
            </Button>
          </Popconfirm>
        ) : null}
      </div>

      {status === TENANT_STATUS.PENDING_REVIEW ? (
        <Alert
          className={styles.alert}
          type="info"
          showIcon
          message="Hồ sơ đang chờ nền tảng duyệt"
          description={
            approval ? `Đã gửi lúc ${fmt.dateTime(approval.submittedAt)}.` : undefined
          }
        />
      ) : null}

      {status === TENANT_STATUS.NEEDS_REVISION && approval?.reason ? (
        <Alert
          className={styles.alert}
          type="warning"
          showIcon
          message="Nền tảng yêu cầu bổ sung"
          description={approval.reason}
        />
      ) : null}

      {status === TENANT_STATUS.REJECTED && approval?.reason ? (
        <Alert
          className={styles.alert}
          type="error"
          showIcon
          message="Hồ sơ bị từ chối"
          description={approval.reason}
        />
      ) : null}

      {status === TENANT_STATUS.ACTIVE ? (
        <Alert
          className={styles.alert}
          type="success"
          showIcon
          message="Gian hàng đang hoạt động — xe đã duyệt sẽ hiển thị trên marketplace."
        />
      ) : null}
    </Card>
  );
}
