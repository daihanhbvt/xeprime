'use client';

import { useState } from 'react';
import { Alert, App, Button, Descriptions, Divider, Empty, Input, Space, Tag, Timeline, Typography } from 'antd';
import Link from 'next/link';
import { CheckOutlined, CloseOutlined, EditOutlined, ExportOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import {
  APPROVAL_STATUS,
  APPROVAL_STATUS_META,
  APPROVAL_TARGET_TYPE,
  TENANT_STATUS_META,
  type ApprovalStatus,
  type TenantStatus,
} from '@xeprime/types';
import { PreviewImage } from '@/components/data-display/PreviewImage';
import { StatusTag } from '@/components/data-display/StatusTag';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { ROUTES, shopPath, vehiclePath } from '@/constants/routes';
import { useAppFormat, type AppFormat } from '@/i18n/use-app-format';
import type { DomainLabel } from '@/i18n/domain';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  SHOP_SNAPSHOT_FIELDS,
  VEHICLE_SNAPSHOT_FIELDS,
  isReviewableTargetType,
  snapshotImages,
  type SnapshotField,
  type SnapshotLabelKey,
} from '../constants';
import { useApproval, useReviewActions } from '../hooks/use-approvals';
import type { ApprovalDetail } from '../types';
import styles from './ApprovalDetailDrawer.module.css';

const EMPTY = '—';
type ReviewKind = 'approve' | 'reject' | 'request_revision';

interface ApprovalDetailDrawerProps {
  taskId: string | null;
  onClose: () => void;
}

/**
 * Chi tiết một phiếu duyệt + ba quyết định.
 *
 * Ba điều đã sửa 14/09/2026, và cả ba đều là "reviewer đang quyết định thứ họ không nhìn thấy":
 *
 * 1. **Hồ sơ gian hàng thiếu đúng hai trường bắt buộc.** `ownerFullName` và `ownerPhone` là điều
 *    kiện để gửi duyệt (`missingShopProfileRequirements`), nhưng bảng nhãn cũ không khai chúng —
 *    reviewer duyệt danh tính một chủ xe mà không thấy tên và số điện thoại người đó.
 * 2. **Xe chỉ hiện một tấm ảnh.** Cổng gửi duyệt đòi ≥4 ảnh; drawer cũ chỉ vẽ `mainImageUrl`, và
 *    snapshot cũng chưa mang thư viện. Giờ snapshot có `images` + chi nhánh/tỉnh.
 * 3. **Nút Duyệt bấm ra 400 với phiếu `seller_profile`.** Loại đó do `SellerProfileService` ghi
 *    vào cùng bảng nhưng `review()` không xử; nơi duyệt thật là `/manage/admin/sellers`. Giờ nút
 *    biến mất và có lối đi tới đúng chỗ, thay vì một lỗi không giải thích được.
 */
