'use client';

import { App, Button, InputNumber, Select, Spin, Tag } from 'antd';
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
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePurchaseSubscription, useTenantPlans } from '../hooks/use-subscription';
import type { SubscriptionInvoice, TenantPlan } from '../types';
import styles from './PurchaseModal.module.css';

/**
 * Mua / gia hạn gói: chọn số chỗ + KỲ HẠN → sinh HOÁ ĐƠN kèm mã đối soát. Gói chỉ kích hoạt
 * khi tiền về (ADR 0026 điều 4), nên modal chuyển sang màn "chuyển khoản" ngay khi hoá đơn tạo
 * xong để mã không bị bỏ lỡ.
 *
 * ## Ba LỰA CHỌN MUA, một hàng `plans`
 *
 * Tuyến gói bán một SKU (`per-vehicle`) theo ba kỳ hạn 3/6/12 tháng. Người dùng phải thấy BA
 * lựa chọn có giá thật, cạnh nhau — nên kỳ hạn là ba THẺ, mỗi thẻ hiện tổng cả kỳ của đúng số
 * chỗ họ đang chọn, chứ không phải một `<Select>` nơi giá chỉ hiện sau khi đã chọn.
 *
 * Vì sao không nhân bản thành ba hàng `plans`: ba kỳ hạn hiện được duyệt có CÙNG đơn giá chỗ,
 * CÙNG bộ cờ năng lực và 0% giảm — ba hàng khác nhau đúng một con số `months` là ba chỗ để giá
 * trôi khỏi nhau. Xem docblock `PLANS` ở `prisma/src/seed/system.ts`.
 *
 * Bộ chọn GÓI chỉ hiện khi danh mục có từ hai bậc trở lên. Một `<Select>` một lựa chọn không
 * phải là lựa chọn — nó là một bước bấm thừa đứng chắn trước thứ người dùng thật sự phải quyết
 * định (bao nhiêu chỗ, cam kết mấy tháng).
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
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths | null>(null);
  const [carSlots, setCarSlots] = useState<number | null>(null);
  const [motorbikeSlots, setMotorbikeSlots] = useState<number | null>(null);
  /** Hoá đơn vừa tạo — có giá trị là modal đang ở màn "chuyển khoản". */
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);

  /*
   * Lọc theo CHẾ ĐỘ THU PHÍ — PHÒNG THỦ TẦNG HAI, không phải luật.
   *
   * `listPlansForTenant` đã lọc `billingMode = package` ở SERVER (15/09/2026), nên bậc tuyến hoa
   * hồng không bao giờ tới được đây. Giữ bộ lọc để một backend cũ hơn — hoặc một cache còn nóng
   * sau khi deploy — không đẩy tuyến mặc định vào màn mua, nơi `purchase()` sẽ từ chối nó với
   * "không có khoản phải trả" mà người dùng không hiểu vì sao lựa chọn đó lại hiện ra.
   *
   * Bản cũ lọc `basePriceMonthly > 0` vì mọi gói bán được đều có phí nền. ADR 0029 gỡ phí nền
   * (gói pilot 100k/chỗ có nền 0đ, tiền nằm hết ở chỗ xe), nên vị từ đó loại đúng gói đang bán
   * — không ai mua được gì.
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
    /*
     * Kỳ đang chọn có thể không được bậc gói MỚI bán — bỏ chọn thay vì giữ một lựa chọn mà
     * server sẽ từ chối (`purchase()` kiểm `limits.terms`). `null` = chưa chọn kỳ nào, và nút
     * tạo hoá đơn khoá cho tới khi người dùng bấm một thẻ: mặc định sẵn một kỳ hạn nghĩa là có
     * người trả trước 12 tháng vì đó là thứ đang sáng lên, không vì họ chọn nó.
     */
    setTermMonths(null);
  }

  /*
   * Danh mục một bậc thì tự chọn luôn — không bày ra một `<Select>` một lựa chọn.
   *
   * Chạy trong render (không `useEffect`): `purchasable` dựng lại mỗi lần render, nên một
   * effect phụ thuộc nó sẽ chạy lại vô ích mỗi vòng. Điều kiện `!planId` làm phép gán này
   * idempotent, và `setState` trong render với giá trị khác là khuôn React hỗ trợ chính thức
   * (derived state) — nó render lại ngay, không đợi một frame.
   */
  if (!planId && purchasable.length === 1 && purchasable[0]) {
    selectPlan(purchasable[0].id);
  }

  /** Không dưới mức gồm sẵn — cùng luật backend nâng lên. */
  const slots = {
    car: Math.max(carSlots ?? 0, limits?.includedCars ?? 0),
    motorbike: Math.max(motorbikeSlots ?? 0, limits?.includedMotorbikes ?? 0),
  };

  const total =
    selected && limits && termMonths != null
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

  /*
   * Mỗi kỳ hạn là một LỰA CHỌN MUA đầy đủ: tổng cả kỳ của đúng số chỗ đang chọn, cộng giá quy
   * về tháng để so sánh được giữa ba thẻ. Tính ở đây thay vì trong thẻ để cả ba dùng chung một
   * phép tính với `total` của lựa chọn đang chọn — hai phép tính là hai cơ hội lệch nhau.
   */
  const termChoices = allowedTerms.map((months) => {
    const amount =
      selected && limits
        ? subscriptionTermTotalPreview(selected.basePriceMonthly, limits, slots, months)
        : null;
    return {
      months,
      discountPercent: limits ? termDiscountPercent(limits, months) : 0,
      total: amount,
      perMonth: amount == null ? null : amount / months,
    };
  });

  /*
   * Giá quy về tháng chỉ có ích khi ba thẻ KHÁC nhau.
   *
   * Với danh mục hiện tại cả ba kỳ hạn đều `discountPercent = 0`, nên ba thẻ sẽ hiện ba con số
   * /tháng giống hệt nhau — một dòng chữ nhắc lại chính nó ba lần, đứng chắn trước con số thật sự
   * quyết định (tổng cả kỳ). Nó chỉ xuất hiện khi một kỳ hạn thật sự rẻ hơn theo tháng.
   */
  const perMonthValues = termChoices.map((c) => c.perMonth).filter((v): v is number => v != null);
  const showPerMonth =
    perMonthValues.length > 1 && new Set(perMonthValues.map((v) => Math.round(v))).size > 1;

  function submit() {
    if (!planId || termMonths == null) return;
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
    setTermMonths(null);
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
          {/* Một bậc gói thì không có gì để chọn — xem docblock đầu file. */}
          {purchasable.length > 1 ? (
            <Select
              className={styles.planSelect}
              size="large"
              placeholder={t('purchase.planLabel')}
              value={planId}
              options={purchasable.map((p) => ({ value: p.id, label: p.name }))}
              onChange={selectPlan}
            />
          ) : null}

          {selected && limits ? (
            <div className={styles.fields}>
              {/*
                Đơn giá chỗ đứng TRƯỚC ô nhập số chỗ: nó là thứ biến "3 ô tô" thành một con số
                tiền, và đặt nó sau ô nhập nghĩa là người dùng gõ một con số rồi mới biết nó đáng
                bao nhiêu. Bậc gói không bán một loại chỗ thì dòng đó vắng mặt, không hiện "0đ".
              */}
              <div className={styles.unitPrices}>
                {limits.perVehiclePrice.car ? (
                  <span>
                    {t('purchase.unitPriceCar', {
                      amount: fmt.money(limits.perVehiclePrice.car),
                    })}
                  </span>
                ) : null}
                {limits.perVehiclePrice.motorbike ? (
                  <span>
                    {t('purchase.unitPriceMotorbike', {
                      amount: fmt.money(limits.perVehiclePrice.motorbike),
                    })}
                  </span>
                ) : null}
              </div>

              <div className={styles.groupTitle}>{t('purchase.slotsTitle')}</div>
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
              {limits.includedCars > 0 || limits.includedMotorbikes > 0 ? (
                <div className={styles.hint}>
                  {t('purchase.includedHint', {
                    car: limits.includedCars,
                    motorbike: limits.includedMotorbikes,
                  })}
                </div>
              ) : null}

              {/*
                BA lựa chọn mua, cạnh nhau, mỗi lựa chọn kèm tổng THẬT của số chỗ đang chọn.
                `radiogroup` chứ không phải danh sách nút: người dùng bàn phím phải đi qua ba thẻ
                bằng phím mũi tên như một bộ chọn, và trình đọc màn hình phải đọc được "1 trong 3".
              */}
              <div className={styles.groupTitle}>{t('purchase.termsTitle')}</div>
              <div
                className={styles.terms}
                role="radiogroup"
                aria-label={t('purchase.termsTitle')}
              >
                {termChoices.map((choice) => (
                  <button
                    key={choice.months}
                    type="button"
                    role="radio"
                    aria-checked={termMonths === choice.months}
                    className={`${styles.termCard} ${
                      termMonths === choice.months ? styles.termCardActive : ''
                    }`}
                    onClick={() => setTermMonths(choice.months)}
                  >
                    <span className={styles.termMonths}>
                      {t('purchase.termOption', { months: choice.months })}
                    </span>
                    <span className={styles.termTotal}>
                      {choice.total == null
                        ? tCommon('labels.emptyValue')
                        : t('purchase.termTotal', {
                            amount: fmt.money(String(choice.total)),
                          })}
                    </span>
                    {showPerMonth && choice.perMonth != null ? (
                      <span className={styles.termPerMonth}>
                        {t('purchase.termPerMonth', {
                          amount: fmt.money(String(Math.round(choice.perMonth))),
                        })}
                      </span>
                    ) : null}
                    {choice.discountPercent > 0 ? (
                      <Tag color="green" className={styles.termDiscount}>
                        {t('purchase.termDiscount', { percent: choice.discountPercent })}
                      </Tag>
                    ) : null}
                  </button>
                ))}
              </div>

              <div className={styles.total}>
                {total == null
                  ? t('purchase.unavailable')
                  : termMonths == null
                    ? t('purchase.pickTerm')
                    : t('purchase.total', { amount: fmt.money(String(total)) })}
              </div>
            </div>
          ) : null}

          {/*
            Đây là lần duy nhất gian hàng trả tiền cho XePrime, và quy chế sàn là văn bản quy
            định phí dịch vụ với thứ tự hiển thị mà họ đang mua. Cổng quản lý không có chân
            trang marketplace nên nếu không đặt ở đây thì không có đường nào khác.
          */}
          <LegalConsentNote place="subscription" className={styles.consent} />

          <div className={styles.actions}>
            <Button onClick={close}>{tCommon('actions.close')}</Button>
            <Button
              type="primary"
              loading={purchase.isPending}
              disabled={!selected || termMonths == null || total == null}
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
