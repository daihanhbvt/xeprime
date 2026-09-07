'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { App, Button, InputNumber, Popconfirm, Select, Spin, Tag } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BILLING_MODE,
  SUBSCRIPTION_STATUS,
  SUBSCRIPTION_STATUS_META,
  SUBSCRIPTION_TERM_MONTHS,
  STATUS_COLOR,
  addCalendarMonthsVn,
  parsePlanLimits,
  subscriptionTermTotalPreview,
  termDiscountPercent,
  type PlanLimitsJson,
  type SubscriptionStatus,
  type SubscriptionTermMonths,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { StatusTag } from '@/components/data-display/StatusTag';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { dayjs } from '@/lib/datetime';
import { useAssignSubscription, useCancelSubscription } from '../hooks/use-plan-mutations';
import { usePlans, useTenantSubscriptions } from '../hooks/use-plans';
import type { CurrentPlan, Plan, Subscription } from '../types';
import styles from './TenantPlanSection.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';

/**
 * Section "Gói dịch vụ" trong drawer gian hàng (ADR 0010/0015): gói hiện hành (kèm chế độ thu
 * phí + số chỗ đã mua) + gán/gia hạn theo kỳ THÁNG LỊCH + lịch sử thuê bao (dòng active còn hạn
 * huỷ sớm được). "Hết hạn" suy ra từ endsAt khi hiển thị.
 */
