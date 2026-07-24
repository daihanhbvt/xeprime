'use client';

import { useState } from 'react';
import { App, Button, Descriptions, Divider, Drawer, Empty, Input, Modal, Skeleton, Space, Timeline, Typography } from 'antd';
import { CheckOutlined, CloseOutlined, EditOutlined } from '@ant-design/icons';
import {
  APPROVAL_STATUS,
  APPROVAL_STATUS_META,
  type ApprovalStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { formatDateTime } from '@/lib/datetime';
import { getErrorMessage } from '@/services/api-client';
import { SHOP_SNAPSHOT_FIELDS, targetTypeLabel } from '../constants';
import { useApproval, useReviewActions } from '../hooks/use-approvals';
import type { ApprovalDetail } from '../types';

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
              ? 'Đã duyệt gian hàng'
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
      <Drawer
        open={Boolean(taskId)}
        onClose={onClose}
        width={560}
        title="Phiếu duyệt"
        extra={task ? <StatusTag value={task.status as ApprovalStatus} meta={APPROVAL_STATUS_META} /> : null}
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
        {isLoading || !task ? <Skeleton active paragraph={{ rows: 8 }} /> : <DetailBody task={task} />}
      </Drawer>

      <Modal
        open={Boolean(reasonModal)}
        title={reasonModal?.kind === 'reject' ? 'Từ chối hồ sơ' : 'Yêu cầu bổ sung'}
        okText="Gửi"
        okButtonProps={{ danger: reasonModal?.kind === 'reject', disabled: !reason.trim() }}
        confirmLoading={review.isPending}
        onOk={() => reasonModal && runReview(reasonModal.kind, reason.trim())}
        onCancel={() => setReasonModal(null)}
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
      </Modal>
    </>
  );
}

function DetailBody({ task }: { task: ApprovalDetail }) {
  const snapshot = task.snapshot ?? {};

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

      <Divider>Hồ sơ đã gửi</Divider>
      {hasSnapshot(snapshot) ? (
        <Descriptions bordered size="small" column={1} items={snapshotItems(snapshot)} />
      ) : (
        <Empty description="Không có hồ sơ đính kèm" />
      )}

      <Divider>Lịch sử</Divider>
      <Timeline
        items={task.logs.map((log) => ({
          children: (
            <div>
              <Typography.Text strong>{log.actorName ?? 'Hệ thống'}</Typography.Text>{' '}
              <Typography.Text type="secondary">{formatDateTime(log.createdAt)}</Typography.Text>
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

function hasSnapshot(snapshot: Record<string, unknown>): boolean {
  return SHOP_SNAPSHOT_FIELDS.some((f) => Boolean(snapshot[f.key]));
}

function snapshotItems(snapshot: Record<string, unknown>) {
  return SHOP_SNAPSHOT_FIELDS.filter((f) => Boolean(snapshot[f.key])).map((f) => ({
    key: f.key,
    label: f.label,
    children: String(snapshot[f.key]),
  }));
}
