import { useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BILLING_MODE,
  SUBSCRIPTION_TERM_MONTHS,
  parsePlanLimits,
  subscriptionTermTotalPreview,
  termDiscountPercent,
  type PlanLimitsJson,
  type SubscriptionTermMonths,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { NumberField } from '@/components/ui/NumberField';
import { SelectControl } from '@/components/ui/SelectControl';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { SubscriptionInvoice, TenantPlan } from '@/api/subscription/api';
import { usePurchaseSubscription, useTenantPlans } from '../hooks/use-subscription';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';

/**
 * Mua / gia hạn gói (W2, ADR 0015): chọn gói + kỳ hạn + số chỗ → sinh HOÁ ĐƠN kèm mã đối soát.
 *
 * Gói chỉ kích hoạt khi tiền về (ADR 0026 điều 4) — tấm này chuyển sang bước "chuyển khoản" NGAY
 * khi hoá đơn tạo xong để mã không bị bỏ lỡ.
 */
export function PurchaseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const plans = useTenantPlans(open);
  const purchase = usePurchaseSubscription();

  const [planId, setPlanId] = useState<string | null>(null);
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(1);
  /*
   * Hai ô SỐ CHỖ đi qua react-hook-form vì `NumberField` của app gắn với nó (nó lo kẹp
   * min/max lúc rời ô). Gói và kỳ hạn vẫn ở state màn: chúng quyết định cả danh sách kỳ được
   * bán lẫn giá, tức là chúng lái form chứ không phải một trường của form.
   */
  const slotForm = useForm<{ car: number; motorbike: number }>({
    defaultValues: { car: 0, motorbike: 0 },
  });
  const carSlots = useWatch({ control: slotForm.control, name: 'car' });
  const motorbikeSlots = useWatch({ control: slotForm.control, name: 'motorbike' });
  /** Hoá đơn vừa tạo — có giá trị là tấm đang ở bước "chuyển khoản". */
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);

  /*
   * Lọc theo CHẾ ĐỘ THU PHÍ, không theo phí nền.
   *
   * ADR 0029 gỡ phí nền (gói pilot 100k/chỗ có nền 0đ, tiền nằm hết ở chỗ xe), nên lọc theo
   * `basePriceMonthly > 0` sẽ loại đúng gói đang bán — không ai mua được gì. `billingMode` mới là
   * thứ phân biệt thật: `package` là gói trả tiền, `commission` là tuyến mặc định không đi qua
   * hoá đơn.
   */
  const purchasable = (plans.data ?? []).filter((p) => p.billingMode === BILLING_MODE.PACKAGE);
  const selected: TenantPlan | undefined = purchasable.find((p) => p.id === planId);
  const limits: PlanLimitsJson | null = selected ? parsePlanLimits(selected.limits) : null;

  function selectPlan(id: string) {
    setPlanId(id);
    const plan = purchasable.find((p) => p.id === id);
    const planLimits = plan ? parsePlanLimits(plan.limits) : null;
    slotForm.setValue('car', planLimits?.includedCars ?? 0);
    slotForm.setValue('motorbike', planLimits?.includedMotorbikes ?? 0);
    /*
     * Kỳ đang chọn có thể không được gói mới bán (vd 1 tháng với gói pilot) — nhảy về kỳ nhỏ
     * nhất được bán thay vì giữ một lựa chọn mà server sẽ từ chối.
     */
    const planTerms = planLimits?.terms.map((term) => term.months) ?? [];
    setTermMonths((current) => {
      if (planTerms.length === 0 || planTerms.includes(current)) return current;
      return SUBSCRIPTION_TERM_MONTHS.find((m) => planTerms.includes(m)) ?? current;
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
   * Kỳ hạn lấy từ `limits.terms` của GÓI (ADR 0029: đó là danh sách kỳ được BÁN, không chỉ là
   * bảng giảm giá) — gói pilot bán tối thiểu 3 tháng thì lựa chọn 1 tháng không được hiện ra.
   * Gói cũ chưa khai `terms` → rơi về bộ kỳ hạn toàn cục. Server vẫn là lớp chặn thật.
   */
  const allowedTerms: readonly SubscriptionTermMonths[] = limits?.terms.length
    ? SUBSCRIPTION_TERM_MONTHS.filter((m) => limits.terms.some((term) => term.months === m))
    : SUBSCRIPTION_TERM_MONTHS;

  const termOptions = allowedTerms.map((months) => {
    const discount = limits ? termDiscountPercent(limits, months) : 0;
    return {
      value: String(months),
      label:
        discount > 0
          ? t('purchase.termOptionDiscount', { months, percent: discount })
          : t('purchase.termOption', { months }),
    };
  });

  const planOptions = purchasable.map((plan) => ({
    value: plan.id,
    label: t('purchase.planOption', { name: plan.name, price: fmt.money(plan.basePriceMonthly) }),
  }));

  function submit() {
    if (!planId) return;
    purchase.mutate(
      { planId, termMonths, slots },
      {
        onSuccess: (created) => setInvoice(created),
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  }

  function close() {
    setInvoice(null);
    setPlanId(null);
    slotForm.reset({ car: 0, motorbike: 0 });
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={invoice ? t('payment.title') : t('purchase.title')}
    >
      {invoice ? (
        <YStack gap={space.md}>
          {/*
            Hướng dẫn chuyển khoản dùng CHUNG với màn "Gói của tôi" — đóng tấm rồi vẫn tìm lại
            được cùng một QR ở đó.
          */}
          <InvoicePaymentPanel invoice={invoice} />
          <Button label={t('payment.done')} onPress={close} />
        </YStack>
      ) : plans.isLoading ? (
        <MiniRowsSkeleton rows={4} />
      ) : plans.isError ? (
        <YStack gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('purchase.loadError')}
          </Text>
          <Button
            label={tCommon('retry')}
            variant="secondary"
            size="sm"
            onPress={() => void plans.refetch()}
          />
        </YStack>
      ) : purchasable.length === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('purchase.empty')}
        </Text>
      ) : (
        <YStack gap={space.md}>
          <SelectControl
            label={t('purchase.planLabel')}
            value={planId}
            options={planOptions}
            onChange={selectPlan}
          />

          {selected && limits ? (
            <>
              <SelectControl
                label={t('purchase.term')}
                value={String(termMonths)}
                options={termOptions}
                onChange={(next) => setTermMonths(Number(next) as SubscriptionTermMonths)}
              />
              <NumberField
                control={slotForm.control}
                name="car"
                label={t('purchase.carSlots')}
                min={limits.includedCars}
                precision={0}
                {...(limits.maxCars == null ? {} : { max: limits.maxCars })}
              />
              <NumberField
                control={slotForm.control}
                name="motorbike"
                label={t('purchase.motorbikeSlots')}
                min={limits.includedMotorbikes}
                precision={0}
                {...(limits.maxMotorbikes == null ? {} : { max: limits.maxMotorbikes })}
              />

              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('purchase.includedHint', {
                  car: limits.includedCars,
                  motorbike: limits.includedMotorbikes,
                })}
              </Text>

              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                {total != null
                  ? t('purchase.total', { amount: fmt.money(String(total)) })
                  : t('purchase.unavailable')}
              </Text>
            </>
          ) : null}

          {/*
            Đây là lần DUY NHẤT gian hàng trả tiền cho XePrime, và quy chế sàn là văn bản quy định
            phí dịch vụ với thứ tự hiển thị mà họ đang mua. Khu quản lý không có chân trang chợ xe
            nên nếu không đặt ở đây thì không có đường nào khác.
          */}
          <LegalConsentNote place="subscription" />

          <YStack gap={space.sm}>
            <Button
              label={t('purchase.submit')}
              loading={purchase.isPending}
              disabled={!selected || total == null}
              onPress={submit}
            />
            <Button
              label={tCommon('close')}
              variant="ghost"
              disabled={purchase.isPending}
              onPress={close}
            />
          </YStack>
        </YStack>
      )}
    </BottomSheet>
  );
}
