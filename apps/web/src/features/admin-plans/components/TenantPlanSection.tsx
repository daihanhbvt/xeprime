'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { App, Button, Popconfirm, Select, Spin, Tag } from 'antd';
import { useMemo, useState } from 'react';
import {
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_META,
  type SubscriptionStatus,
} from '@xeprime/types';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { dayjs, formatDate } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import { getErrorMessage } from '@/services/api-client';
import { useAssignSubscription, useCancelSubscription } from '../hooks/use-plan-mutations';
import { usePlans, useTenantSubscriptions } from '../hooks/use-plans';
import type { CurrentPlan, Subscription } from '../types';
import styles from './TenantPlanSection.module.css';

/**
 * Section "Gói dịch vụ" trong drawer gian hàng (ADR 0010): gói hiện hành + gán/gia hạn +
 * lịch sử thuê bao (dòng active còn hạn huỷ sớm được). "Hết hạn" suy ra từ endsAt khi hiển thị.
 */
export function TenantPlanSection({
  tenantId,
  currentPlan,
}: {
  tenantId: string;
  currentPlan: CurrentPlan | null;
}) {
  const { message } = App.useApp();
  const [assignOpen, setAssignOpen] = useState(false);
  const history = useTenantSubscriptions(tenantId);
  const cancel = useCancelSubscription(tenantId);

  function handleCancel(sub: Subscription) {
    cancel.mutate(sub.id, {
      onSuccess: () => message.success('Đã huỷ thuê bao'),
      onError: (err) => message.error(getErrorMessage(err)),
    });
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        <CreditCardOutlined /> Gói dịch vụ
      </div>

      <div className={styles.currentRow}>
        {currentPlan ? (
          <div>
            <div className={styles.currentName}>{currentPlan.planName}</div>
            <div className={styles.meta}>
              Hết hạn {formatDate(currentPlan.endsAt)}
              {currentPlan.maxVehicles != null
                ? ` · tối đa ${currentPlan.maxVehicles} xe`
                : ' · không giới hạn xe'}
            </div>
          </div>
        ) : (
          <div className={styles.meta}>Chưa có gói (không giới hạn)</div>
        )}
        <Button size="small" type="primary" onClick={() => setAssignOpen(true)}>
          {currentPlan ? 'Gia hạn / đổi gói' : 'Gán gói'}
        </Button>
      </div>

      {history.isLoading ? (
        <div className={styles.center}>
          <Spin size="small" />
        </div>
      ) : history.isError ? (
        <div className={styles.empty}>
          Không tải được lịch sử thuê bao.{' '}
          <Button size="small" type="link" onClick={() => void history.refetch()}>
            Thử lại
          </Button>
        </div>
      ) : (history.data?.items.length ?? 0) === 0 ? (
        <div className={styles.empty}>Chưa có lịch sử thuê bao</div>
      ) : (
        <ul className={styles.historyList}>
          {history.data!.items.map((sub) => (
            <HistoryRow
              key={sub.id}
              sub={sub}
              cancelling={cancel.isPending && cancel.variables === sub.id}
              onCancel={() => handleCancel(sub)}
            />
          ))}
        </ul>
      )}

      <AssignPlanModal
        open={assignOpen}
        tenantId={tenantId}
        currentEndsAt={currentPlan?.endsAt ?? null}
        onClose={() => setAssignOpen(false)}
      />
    </div>
  );
}

function HistoryRow({
  sub,
  cancelling,
  onCancel,
}: {
  sub: Subscription;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const now = dayjs();
  const isExpired =
    sub.status === SUBSCRIPTION_STATUS.ACTIVE && dayjs(sub.endsAt).isBefore(now);
  const isLive = sub.status === SUBSCRIPTION_STATUS.ACTIVE && !isExpired;

  return (
    <li className={styles.historyRow}>
      <div>
        <div>{sub.planName}</div>
        <div className={styles.meta}>
          {formatDate(sub.startsAt)} → {formatDate(sub.endsAt)} · {formatMoneyVnd(sub.price)}
          {sub.note ? ` · ${sub.note}` : ''}
        </div>
      </div>
      <div>
        {isExpired ? (
          // Dòng active đã qua endsAt → hiển thị "Hết hạn" (suy ra, ADR 0010 — DB vẫn lưu active).
          <Tag color="red">Hết hạn</Tag>
        ) : (
          <StatusTag value={sub.status as SubscriptionStatus} meta={SUBSCRIPTION_STATUS_META} />
        )}
        {isLive ? (
          <Popconfirm
            title="Huỷ sớm thuê bao này?"
            okText="Huỷ thuê bao"
            okButtonProps={{ danger: true }}
            cancelText="Đóng"
            onConfirm={onCancel}
          >
            <Button size="small" type="link" danger loading={cancelling}>
              Huỷ
            </Button>
          </Popconfirm>
        ) : null}
      </div>
    </li>
  );
}

function AssignPlanModal({
  open,
  tenantId,
  currentEndsAt,
  onClose,
}: {
  open: boolean;
  tenantId: string;
  currentEndsAt: string | null;
  onClose: () => void;
}) {
  const { message } = App.useApp();
  const plans = usePlans('active');
  const assign = useAssignSubscription(tenantId);
  const [planId, setPlanId] = useState<string | null>(null);

  const options = (plans.data ?? []).map((p) => ({
    value: p.id,
    label: `${p.name} — ${formatMoneyVnd(p.price)} / ${p.durationDays} ngày${
      p.maxVehicles != null ? ` · tối đa ${p.maxVehicles} xe` : ''
    }`,
  }));

  // Preview chu kỳ mới, cùng quy tắc BE: nối đuôi gói còn hạn, hết/chưa có thì từ bây giờ.
  const preview = useMemo(() => {
    const plan = plans.data?.find((p) => p.id === planId);
    if (!plan) return null;
    const now = dayjs();
    const starts =
      currentEndsAt && dayjs(currentEndsAt).isAfter(now) ? dayjs(currentEndsAt) : now;
    return {
      starts,
      ends: starts.add(plan.durationDays, 'day'),
      price: plan.price,
    };
  }, [plans.data, planId, currentEndsAt]);

  function submit() {
    if (!planId) {
      message.warning('Chọn gói trước');
      return;
    }
    assign.mutate(
      { planId },
      {
        onSuccess: () => {
          message.success('Đã gán gói');
          setPlanId(null);
          onClose();
        },
        onError: (err) => message.error(getErrorMessage(err)),
      },
    );
  }

  return (
    <ResponsiveDialog title="Gán / gia hạn gói" open={open} onClose={onClose} footer={null}>
      {plans.isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : (plans.data?.length ?? 0) === 0 ? (
        <div className={styles.empty}>Chưa có gói nào đang bán — tạo gói ở trang Gói dịch vụ trước.</div>
      ) : (
        <>
          <Select
            style={{ width: '100%' }}
            size="large"
            placeholder="Chọn gói"
            value={planId}
            options={options}
            onChange={(value: string) => setPlanId(value)}
          />
          {preview ? (
            <div className={styles.preview}>
              Chu kỳ mới: <b>{formatDate(preview.starts.toISOString())}</b> →{' '}
              <b>{formatDate(preview.ends.toISOString())}</b> · {formatMoneyVnd(preview.price)}
              {currentEndsAt && dayjs(currentEndsAt).isAfter(dayjs())
                ? ' (nối đuôi gói hiện hành)'
                : ''}
            </div>
          ) : null}
          <div className={styles.actions}>
            <Button onClick={onClose}>Đóng</Button>
            <Button type="primary" loading={assign.isPending} onClick={submit}>
              Xác nhận
            </Button>
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}
