'use client';

import { App, Alert, Button, InputNumber, Select, Spin } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  SUBSCRIPTION_TERM_MONTHS,
  parsePlanLimits,
  subscriptionTermTotalPreview,
  termDiscountPercent,
  type PlanLimitsJson,
  type SubscriptionTermMonths,
} from '@xeprime/types';
import { CopyButton } from '@/components/data-display/CopyButton';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePurchaseSubscription, useTenantPlans } from '../hooks/use-subscription';
import type { SubscriptionInvoice, TenantPlan } from '../types';
import styles from './PurchaseModal.module.css';

/**
 * Mua / gia hạn gói (W2, ADR 0015): chọn gói + kỳ hạn + số chỗ → sinh HOÁ ĐƠN kèm mã đối soát.
 * KHÔNG có QR ở đợt này (W4); gói chỉ kích hoạt khi tiền về (ADR 0026 điều 4) — modal chuyển
 * sang màn "chuyển khoản" ngay khi hoá đơn tạo xong để mã không bị bỏ lỡ.
 */
export function PurchaseModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();

  const plans = useTenantPlans(open);
  const purchase = usePurchaseSubscription();

  const [planId, setPlanId] = useState<string | null>(null);
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(1);
  const [carSlots, setCarSlots] = useState<number | null>(null);
  const [motorbikeSlots, setMotorbikeSlots] = useState<number | null>(null);
  /** Hoá đơn vừa tạo — có giá trị là modal đang ở màn "chuyển khoản". */
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);

  // Chỉ gói bán được (có khoản phải trả) mới hiện ra — gói 0đ là tuyến hoa hồng mặc định.
  const purchasable = (plans.data ?? []).filter((p) => Number(p.basePriceMonthly) > 0);
  const selected: TenantPlan | undefined = purchasable.find((p) => p.id === planId);
  /*
   * Ba giá trị dẫn xuất dưới đây KHÔNG bọc `useMemo`, có chủ đích.
   *
   * `selected` đến từ `purchasable.find(...)` trên một mảng `.filter()` dựng mới mỗi lần render,
   * nên React Compiler không chứng minh được nó ổn định và **bỏ tối ưu cả component** (lỗi
   * `react-hooks/preserve-manual-memoization`). Ba phép tính này là một lần parse JSON và hai
   * phép `Math.max` — bỏ memo tay để trình biên dịch tự lo lại rẻ hơn giữ memo tay rồi mất
   * tối ưu ở mọi thứ còn lại.
   *
   * Điều kiện an toàn: không dependency array nào đọc chúng, và không component con nào được
   * memo theo `slots` — đổi identity mỗi render ở đây không kéo theo render thừa.
   */
  const limits: PlanLimitsJson | null = selected ? parsePlanLimits(selected.limits) : null;

  function selectPlan(id: string) {
    setPlanId(id);
    const plan = purchasable.find((p) => p.id === id);
    const planLimits = plan ? parsePlanLimits(plan.limits) : null;
    setCarSlots(planLimits?.includedCars ?? 0);
    setMotorbikeSlots(planLimits?.includedMotorbikes ?? 0);
  }

  /** Không dưới mức gồm sẵn — cùng luật backend nâng lên. */
  const slots = {
    car: Math.max(carSlots ?? 0, limits?.includedCars ?? 0),
    motorbike: Math.max(motorbikeSlots ?? 0, limits?.includedMotorbikes ?? 0),
  };

  const total =
    selected && limits
      ? subscriptionTermTotalPreview(selected.basePriceMonthly, limits, slots, termMonths)
      : null;

  const termOptions = SUBSCRIPTION_TERM_MONTHS.map((months) => {
    const discount = limits ? termDiscountPercent(limits, months) : 0;
    return {
      value: months,
      label:
        discount > 0
          ? t('purchase.termOptionDiscount', { months, percent: discount })
          : t('purchase.termOption', { months }),
    };
  });

  function submit() {
    if (!planId) return;
    purchase.mutate(
      { planId, termMonths, slots },
      {
        onSuccess: (created) => setInvoice(created),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  function close() {
    setInvoice(null);
    setPlanId(null);
    onClose();
  }

  return (
    <ResponsiveDialog
      title={invoice ? t('payment.title') : t('purchase.title')}
      open={open}
      onClose={close}
      footer={null}
    >
      {invoice ? (
        <div className={styles.payment}>
          <Alert type="info" showIcon message={t('payment.intro')} />
          <dl className={styles.paymentFields}>
            <div className={styles.paymentRow}>
              <dt>{t('payment.amount')}</dt>
              <dd>
                <b>{fmt.money(invoice.totalAmount)}</b>{' '}
                <CopyButton value={invoice.totalAmount} label={t('payment.copyAmount')} />
              </dd>
            </div>
            <div className={styles.paymentRow}>
              <dt>{t('payment.code')}</dt>
              <dd>
                <b className={styles.code}>{invoice.code}</b>{' '}
                <CopyButton value={invoice.code} label={t('payment.copyCode')} />
              </dd>
            </div>
          </dl>
          {invoice.expiresAt ? (
            <div className={styles.expires}>
              {t('payment.expires', { date: fmt.dateTime(invoice.expiresAt) })}
            </div>
          ) : null}
          <div className={styles.actions}>
            <Button type="primary" onClick={close}>
              {t('payment.done')}
            </Button>
          </div>
        </div>
      ) : plans.isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : plans.isError ? (
        <div className={styles.empty}>
          {t('purchase.loadError')}{' '}
          <Button size="small" type="link" onClick={() => void plans.refetch()}>
            {tCommon('actions.retry')}
          </Button>
        </div>
      ) : purchasable.length === 0 ? (
        <div className={styles.empty}>{t('purchase.empty')}</div>
      ) : (
        <>
          <Select
            className={styles.planSelect}
            size="large"
            placeholder={t('purchase.planLabel')}
            value={planId}
            options={purchasable.map((p) => ({
              value: p.id,
              label: t('purchase.planOption', {
                name: p.name,
                price: fmt.money(p.basePriceMonthly),
              }),
            }))}
            onChange={selectPlan}
          />

          {selected && limits ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>{t('purchase.term')}</span>
                <Select<SubscriptionTermMonths>
                  value={termMonths}
                  options={termOptions}
                  onChange={setTermMonths}
                />
              </label>
              <label className={styles.field}>
                <span>{t('purchase.carSlots')}</span>
                <InputNumber
                  min={limits.includedCars}
                  max={limits.maxCars ?? undefined}
                  value={slots.car}
                  onChange={(value) => setCarSlots(value)}
                />
              </label>
              <label className={styles.field}>
                <span>{t('purchase.motorbikeSlots')}</span>
                <InputNumber
                  min={limits.includedMotorbikes}
                  max={limits.maxMotorbikes ?? undefined}
                  value={slots.motorbike}
                  onChange={(value) => setMotorbikeSlots(value)}
                />
              </label>
              <div className={styles.hint}>
                {t('purchase.includedHint', {
                  car: limits.includedCars,
                  motorbike: limits.includedMotorbikes,
                })}
              </div>
              <div className={styles.total}>
                {total != null
                  ? t('purchase.total', { amount: fmt.money(String(total)) })
                  : t('purchase.unavailable')}
              </div>
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button onClick={close}>{tCommon('actions.close')}</Button>
            <Button
              type="primary"
              loading={purchase.isPending}
              disabled={!selected || total == null}
              onClick={submit}
            >
              {t('purchase.submit')}
            </Button>
          </div>
        </>
      )}
    </ResponsiveDialog>
  );
}