export function ApprovalDetailDrawer({ taskId, onClose }: ApprovalDetailDrawerProps) {
  const t = useTranslations('Approvals');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { data: task, isLoading } = useApproval(taskId);
  const review = useReviewActions(taskId ?? '');
  const [reasonModal, setReasonModal] = useState<{ kind: ReviewKind } | null>(null);
  const [reason, setReason] = useState('');

  const isPending = task?.status === APPROVAL_STATUS.PENDING;
  const reviewable = task ? isReviewableTargetType(task.targetType) : false;

  function runReview(kind: ReviewKind, withReason?: string) {
    review.mutate(
      { kind, reason: withReason },
      {
        onSuccess: () => {
          message.success(t(`review.done.${kind}`));
          setReasonModal(null);
          setReason('');
        },
        onError: (error) => message.error(errorMessage(error)),
      },
    );
  }

  return (
    <>
      <DetailDrawer
        open={Boolean(taskId)}
        onClose={onClose}
        size="md"
        title={t('drawer.title')}
        loading={isLoading || !task}
        extra={
          task ? (
            <StatusTag
              value={task.status as ApprovalStatus}
              meta={APPROVAL_STATUS_META}
              group="approvalStatus"
            />
          ) : null
        }
        footer={
          isPending && reviewable ? (
            <Space wrap>
              <Button
                type="primary"
                icon={<CheckOutlined />}
                loading={review.isPending}
                onClick={() => runReview('approve')}
              >
                {t('review.approve')}
              </Button>
              <Button
                icon={<EditOutlined />}
                onClick={() => {
                  setReason('');
                  setReasonModal({ kind: 'request_revision' });
                }}
              >
                {t('review.requestRevision')}
              </Button>
              <Button
                danger
                icon={<CloseOutlined />}
                onClick={() => {
                  setReason('');
                  setReasonModal({ kind: 'reject' });
                }}
              >
                {t('review.reject')}
              </Button>
            </Space>
          ) : null
        }
      >
        {task ? <DetailBody task={task} reviewable={reviewable} /> : null}
      </DetailDrawer>

      <ResponsiveDialog
        open={Boolean(reasonModal)}
        title={reasonModal?.kind === 'reject' ? t('reason.rejectTitle') : t('reason.reviseTitle')}
        size="sm"
        okText={tCommon('actions.send')}
        destructive={reasonModal?.kind === 'reject'}
        okDisabled={!reason.trim()}
        confirmLoading={review.isPending}
        onOk={() => reasonModal && runReview(reasonModal.kind, reason.trim())}
        onClose={() => setReasonModal(null)}
      >
        <Typography.Paragraph type="secondary">{t('reason.hint')}</Typography.Paragraph>
        <Input.TextArea
          rows={4}
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder={t('reason.placeholder')}
          maxLength={2000}
          showCount
        />
      </ResponsiveDialog>
    </>
  );
}

