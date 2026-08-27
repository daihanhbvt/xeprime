'use client';

import { useState } from 'react';
import {
  App, Button, Descriptions, Divider, Empty, Input, Space, Timeline, Typography, } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import {
  APPROVAL_STATUS, APPROVAL_STATUS_META, APPROVAL_TARGET_TYPE, type ApprovalStatus, } from '@xeprime/types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { getErrorMessage } from '@/services/api-client';
import {
  SHOP_SNAPSHOT_FIELDS,
  VEHICLE_SNAPSHOT_FIELDS,
  targetTypeLabel,
  type SnapshotField,
} from '../constants';
import { useApproval, useReviewActions } from '../hooks/use-approvals';
import type { ApprovalDetail } from '../types';
import styles from './ApprovalDetailDrawer.module.css';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';

const EMPTY = '—';
type ReviewKind = 'approve' | 'reject' | 'request_revision';

interface ApprovalDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

export function ApprovalDetailDrawer({ taskId, onClose }: ApprovalDetailDrawerProps) {
  const { message } = App.useApp();
  const { data: task, isLoading } = useApproval(taskId);
  const review = useReviewActions(taskId ?? '');
  const [reasonModal, setReasonModal] = useState<{ kind: ReviewKind } | null>(null);
  const [reason, setReason] = useState('');

  const isPending = task?.status === APPROVAL_STATUS.PENDING;

  function runReview(kind: ReviewKind, withReason?: string) {
    review.mutate(
      { kind, reason: withReason },
      {
        onSuccess: () => {
          message.success(
            kind === 'approve'
              ? 'Đã duyệt'
              : kind === 'reject'
                ? 'Đã từ chối'
                : 'Đã yêu cầu bổ sung',
          );
          setReasonModal(null);
          setReason('');
        },
        onError: (error) => message.error(getErrorMessage(error)),
      },
    );
  }

  return (
    <>
      <DetailDrawer
        open={Boolean(taskId)}
        onClose={onClose}
        size="md"
        title="Phiếu duyệt"
        loading={isLoading || !task}
        extra={
          task ? (
            <StatusTag value={task.status as ApprovalStatus} meta={APPROVAL_STATUS_META} group="approvalStatus" />
          ) : null
        }
        footer={
          isPending ? (
            <Space wrap>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={review.isPending}
                onClick={() => runReview('approve')}
              >
                Duyệt
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setReason('');
                  setReasonModal({ kind: 'request_revision' });
                }}
              >
                Yêu cầu bổ sung
              </Button>
              <Button
                danger
                icon={<CloseOutlined />}
                onClick={() => {
                  setReason('');
                  setReasonModal({ kind: 'reject' });
                }}
              >
                Từ chối
              </Button>
            </Space>
          ) : null
        }
      >
        {task ? <DetailBody task={task} /> : null}
      </DetailDrawer>

      <ResponsiveDialog
        open={Boolean(reasonModal)}
        title={reasonModal?.kind === 'reject' ? 'Từ chối hồ sơ' : 'Yêu cầu bổ sung'}
        size="sm"
        okText="Gửi"
        destructive={reasonModal?.kind === 'reject'}
        okDisabled={!reason.trim()}
        confirmLoading={review.isPending}
        onOk={() => reasonModal && runReview(reasonModal.kind, reason.trim())}
        onClose={() => setReasonModal(null)}
      >
        <Typography.Paragraph type="secondary">
          Lý do sẽ được gửi cho chủ gian hàng.
        </Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Nhập lý do…"
          maxLength={2000}
          showCount
        />
      </ResponsiveDialog>
    </>
  );
}

function DetailBody({ task }: { task: ApprovalDetail }) {
  const fmt = useAppFormat();

  const snapshot = task.snapshot ?? {};
  const isVehicle = task.targetType === APPROVAL_TARGET_TYPE.VEHICLE;
  const fields = isVehicle ? VEHICLE_SNAPSHOT_FIELDS : SHOP_SNAPSHOT_FIELDS;
  const image =
    isVehicle && typeof snapshot.mainImageUrl === 'string' ? snapshot.mainImageUrl : null;

  return (
    <div>
      {task.tenant ? (
        <Descriptions
          title="Gian hàng"
          bordered
          size="small"
          column={1}
          items={[
            { key: 'name', label: 'Tên', children: task.tenant.name },
            { key: 'code', label: 'Mã', children: task.tenant.code },
            {
              key: 'status',
              label: 'Trạng thái',
              children: task.tenant.status,
            },
            { key: 'phone', label: 'Điện thoại', children: task.tenant.phone || EMPTY },
            { key: 'email', label: 'Email', children: task.tenant.email || EMPTY },
            { key: 'type', label: 'Loại phiếu', children: targetTypeLabel(task.targetType) },
          ]}
        />
      ) : null}

      <Divider>{isVehicle ? 'Xe gửi duyệt' : 'Hồ sơ đã gửi'}</Divider>
      {image ? <PreviewImage src={image} alt="Ảnh xe" className={styles.snapshotImage} /> : null}
      {hasSnapshot(fields, snapshot) ? (
        <Descriptions bordered size="small" column={1} items={snapshotItems(fields, snapshot, fmt)} />
      ) : !image ? (
        <Empty description="Không có hồ sơ đính kèm" />
      ) : null}

      <Divider>Lịch sử</Divider>
      <Timeline
        items={task.logs.map((log) => ({
          children: (
            <div>
              <Typography.Text strong>{log.actorName ?? 'Hệ thống'}</Typography.Text>{' '}
              <Typography.Text type="secondary">{fmt.dateTime(log.createdAt)}</Typography.Text>
              <div>
                {log.fromStatus ? `${log.fromStatus} → ` : ''}
                {log.toStatus}
              </div>
              {log.note ? <Typography.Text type="secondary">{log.note}</Typography.Text> : null}
            </div>
          ),
        }))}
      />
    </div>
  );
}

function hasSnapshot(fields: readonly SnapshotField[], snapshot: Record<string, unknown>): boolean {
  return fields.some((f) => snapshot[f.key] != null && snapshot[f.key] !== '');
}

function snapshotItems(
  fields: readonly SnapshotField[],
  snapshot: Record<string, unknown>,
  fmt: AppFormat,
) {
  return fields
    .filter((f) => snapshot[f.key] != null && snapshot[f.key] !== '')
    .map((f) => ({
      key: f.key,
      label: f.label,
      children: f.format ? f.format(snapshot[f.key], fmt) : String(snapshot[f.key]),
    }));
}