export function TenantPlanSection({
  tenantId,
  currentPlan,
}: {
  tenantId: string;
  currentPlan: CurrentPlan | null;
}) {
  const t = useTranslations('AdminPlans');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const { message } = App.useApp();
  const [assignOpen, setAssignOpen] = useState(false);
  const history = useTenantSubscriptions(tenantId);
  const cancel = useCancelSubscription(tenantId);

  function handleCancel(sub: Subscription) {
    cancel.mutate(sub.id, {
      onSuccess: () => message.success(t('tenant.cancelSuccess')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <div className={styles.section}>
      <div className={styles.sectionTitle}>
        <CreditCardOutlined /> {t('tenant.title')}
      </div>

      <div className={styles.currentRow}>
        {currentPlan ? (
          <div>
            <div className={styles.currentName}>{currentPlan.planName}</div>
            <div className={styles.meta}>
              {t('tenant.expires', { date: fmt.date(currentPlan.endsAt) })}
              {LIST_SEPARATOR}
              {currentPlan.slots
                ? t('tenant.slotsSummary', {
                    car: currentPlan.slots.car,
                    motorbike: currentPlan.slots.motorbike,
                  })
                : currentPlan.maxVehicles != null
                  ? t('tenant.legacyMaxVehicles', { count: currentPlan.maxVehicles })
                  : t('tenant.legacyUnlimited')}
            </div>
          </div>
        ) : (
          <div className={styles.meta}>{t('tenant.noPlan')}</div>
        )}
        <Button size="small" type="primary" onClick={() => setAssignOpen(true)}>
          {currentPlan ? t('tenant.renewButton') : t('tenant.assignButton')}
        </Button>
      </div>

      {history.isLoading ? (
        <div className={styles.center}>
          <Spin size="small" />
        </div>
      ) : history.isError ? (
        <div className={styles.empty}>
          {t('tenant.historyError')}{' '}
          <Button size="small" type="link" onClick={() => void history.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        </div>
      ) : (history.data?.items.length ?? 0) === 0 ? (
        <div className={styles.empty}>{t('tenant.historyEmpty')}</div>
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
  const t = useTranslations('AdminPlans');
  const fmt = useAppFormat();

  const now = dayjs();
  const isExpired = sub.status === SUBSCRIPTION_STATUS.ACTIVE && dayjs(sub.endsAt).isBefore(now);
  const isLive = sub.status === SUBSCRIPTION_STATUS.ACTIVE && !isExpired;

  return (
    <li className={styles.historyRow}>
      <div>
        <div>{sub.planName}</div>
        <div className={styles.meta}>
          {fmt.date(sub.startsAt)} → {fmt.date(sub.endsAt)} · {fmt.money(sub.price)}
          {sub.termMonths != null
            ? ` · ${t('tenant.assign.termOption', { months: sub.termMonths })}`
            : ''}
          {sub.note ? ` · ${sub.note}` : ''}
        </div>
      </div>
      <div>
        {isExpired ? (
          // Dòng active đã qua endsAt → hiển thị "Hết hạn" (suy ra, ADR 0010 — DB vẫn lưu active).
          <Tag color={STATUS_COLOR.DANGER}>{t('tenant.expiredTag')}</Tag>
        ) : (
          <StatusTag
            value={sub.status as SubscriptionStatus}
            meta={SUBSCRIPTION_STATUS_META}
            group="subscriptionStatus"
          />
        )}
        {isLive ? (
          <Popconfirm
            title={t('tenant.cancelConfirmTitle')}
            okText={t('tenant.cancelConfirmOk')}
            okButtonProps={{ danger: true }}
            cancelText={t('tenant.cancelConfirmCancel')}
            onConfirm={onCancel}
          >
            <Button size="small" type="link" danger loading={cancelling}>
              {t('tenant.cancelAction')}
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
  const t = useTranslations('AdminPlans');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const { message } = App.useApp();
  const plans = usePlans('active');
  const assign = useAssignSubscription(tenantId);
  const [planId, setPlanId] = useState<string | null>(null);
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(1);
  const [carSlots, setCarSlots] = useState<number | null>(null);
  const [motorbikeSlots, setMotorbikeSlots] = useState<number | null>(null);

  const selected: Plan | undefined = plans.data?.find((p) => p.id === planId);
  // PlanDto.limits đã đủ hình, nhưng parse lại cho ra kiểu chia sẻ (PlanLimitsJson) dùng
  // với các phép xem trước — cùng parser với backend, không tự diễn giải.
  const limits: PlanLimitsJson | null = useMemo(
    () => (selected ? parsePlanLimits(selected.limits) : null),
    [selected],
  );
  const isPackage = selected?.billingMode === BILLING_MODE.PACKAGE;

  const options = (plans.data ?? []).map((p) => ({
    value: p.id,
    label:
      p.billingMode === BILLING_MODE.COMMISSION
        ? t('tenant.assign.planOptionCommission', {
            name: p.name,
            percent: p.commissionPercent ?? 0,
          })
        : t('tenant.assign.planOptionPackage', {
            name: p.name,
            price: fmt.money(p.basePriceMonthly),
          }),
  }));

  function selectPlan(id: string) {
    setPlanId(id);
    const plan = plans.data?.find((p) => p.id === id);
    const planLimits = plan ? parsePlanLimits(plan.limits) : null;
    // Mặc định = số chỗ gồm sẵn của gói — đúng hành vi backend khi bỏ trống.
    setCarSlots(planLimits?.includedCars ?? 0);
    setMotorbikeSlots(planLimits?.includedMotorbikes ?? 0);
  }

  /** Số chỗ hiệu lực: không dưới mức gồm sẵn (backend cũng nâng lên như vậy). */
  const slots = useMemo(
    () => ({
      car: Math.max(carSlots ?? 0, limits?.includedCars ?? 0),
      motorbike: Math.max(motorbikeSlots ?? 0, limits?.includedMotorbikes ?? 0),
    }),
    [carSlots, motorbikeSlots, limits],
  );

  // Preview chu kỳ mới, cùng quy tắc BE: nối đuôi gói còn hạn, hết/chưa có thì từ bây giờ;
  // ends = THÁNG LỊCH qua addCalendarMonthsVn (ADR 0015 điều 2), không phải cộng ngày.
  const preview = useMemo(() => {
    if (!selected || !limits) return null;
    const now = dayjs();
    const starts = currentEndsAt && dayjs(currentEndsAt).isAfter(now) ? dayjs(currentEndsAt) : now;
    const total = subscriptionTermTotalPreview(
      selected.basePriceMonthly,
      limits,
      slots,
      termMonths,
    );
    return {
      starts,
      ends: dayjs(addCalendarMonthsVn(starts.toDate(), termMonths)),
      total,
      queued: Boolean(currentEndsAt && dayjs(currentEndsAt).isAfter(now)),
    };
  }, [selected, limits, slots, termMonths, currentEndsAt]);

  const termOptions = SUBSCRIPTION_TERM_MONTHS.map((months) => {
    const discount = limits ? termDiscountPercent(limits, months) : 0;
    return {
      value: months,
      label:
        discount > 0
          ? t('tenant.assign.termOptionDiscount', { months, percent: discount })
          : t('tenant.assign.termOption', { months }),
    };
  });

  function submit() {
    if (!planId) {
      message.warning(t('tenant.assign.selectFirst'));
      return;
    }
    assign.mutate(
      { planId, termMonths, ...(isPackage ? { slots } : {}) },
      {
        onSuccess: () => {
          message.success(t('tenant.assign.success'));
          setPlanId(null);
          onClose();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  return (
    <ResponsiveDialog title={t('tenant.assign.title')} open={open} onClose={onClose} footer={null}>
      {plans.isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : (plans.data?.length ?? 0) === 0 ? (
        <div className={styles.empty}>{t('tenant.assign.empty')}</div>
      ) : (
        <>
          <Select
            className={styles.planSelect}
            size="large"
            placeholder={t('tenant.assign.selectPlaceholder')}
            value={planId}
            options={options}
            onChange={selectPlan}
          />

          {selected ? (
            <div className={styles.assignFields}>
              <label className={styles.assignField}>
                <span>{t('tenant.assign.term')}</span>
                <Select<SubscriptionTermMonths>
                  value={termMonths}
                  options={termOptions}
                  onChange={setTermMonths}
                />
              </label>
              {isPackage && limits ? (
                <>
                  <label className={styles.assignField}>
                    <span>{t('tenant.assign.carSlots')}</span>
                    <InputNumber
                      min={limits.includedCars}
                      max={limits.maxCars ?? undefined}
                      value={slots.car}
                      onChange={(value) => setCarSlots(value)}
                    />
                  </label>
                  <label className={styles.assignField}>
                    <span>{t('tenant.assign.motorbikeSlots')}</span>
                    <InputNumber
                      min={limits.includedMotorbikes}
                      max={limits.maxMotorbikes ?? undefined}
                      value={slots.motorbike}
                      onChange={(value) => setMotorbikeSlots(value)}
                    />
                  </label>
                  <div className={styles.meta}>
                    {t('tenant.assign.slotsHelp', {
                      car: limits.includedCars,
                      motorbike: limits.includedMotorbikes,
                    })}
                  </div>
                </>
              ) : null}
            </div>
          ) : null}

          {preview ? (
            <div className={styles.preview}>
              {t('tenant.assign.preview', {
                from: fmt.date(preview.starts.toISOString()),
                to: fmt.date(preview.ends.toISOString()),
              })}
              {preview.queued ? ` ${t('tenant.assign.previewQueued')}` : ''}
              <div>
                {preview.total != null
                  ? t('tenant.assign.previewTotal', { amount: fmt.money(String(preview.total)) })
                  : t('tenant.assign.previewUnavailable')}
              </div>
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button onClick={onClose}>{tCommon('actions.close')}</Button>
            <Button
              type="primary"
              loading={assign.isPending}
              disabled={Boolean(selected && isPackage && preview?.total == null)}
              onClick={submit}
            >
              {tCommon('actions.confirm')}
            </Button>
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}