function DetailBody({ task, reviewable }: { task: ApprovalDetail; reviewable: boolean }) {
  const t = useTranslations('Approvals');
  // Bộ dịch riêng cho nhóm nhãn trường: `labelKey` là union đóng của đúng nhóm này, nên khớp
  // kiểu mà không cần ghép chuỗi khoá động (next-intl không kiểm được khoá ghép).
  const tField = useTranslations('Approvals.snapshot.fields');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const snapshot = task.snapshot ?? {};
  const isVehicle = task.targetType === APPROVAL_TARGET_TYPE.VEHICLE;
  const fields = isVehicle ? VEHICLE_SNAPSHOT_FIELDS : SHOP_SNAPSHOT_FIELDS;
  const images = isVehicle ? snapshotImages(snapshot) : [];
  /*
   * Mở HỒ SƠ GỐC để đối chiếu. Snapshot là ảnh chụp lúc gửi và đó là thứ ĐƯỢC duyệt, nhưng
   * reviewer vẫn cần xem được bản sống (giấy tờ xe, lịch sử, gian hàng công khai) — trước đây
   * drawer không có lối nào ra ngoài, họ phải tự tra id trong một tab khác.
   */
  const sourceHref = isVehicle
    ? vehiclePath.detail(task.targetId)
    : task.tenant
      ? shopPath.detail(task.tenant.id)
      : null;

  return (
    <div>
      {/*
        Loại phiếu hàng đợi này không xử được: nói thẳng và chỉ đúng chỗ duyệt. Không có khối này
        thì reviewer bấm "Duyệt" và nhận một lỗi 400 không giải thích được.
      */}
      {!reviewable ? (
        <Alert
          type="info"
          showIcon
          className={styles.notice}
          title={t('unsupported.title')}
          description={t('unsupported.body')}
          action={
            task.targetType === APPROVAL_TARGET_TYPE.SELLER_PROFILE ? (
              <Link href={ROUTES.MANAGE.ADMIN_SELLERS}>
                <Button size="small">{t('unsupported.openSellers')}</Button>
              </Link>
            ) : null
          }
        />
      ) : null}

      {task.tenant ? (
        <Descriptions
          title={t('tenant.title')}
          bordered
          size="small"
          column={1}
          items={[
            { key: 'name', label: t('tenant.name'), children: task.tenant.name },
            { key: 'code', label: t('tenant.code'), children: task.tenant.code },
            {
              key: 'status',
              label: t('tenant.status'),
              children: (
                <StatusTag
                  value={task.tenant.status as TenantStatus}
                  meta={TENANT_STATUS_META}
                  group="tenantStatus"
                />
              ),
            },
            {
              key: 'type',
              label: t('tenant.tenantType'),
              children: domainLabel('tenantType', task.tenant.tenantType, task.tenant.tenantType),
            },
            {
              /*
               * TUYẾN quyết định mức soi: gian hàng thuê bao đã qua một vòng thương mại, còn chủ
               * xe tuyến hoa hồng vào miễn phí và đây là lần kiểm tra đầu tiên của nền tảng.
               */
              key: 'track',
              label: t('tenant.track'),
              children: (
                <Space size={4} wrap>
                  <Tag>
                    {task.tenant.billingMode
                      ? domainLabel('billingMode', task.tenant.billingMode, task.tenant.billingMode)
                      : t('tenant.noPlan')}
                  </Tag>
                  <Typography.Text type="secondary">
                    {t('tenant.publicVehicles', { count: task.tenant.publicVehicleCount })}
                  </Typography.Text>
                </Space>
              ),
            },
            { key: 'phone', label: t('tenant.phone'), children: task.tenant.phone || EMPTY },
            { key: 'email', label: t('tenant.email'), children: task.tenant.email || EMPTY },
            {
              key: 'targetType',
              label: t('tenant.targetType'),
              children: t(`targetType.${task.targetType}`),
            },
          ]}
        />
      ) : null}

      <Divider>{isVehicle ? t('snapshot.vehicleTitle') : t('snapshot.shopTitle')}</Divider>

      {sourceHref ? (
        <p className={styles.sourceLink}>
          <Link href={sourceHref} target="_blank" rel="noopener noreferrer">
            {isVehicle ? t('snapshot.openVehicle') : t('snapshot.openShop')} <ExportOutlined />
          </Link>
        </p>
      ) : null}

      {/*
        TOÀN BỘ ảnh, không phải một tấm. Cổng gửi duyệt bắt buộc ≥4 ảnh khác nhau, nên hiện một
        tấm là bỏ qua đúng phần bằng chứng mà quy tắc kia sinh ra để thu thập.
      */}
      {images.length > 0 ? (
        <div className={styles.gallery}>
          {images.map((src, index) => (
            <PreviewImage
              key={src}
              src={src}
              alt={t('snapshot.imageAlt', { index: index + 1 })}
              className={styles.snapshotImage}
            />
          ))}
        </div>
      ) : null}

      {hasSnapshot(fields, snapshot) ? (
        <Descriptions
          bordered
          size="small"
          column={1}
          items={snapshotItems(fields, snapshot, { fmt, domainLabel }, tField)}
        />
      ) : images.length === 0 ? (
        <Empty description={t('snapshot.empty')} />
      ) : null}

      <Divider>{t('history.title')}</Divider>
      <Timeline
        items={task.logs.map((log, index) => ({
          key: `${log.createdAt}-${index}`,
          children: (
            <div>
              <Typography.Text strong>{log.actorName ?? t('history.system')}</Typography.Text>{' '}
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
  ctx: { fmt: AppFormat; domainLabel: DomainLabel },
  label: (labelKey: SnapshotLabelKey) => string,
) {
  return fields
    .filter((f) => snapshot[f.key] != null && snapshot[f.key] !== '')
    .map((f) => ({
      key: f.key,
      label: label(f.labelKey),
      children: f.format ? f.format(snapshot[f.key], ctx) : String(snapshot[f.key]),
    }));
}
