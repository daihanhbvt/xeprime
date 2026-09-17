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
  planTermPrice,
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
              {/*
                Hạn mức đọc từ SNAPSHOT của dòng thuê bao, không từ bậc gói (ADR 0041 điều 3):
                admin sửa trần của một bậc không lật hạn mức của gian hàng đang giữa kỳ, nên in
                con số của bậc ở đây là nói sai về chính tenant đang mở.
                `quota` null = tuyến hoa hồng hoặc dòng trước ADR 0041 — cả hai đều không có hạn
                mức MUA để in.
              */}
              {currentPlan.quota
                ? t('tenant.quotaSummary', {
                    vehicles:
                      currentPlan.quota.maxVehicles == null
                        ? t('tenant.assign.unlimited')
                        : String(currentPlan.quota.maxVehicles),
                    branches:
                      currentPlan.quota.maxBranches == null
                        ? t('tenant.assign.unlimited')
                        : String(currentPlan.quota.maxBranches),
                  })
                : t('tenant.noQuota')}
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
            ? ` · ${t('tenant.termMonths', { months: sub.termMonths })}`
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
  /**
   * Giá ĐÀM PHÁN — `null` = dùng giá niêm yết của kỳ hạn (ADR 0041 điều 5).
   *
   * Phân biệt `null` với `0` là điều kiện để cả hai ý định cùng diễn đạt được: bỏ trống là "lấy
   * giá bảng", còn gõ 0 là "tặng kỳ này" — và một lượt tặng phải để lại dấu vết trong audit chứ
   * không lẫn vào ca mặc định.
   */
  const [price, setPrice] = useState<number | null>(null);

  const selected: Plan | undefined = plans.data?.find((p) => p.id === planId);
  // PlanDto.limits đã đủ hình, nhưng parse lại cho ra kiểu chia sẻ (PlanLimitsJson) dùng
  // với các phép xem trước — cùng parser với backend, không tự diễn giải.
  const limits: PlanLimitsJson | null = useMemo(
    () => (selected ? parsePlanLimits(selected.limits) : null),
    [selected],
  );
  const isPackage = selected?.billingMode === BILLING_MODE.PACKAGE;
  const listed = limits ? planTermPrice(limits, termMonths) : null;
  /** Bậc tư vấn, hoặc kỳ hạn ngoài bảng giá: không có gì để rơi về ⇒ `price` BẮT BUỘC. */
  const priceRequired = Boolean(isPackage && listed === null);

  const options = (plans.data ?? []).map((p) => {
    const planLimits = parsePlanLimits(p.limits);
    return {
      value: p.id,
      label:
        p.billingMode === BILLING_MODE.COMMISSION
          ? t('tenant.assign.planOptionCommission', {
              name: p.name,
              percent: p.commissionPercent ?? 0,
            })
          : planLimits.salesOnly
            ? t('tenant.assign.planOptionSalesOnly', { name: p.name })
            : t('tenant.assign.planOptionPackage', {
                name: p.name,
                vehicles:
                  planLimits.maxVehicles == null
                    ? t('tenant.assign.unlimited')
                    : String(planLimits.maxVehicles),
              }),
    };
  });

  function selectPlan(id: string) {
    setPlanId(id);
    // Đổi bậc là đổi bảng giá — giữ lại một con số đàm phán của bậc trước là gán nhầm giá.
    setPrice(null);
  }

  // Preview chu kỳ mới, cùng quy tắc BE: nối đuôi gói còn hạn, hết/chưa có thì từ bây giờ;
  // ends = THÁNG LỊCH qua addCalendarMonthsVn (ADR 0015 điều 2), không phải cộng ngày.
  const preview = useMemo(() => {
    if (!selected) return null;
    const now = dayjs();
    const starts = currentEndsAt && dayjs(currentEndsAt).isAfter(now) ? dayjs(currentEndsAt) : now;
    return {
      starts,
      ends: dayjs(addCalendarMonthsVn(starts.toDate(), termMonths)),
      queued: Boolean(currentEndsAt && dayjs(currentEndsAt).isAfter(now)),
    };
  }, [selected, termMonths, currentEndsAt]);

  /** Tiền sẽ ghi lên dòng thuê bao: con số admin gõ thắng giá niêm yết. */
  const effectiveTotal = price ?? (listed == null ? null : Number(listed));

  const termOptions = SUBSCRIPTION_TERM_MONTHS.map((months) => {
    const amount = limits ? planTermPrice(limits, months) : null;
    return {
      value: months,
      label:
        amount == null
          ? t('tenant.assign.termOptionNoPrice', { months })
          : t('tenant.assign.termOptionPriced', { months, amount: fmt.money(amount) }),
    };
  });

  function submit() {
    if (!planId) {
      message.warning(t('tenant.assign.selectFirst'));
      return;
    }
    assign.mutate(
      { planId, termMonths, ...(price == null ? {} : { price: String(price) }) },
      {
        onSuccess: () => {
          message.success(t('tenant.assign.success'));
          setPlanId(null);
          setPrice(null);
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
              {isPackage ? (
                <>
                  <label className={styles.assignField}>
                    <span>{t('tenant.assign.price')}</span>
                    <InputNumber
                      min={0}
                      step={10000}
                      value={price}
                      placeholder={
                        listed == null
                          ? t('tenant.assign.pricePlaceholderRequired')
                          : fmt.money(listed)
                      }
                      onChange={setPrice}
                    />
                  </label>
                  <div className={styles.meta}>
                    {priceRequired
                      ? t('tenant.assign.priceRequiredHelp')
                      : t('tenant.assign.priceHelp')}
                  </div>
                  {/*
                    Hạn mức của lượt gán này đến từ BẬC và được snapshot lên dòng thuê bao
                    (ADR 0041 điều 3) — admin không sửa được ở đây. Hiện nó ra vì đó là thứ thay
                    đổi thật sự đối với gian hàng; muốn một trần khác thì sửa bậc, hoặc dựng một
                    bậc riêng — không phải chỉnh tay một dòng thuê bao.
                  */}
                  {limits ? (
                    <div className={styles.meta}>
                      {t('tenant.assign.quotaSummary', {
                        vehicles:
                          limits.maxVehicles == null
                            ? t('tenant.assign.unlimited')
                            : String(limits.maxVehicles),
                        branches:
                          limits.maxBranches == null
                            ? t('tenant.assign.unlimited')
                            : String(limits.maxBranches),
                      })}
                    </div>
                  ) : null}
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
                {effectiveTotal != null
                  ? t('tenant.assign.previewTotal', { amount: fmt.money(String(effectiveTotal)) })
                  : t('tenant.assign.previewNeedsPrice')}
              </div>
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button onClick={onClose}>{tCommon('actions.close')}</Button>
            <Button
              type="primary"
              loading={assign.isPending}
              disabled={priceRequired && price == null}
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
