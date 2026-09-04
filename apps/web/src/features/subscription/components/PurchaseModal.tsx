'use client';

import { App, Button, InputNumber, Select, Spin } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BILLING_MODE,
  SUBSCRIPTION_TERM_MONTHS,
  parsePlanLimits,
  subscriptionTermTotalPreview,
  termDiscountPercent,
  type PlanLimitsJson,
  type SubscriptionTermMonths,
} from '@xeprime/types';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
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

  /*
   * Lọc theo CHẾ ĐỘ THU PHÍ, không theo phí nền.
   *
   * Bản cũ lọc `basePriceMonthly > 0` vì mọi gói bán được đều có phí nền. ADR 0029 gỡ phí nền
   * (gói pilot 100k/chỗ có nền 0đ, tiền nằm hết ở chỗ xe), nên vị từ đó loại đúng gói đang bán
   * — không ai mua được gì. `billingMode` mới là thứ phân biệt thật: `package` là gói trả tiền,
   * `commission` là tuyến mặc định không đi qua hoá đơn.
   */
  const purchasable = (plans.data ?? []).filter((p) => p.billingMode === BILLING_MODE.PACKAGE);
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
    // Kỳ đang chọn có thể không được gói mới bán (vd 1 tháng với gói pilot) — nhảy về kỳ
    // nhỏ nhất được bán thay vì giữ một lựa chọn mà server sẽ từ chối.
    const planTerms = planLimits?.terms.map((t) => t.months) ?? [];
    setTermMonths((current) => {
      if (planTerms.length === 0 || planTerms.includes(current)) return current;
      const smallest = SUBSCRIPTION_TERM_MONTHS.find((m) => planTerms.includes(m));
      return smallest ?? current;
    });
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

  /*
   * Kỳ hạn lấy từ `limits.terms` của GÓI (ADR 0029: đó là danh sách kỳ được bán, không chỉ là
   * bảng giảm giá) — gói pilot bán tối thiểu 3 tháng thì lựa chọn 1 tháng không được hiện ra.
   * Plan cũ chưa khai terms → rơi về bộ kỳ hạn toàn cục. Server vẫn là lớp chặn thật.
   */
  const allowedTerms: readonly SubscriptionTermMonths[] = limits?.terms.length
    ? SUBSCRIPTION_TERM_MONTHS.filter((m) => limits.terms.some((t) => t.months === m))
    : SUBSCRIPTION_TERM_MONTHS;

  const termOptions = allowedTerms.map((months) => {
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
          {/* R2: hướng dẫn chuyển khoản (kèm VietQR khi đã cấu hình) dùng CHUNG với trang
              "Gói của tôi" — đóng modal rồi vẫn tìm lại được cùng một QR ở đó. */}
          <InvoicePaymentPanel invoice={invoice} />
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
