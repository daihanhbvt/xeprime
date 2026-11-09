'use client';

import {
  ArrowLeftOutlined,
  BankOutlined,
  CheckCircleFilled,
  CheckOutlined,
  PhoneOutlined,
  QrcodeOutlined,
} from '@ant-design/icons';
import { Alert, App, Button, Skeleton } from 'antd';
import Image from 'next/image';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';

import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import { DialogHeading } from '@/components/overlay/DialogHeading';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { shopPaymentPath } from '@/constants/routes';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';

import {
  useCreateSubscriptionCheckout,
  usePendingInvoices,
  usePurchasePreview,
  usePurchaseSubscription,
  useTenantPlans,
} from '../hooks/use-subscription';
import {
  defaultTierFor,
  useCombinedPlanPurchase,
  type CombinedPlanLane,
  type CombinedPlanPurchaseState,
  type CombinedPlanSelection,
} from '../plan-combined-purchase';
import {
  laneVehicleType,
  pendingInvoiceForScope,
  quotaForLane,
  type PlanLaneScope,
} from '../plan-lanes';
import { enterpriseTierOf, type PlanTier } from '../plan-purchase';
import type { MySubscription, SubscriptionPurchasePreviewItem } from '../types';
import { usePurchaseErrorMessage } from '../use-plan-quota-gate-message';
import { CONTACT_SALES_HREF } from './PlanPricingTable';
import {
  PurchaseKindTag,
  PurchaseOutcomeHint,
  PurchaseOverCapAlert,
  usePurchasePeriodText,
} from './PurchaseOutcome';
import { daysLeftOf } from './ShopPlanLaneCard';
import styles from './PlanPurchaseDialog.module.css';

/** Huy hiệu bậc theo THỨ TỰ trong làn (design: bạc · vàng · đen) - chỉ là hình, không mang nghĩa giá. */
const TIER_BADGES = [
  '/shops/plans/tier-1.png',
  '/shops/plans/tier-2.png',
  '/shops/plans/tier-3.png',
];

/**
 * Nhãn bậc theo VỊ TRÍ trong làn (design: TIẾT KIỆM · CƠ BẢN · NÂNG CAO + "Phù hợp cho …") - cùng
 * luật với biểu tượng bậc (`planTierIcon`). Bậc thứ tư trở đi (admin mở thêm) dùng tên + mô tả admin.
 */
const TIER_RANK_KEYS = ['economy', 'basic', 'advanced'] as const;

/**
 * "Mua hoặc gia hạn gói" - design `24024:26537` (06/11/2026): cả hai loại xe trong MỘT hộp, MỘT kỳ hạn
 * và MỘT thời điểm áp dụng cho cả lượt.
 *
 * Chọn một gói ⇒ một hoá đơn (`POST /subscription/purchase`); chọn hai ⇒ một PHIẾU THANH TOÁN GỘP
 * với một mã QR (`POST /subscription/checkouts`, ADR 0083). Tạo xong là sang thẳng trang thanh toán
 * trong khung gian hàng. Gói chỉ bật khi tiền về (ADR 0026 điều 4).
 *
 * Chữ theo design, SỐ theo admin: tên bậc là nhãn theo vị trí, còn giá, trần xe ("Tối đa 5 ô tô"),
 * cờ "Gói đề xuất", tính năng và kỳ bán đọc từ `plans.limits` - không gán cứng 5 xe / 10 xe. Dòng
 * tính năng là tính năng THẬT của bậc (mọi bậc mở cùng bộ), không chép "báo cáo ngắn gọn / chi tiết"
 * của design. Bậc doanh nghiệp bán bằng tư vấn (ADR 0041 điều 5): chỉ có "Liên hệ tư vấn".
 *
 * HAI BƯỚC (người dùng 09/11/2026): (1) chọn gói từng loại xe - được chọn cùng lúc ô tô + xe máy;
 * (2) kỳ hạn chung + XÁC NHẬN từng gói từ bản xem trước của server. Không có lựa chọn "thời điểm áp
 * dụng" (ADR 0084): cùng bậc = gia hạn nối tiếp, trần cao hơn = nâng ngay (kỳ cũ kết thúc, không
 * bù), còn lại = nối tiếp - server suy, hộp chỉ nói trước.
 *
 * Nơi gọi KHÔNG dựng hộp này khi thiếu `subscription.purchase`.
 */
type DialogStep = 'plans' | 'confirm';
const DIALOG_STEPS: readonly DialogStep[] = ['plans', 'confirm'];

export function PlanPurchaseDialog({
  open,
  data,
  initialScope,
  onClose,
}: {
  open: boolean;
  data: MySubscription;
  /** Làn mở hộp (nút "Gia hạn" / "Nâng cấp ngay" của một thẻ) - chọn sẵn bậc của làn đó. */
  initialScope: PlanLaneScope | null;
  onClose: () => void;
}) {
  const t = useTranslations('Subscription.combined');
  const tCommon = useTranslations('Common');
  const tPurchase = useTranslations('Subscription.purchase');
  const errorMessage = usePurchaseErrorMessage();
  const { message } = App.useApp();
  const router = useRouter();

  const plans = useTenantPlans(open);
  const pending = usePendingInvoices(open);
  const purchase = usePurchaseSubscription();
  const checkout = useCreateSubscriptionCheckout();
  const state = useCombinedPlanPurchase(plans.data ?? [], data.currentPlans);
  const enterprise = enterpriseTierOf(plans.data ?? []);
  const [step, setStep] = useState<DialogStep>('plans');
  const preview = usePurchasePreview(
    state.selections.map((item) => item.body),
    open && step === 'confirm',
  );
  /*
   * Chỉ tạo hoá đơn trên bản xem trước khớp ĐÚNG lựa chọn đang có: vừa đổi kỳ hạn thì
   * `placeholderData` còn giữ bản của kỳ cũ - bấm lúc đó là xác nhận một con số không phải thứ sẽ mua.
   */
  const previewReady = preview.isSuccess && !preview.isPlaceholderData;
  const submitting = purchase.isPending || checkout.isPending;

  /*
   * Mở từ một thẻ làn ⇒ chọn sẵn bậc của làn đó MỘT lần mỗi lượt mở (bậc đang dùng để gia hạn,
   * không thì bậc đề xuất). Đóng hộp là dọn lựa chọn: hộp không bị tháo khỏi cây, nên không có lần
   * remount nào dọn hộ - thiếu dòng đó thì mở lại là một cú bấm tới hoá đơn thứ hai.
   */
  const seeded = useRef(false);
  const laneToSeed = state.lanes.find((lane) => lane.scope === initialScope);
  useEffect(() => {
    if (!open) {
      seeded.current = false;
      return;
    }
    if (seeded.current || !laneToSeed) return;
    seeded.current = true;
    const tier = defaultTierFor(laneToSeed);
    if (tier && !laneToSeed.selected) state.select(laneToSeed.scope, tier.plan.id);
  }, [open, laneToSeed, state]);

  function close() {
    state.reset();
    setStep('plans');
    onClose();
  }

  function submit() {
    // Enter vẫn gửi khi nút đang quay - không tạo hoá đơn thứ hai trong lúc lượt đầu đang bay.
    if (submitting || !previewReady || state.selections.length === 0) return;
    const onError = (err: unknown) => message.error(errorMessage(err));
    if (state.selections.length === 1) {
      purchase.mutate(state.selections[0]!.body, {
        onSuccess: (invoice) => {
          close();
          router.push(shopPaymentPath.invoice(invoice.id));
        },
        onError,
      });
      return;
    }
    checkout.mutate(
      { items: state.selections.map((item) => item.body) },
      {
        onSuccess: (created) => {
          close();
          router.push(shopPaymentPath.checkout(created.id));
        },
        onError,
      },
    );
  }

  /** Hoá đơn còn chờ ở loại xe đang chọn - tạo hoá đơn mới sẽ huỷ nó (server void `issued` cũ). */
  const replaced = state.selections
    .map((item) => pendingInvoiceForScope(pending.data ?? [], item.scope))
    .filter((invoice): invoice is NonNullable<typeof invoice> => invoice !== null);
  const replacedCodes = [...new Set(replaced.map((inv) => inv.checkoutCode ?? inv.code))];

  const ready = Boolean(plans.data) && state.lanes.length > 0;

  return (
    <ResponsiveDialog
      open={open}
      // Khung design 1430 (ba thẻ 450) - rộng hơn `xl` 1180, nên hộp ôm bề rộng tự đặt ở `.dialogBody`.
      size="fit"
      bodyClassName={styles.dialogBody}
      title={<DialogHeading title={t('title')} hint={t('subtitle')} />}
      ariaLabel={t('title')}
      onClose={close}
      footer={
        !ready ? null : step === 'plans' ? (
          <PlansFooter
            state={state}
            onCancel={close}
            onNext={() => {
              if (state.selections.length > 0) setStep('confirm');
            }}
          />
        ) : (
          <ConfirmFooter
            total={previewReady ? preview.data!.total : state.total}
            submitting={submitting}
            canSubmit={previewReady}
            onBack={() => setStep('plans')}
            onSubmit={submit}
          />
        )
      }
    >
      {plans.isLoading ? (
        <Skeleton active paragraph={{ rows: 8 }} />
      ) : plans.isError ? (
        <Alert
          type="error"
          showIcon
          title={tPurchase('loadError')}
          action={
            <Button size="small" onClick={() => void plans.refetch()}>
              {tCommon('actions.retry')}
            </Button>
          }
        />
      ) : state.lanes.length === 0 ? (
        <Alert type="info" showIcon title={tPurchase('empty')} />
      ) : (
        <div className={styles.body}>
          <Stepper step={step} />
          {step === 'plans' ? (
            <>
              {state.lanes.length > 1 ? (
                <p className={styles.stepHint}>{t('stepPlansHint')}</p>
              ) : null}
              {state.lanes.map((lane) => (
                <LaneBlock key={lane.scope} lane={lane} data={data} state={state} />
              ))}
              {/* Cuối bước chọn gói: đặt giữa các làn, nó đọc như một lựa chọn thứ ba bắt buộc. */}
              {enterprise ? <EnterpriseOffer tier={enterprise} /> : null}
            </>
          ) : (
            <ConfirmStep
              state={state}
              data={data}
              preview={preview}
              replacedCodes={replacedCodes}
            />
          )}
        </div>
      )}
    </ResponsiveDialog>
  );
}

/** Hai bước của hộp - số tròn vàng nối bằng một vạch; bước đã qua mang dấu tích. */
function Stepper({ step }: { step: DialogStep }) {
  const t = useTranslations('Subscription.combined');
  const current = DIALOG_STEPS.indexOf(step);
  return (
    <ol className={styles.stepper} aria-label={t('stepsLabel')}>
      {DIALOG_STEPS.map((key, index) => (
        <li
          key={key}
          className={cx(
            styles.stepItem,
            index === current && styles.stepActive,
            index < current && styles.stepDone,
          )}
          aria-current={index === current ? 'step' : undefined}
        >
          <span className={styles.stepNumber} aria-hidden="true">
            {index < current ? <CheckOutlined /> : index + 1}
          </span>
          <span className={styles.stepLabel}>{t(`steps.${key}`)}</span>
        </li>
      ))}
    </ol>
  );
}

/**
 * Bước 2 - kỳ hạn chung + xác nhận từng gói. Mỗi thẻ đọc bản xem trước của SERVER (ADR 0084): gia
 * hạn / nâng ngay / đổi từ kỳ sau, kỳ dự kiến, và các kỳ sẽ kết thúc - thứ client không tự suy được
 * vì nó không thấy kỳ đã xếp lịch.
 */
function ConfirmStep({
  state,
  data,
  preview,
  replacedCodes,
}: {
  state: CombinedPlanPurchaseState;
  data: MySubscription;
  preview: ReturnType<typeof usePurchasePreview>;
  replacedCodes: readonly string[];
}) {
  const t = useTranslations('Subscription.combined');
  const tCommon = useTranslations('Common');
  const tPurchase = useTranslations('Subscription.purchase');
  /*
   * MỘT gói (đa số lượt mua - người dùng 09/11/2026): kỳ hạn thành danh sách bên trái, mỗi dòng mang
   * TỔNG TIỀN của kỳ đó (giá tuyệt đối admin đặt - ADR 0041 điều 2), phiếu gói bên phải. Hai gói:
   * kỳ hạn chung là một hàng nút trên, hai phiếu ngang hàng dưới - tổng theo kỳ của hai gói không
   * gói vào một dòng được.
   */
  const single = state.selections.length === 1 ? state.selections[0]! : null;

  const cards = preview.isError ? (
    <Alert
      type="error"
      showIcon
      title={t('previewError')}
      action={
        <Button size="small" onClick={() => void preview.refetch()}>
          {tCommon('actions.retry')}
        </Button>
      }
    />
  ) : (
    <div
      className={cx(
        styles.confirmGrid,
        !single && styles.confirmGridPair,
        preview.isPlaceholderData && styles.stale,
      )}
      aria-busy={preview.isFetching}
    >
      {state.selections.map((selection) => (
        <PlanConfirmCard
          key={selection.scope}
          selection={selection}
          item={preview.data?.items.find((item) => item.planId === selection.body.planId)}
          usedVehicles={quotaForLane(data.vehicleQuotas, selection.scope).used}
        />
      ))}
    </div>
  );

  const confirm = (
    <section className={styles.confirm} aria-labelledby="xp-plan-confirm-title">
      <div className={styles.optionHead}>
        <h3 id="xp-plan-confirm-title" className={styles.optionTitle}>
          {t('confirmTitle')}
        </h3>
        <p className={styles.optionHint}>{t('confirmHint')}</p>
      </div>
      {cards}
    </section>
  );

  return (
    <>
      {single ? (
        <div className={styles.confirmSplit}>
          <TermPicker state={state} single={single} />
          {confirm}
        </div>
      ) : (
        <>
          <TermPicker state={state} single={null} />
          {confirm}
        </>
      )}

      <p className={styles.paymentNote}>
        <QrcodeOutlined aria-hidden="true" />
        {t('paymentNote', { count: state.selections.length })}
      </p>
      {replacedCodes.length > 0 ? (
        <Alert
          type="warning"
          showIcon
          title={tPurchase('replacesPending', { code: replacedCodes.join(', ') })}
        />
      ) : null}
      {/*
        Đây là lần duy nhất gian hàng trả tiền cho XePrime, và quy chế sàn là văn bản quy định
        phí dịch vụ với thứ tự hiển thị mà họ đang mua.
      */}
      <LegalConsentNote place="subscription" className={styles.consent} />
    </>
  );
}

/**
 * "Kỳ hạn thanh toán" - chung cho mọi gói đã chọn.
 *
 *  - Một gói (`single`): danh sách dọc, mỗi dòng là kỳ + nhãn tiết kiệm + TỔNG TIỀN kỳ đó của gói.
 *    Tiền đọc từ `tier.terms` (giá tuyệt đối admin đặt); con số sẽ trả vẫn là của bản xem trước ở
 *    phiếu bên phải và ở chân hộp.
 *  - Hai gói: một hàng nút như design - tổng theo kỳ thuộc từng phiếu.
 */
function TermPicker({
  state,
  single,
}: {
  state: CombinedPlanPurchaseState;
  single: CombinedPlanSelection | null;
}) {
  const t = useTranslations('Subscription.combined');
  const tPurchase = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();

  return (
    <section className={styles.optionBox} aria-labelledby="xp-plan-term-title">
      <div className={styles.optionHead}>
        <h3 id="xp-plan-term-title" className={styles.optionTitle}>
          {t('termTitle')}
        </h3>
        {single ? null : <p className={styles.optionHint}>{t('termHint')}</p>}
      </div>
      <div
        className={single ? styles.termList : styles.choices}
        role="radiogroup"
        aria-labelledby="xp-plan-term-title"
      >
        {state.termOptions.map((option) => {
          const picked = state.termMonths === option.months;
          const saving =
            option.savingPercent > 0
              ? tPurchase('termSaving', { percent: option.savingPercent })
              : t('termBase');
          const total = single?.tier.terms.find((term) => term.months === option.months)?.total;
          return (
            <button
              key={option.months}
              type="button"
              role="radio"
              aria-checked={picked}
              className={cx(
                styles.choice,
                single ? styles.termRow : styles.choiceCenter,
                picked && styles.choicePicked,
              )}
              onClick={() => state.setTermMonths(option.months)}
            >
              {single ? <span className={styles.termRadio} aria-hidden="true" /> : null}
              <span className={styles.choiceTitle}>
                {t('termOption', { months: option.months })}
              </span>
              <span
                className={cx(
                  single ? styles.termSaving : styles.choiceHint,
                  option.savingPercent > 0 && styles.saving,
                )}
              >
                {saving}
              </span>
              {total ? <span className={styles.termTotal}>{fmt.money(total)}</span> : null}
            </button>
          );
        })}
      </div>
    </section>
  );
}

/** Thẻ xác nhận MỘT gói: loại lượt mua (ⓘ hệ quả), hạn mức, thời gian áp dụng, đơn giá, thành tiền. */
function PlanConfirmCard({
  selection,
  item,
  usedVehicles,
}: {
  selection: CombinedPlanSelection;
  item: SubscriptionPurchasePreviewItem | undefined;
  usedVehicles: number;
}) {
  const t = useTranslations('Subscription.combined');
  const tPurchase = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();
  const selectionLabel = useSelectionLabel();
  const periodText = usePurchasePeriodText();
  const Icon = VEHICLE_TYPE_ICON[laneVehicleType(selection.scope)];
  const cap = item ? item.maxVehicles : selection.tier.limits.maxVehicles;

  return (
    <article className={styles.confirmCard}>
      <header className={styles.laneHead}>
        <span className={styles.laneIcon} aria-hidden="true">
          <Icon />
        </span>
        <h4 className={styles.confirmTitle}>
          {t('confirmCardTitle', {
            scope: t(`scope.${selection.scope}`),
            tier: selectionLabel(selection),
          })}
        </h4>
        {item ? (
          <span className={styles.confirmKind}>
            <PurchaseKindTag kind={item.kind} />
            <PurchaseOutcomeHint item={item} />
          </span>
        ) : null}
      </header>
      {item ? (
        <>
          <dl className={styles.confirmRows}>
            <div className={styles.confirmRow}>
              <dt>{t('row.limit')}</dt>
              <dd>
                {cap == null
                  ? tPurchase('limitVehiclesUnlimited')
                  : t.rich(`limit.${selection.scope}`, {
                      count: cap,
                      b: (chunks) => <strong>{chunks}</strong>,
                    })}
              </dd>
            </div>
            <div className={styles.confirmRow}>
              <dt>{t('row.period')}</dt>
              <dd>{periodText(item)}</dd>
            </div>
            <div className={styles.confirmRow}>
              <dt>{t('row.price')}</dt>
              <dd>
                {t('priceLine', {
                  perMonth: fmt.money(selection.perMonth),
                  months: selection.body.termMonths,
                })}
              </dd>
            </div>
            <div className={cx(styles.confirmRow, styles.confirmAmount)}>
              <dt>{t('row.amount')}</dt>
              <dd>{fmt.money(item.amount)}</dd>
            </div>
          </dl>
          <PurchaseOverCapAlert item={item} usedVehicles={usedVehicles} />
        </>
      ) : (
        <Skeleton active title={false} paragraph={{ rows: 4 }} />
      )}
    </article>
  );
}

function LaneBlock({
  lane,
  data,
  state,
}: {
  lane: CombinedPlanLane;
  data: MySubscription;
  state: CombinedPlanPurchaseState;
}) {
  const t = useTranslations('Subscription.combined');
  const tLanes = useTranslations('Subscription.lanes');
  const tTerm = useTranslations('Subscription.term');
  const fmt = useAppFormat();
  const Icon = VEHICLE_TYPE_ICON[laneVehicleType(lane.scope)];
  const quota = quotaForLane(data.vehicleQuotas, lane.scope);

  return (
    <section className={styles.lane} aria-labelledby={`xp-plan-lane-dialog-${lane.scope}`}>
      <header className={styles.laneHead}>
        <span className={styles.laneIcon} aria-hidden="true">
          <Icon />
        </span>
        <div className={styles.laneText}>
          <h4 id={`xp-plan-lane-dialog-${lane.scope}`} className={styles.laneTitle}>
            {t(`scope.${lane.scope}`)}
            {quota.limit != null ? (
              <span className={styles.badge}>
                {t('inUse', { used: quota.used, limit: quota.limit })}
              </span>
            ) : null}
          </h4>
          <p className={styles.laneMeta}>
            {lane.current
              ? tLanes('endsOn', { date: fmt.date(lane.current.endsAt) })
              : t(`noPlan.${lane.scope}`)}
          </p>
        </div>
        {lane.current ? (
          <span className={styles.badge}>
            {tTerm('daysLeft', { days: daysLeftOf(lane.current.endsAt) })}
          </span>
        ) : null}
      </header>

      <div
        className={styles.tiers}
        role="radiogroup"
        aria-labelledby={`xp-plan-lane-dialog-${lane.scope}`}
      >
        {lane.tiers.map((tier, index) => (
          <TierCard
            key={tier.plan.id}
            tier={tier}
            rank={index}
            badge={TIER_BADGES[Math.min(index, TIER_BADGES.length - 1)]!}
            current={tier.plan.id === lane.current?.planId}
            selected={lane.selected?.plan.id === tier.plan.id}
            perMonth={state.perMonthOf(tier)}
            savingPercent={
              state.termMonths == null
                ? 0
                : (tier.terms.find((term) => term.months === state.termMonths)?.savingPercent ?? 0)
            }
            onSelect={() => state.select(lane.scope, tier.plan.id)}
          />
        ))}
      </div>
    </section>
  );
}

/** Tên + dòng "Phù hợp cho …" của một bậc theo vị trí - ngoài 3 vị trí của design thì dùng chữ admin. */
function useTierText() {
  const t = useTranslations('Subscription.combined');
  return (tier: PlanTier, rank: number): { name: string; audience: string | null } => {
    const key = TIER_RANK_KEYS[rank];
    return key
      ? { name: t(`tierRank.${key}.name`), audience: t(`tierRank.${key}.audience`) }
      : { name: tier.plan.name, audience: tier.plan.description ?? null };
  };
}

function TierCard({
  tier,
  rank,
  badge,
  current,
  selected,
  perMonth,
  savingPercent,
  onSelect,
}: {
  tier: PlanTier;
  rank: number;
  badge: string;
  current: boolean;
  selected: boolean;
  perMonth: string | null;
  savingPercent: number;
  onSelect: () => void;
}) {
  const t = useTranslations('Subscription.combined');
  const tPurchase = useTranslations('Subscription.purchase');
  const fmt = useAppFormat();
  const tierText = useTierText()(tier, rank);
  const recommended = tier.card.recommended;

  return (
    <article className={cx(styles.tier, selected && styles.tierSelected)}>
      {recommended ? <span className={styles.recommended}>{t('recommended')}</span> : null}
      <div className={styles.tierHead}>
        <Image src={badge} alt="" width={56} height={56} className={styles.tierBadge} />
        <div className={styles.tierText}>
          <h5 className={styles.tierName}>{tierText.name}</h5>
          {tierText.audience ? <p className={styles.tierDesc}>{tierText.audience}</p> : null}
        </div>
        <div className={styles.tierPrice}>
          {tier.selfServe && perMonth ? (
            <>
              <strong className={cx(styles.price, recommended && styles.priceRecommended)}>
                {fmt.money(perMonth)}
              </strong>
              <span className={styles.perMonth}>
                {t('perMonth')}
                {savingPercent > 0 ? (
                  <span className={styles.saving}>
                    {' · '}
                    {tPurchase('termSaving', { percent: savingPercent })}
                  </span>
                ) : null}
              </span>
            </>
          ) : (
            <span className={styles.perMonth}>
              {tier.selfServe ? t('termNotSold') : tPurchase('contactForQuote')}
            </span>
          )}
        </div>
      </div>
      <div className={styles.tierFoot}>
        <TierBenefitList tier={tier} />
        {tier.selfServe ? (
          /*
            "Gói hiện tại" nhạt màu như design nhưng VẪN bấm được: đó là đường gia hạn đúng bậc
            đang dùng, khoá nó là mất tính năng gia hạn.
          */
          <button
            type="button"
            role="radio"
            aria-checked={selected}
            className={cx(
              styles.tierAction,
              selected ? styles.tierActionSelected : current && styles.tierActionCurrent,
            )}
            onClick={onSelect}
          >
            {selected ? t('selected') : current ? t('currentTier') : t('select')}
          </button>
        ) : (
          <Link href={CONTACT_SALES_HREF} className={styles.tierAction}>
            {tPurchase('contactSales')}
          </Link>
        )}
      </div>
    </article>
  );
}

/** Gạch đầu dòng của thẻ bậc - design: trần xe in ĐẬM con số ("Tối đa **5** ô tô"), số từ admin. */
function TierBenefitList({ tier }: { tier: PlanTier }) {
  const t = useTranslations('Subscription.combined');
  const tPurchase = useTranslations('Subscription.purchase');
  const domainLabel = useDomainLabel();

  return (
    <ul className={styles.benefits}>
      {tier.card.benefits.map((line) => (
        <li key={line.kind === 'feature' ? line.feature : line.kind}>
          <CheckCircleFilled aria-hidden="true" />
          <span>
            {line.kind === 'feature'
              ? domainLabel('planFeature', line.feature)
              : line.count == null
                ? tPurchase('limitVehiclesUnlimited')
                : t.rich(`limit.${line.scope}`, {
                    count: line.count,
                    b: (chunks) => <strong>{chunks}</strong>,
                  })}
          </span>
        </li>
      ))}
    </ul>
  );
}

/** Dải "Doanh nghiệp" - design `24024:26537` (nền tối, nút vàng): bán bằng tư vấn, không chọn được ở đây. */
export function EnterpriseOffer({ tier }: { tier?: PlanTier }) {
  const t = useTranslations('Subscription.combined');
  const tEnterprise = useTranslations('Subscription.enterprise');
  const domainLabel = useDomainLabel();
  const features = (tier?.limits.features ?? []).map((feature) =>
    domainLabel('planFeature', feature),
  );

  return (
    <section className={styles.enterprise}>
      <span className={styles.enterpriseIcon} aria-hidden="true">
        <BankOutlined />
      </span>
      <div className={styles.enterpriseText}>
        <h3 className={styles.enterpriseTitle}>{t('enterpriseTitle')}</h3>
        <p className={styles.enterpriseHint}>
          {[...features.slice(0, 2), t('enterpriseQuote')].join(' · ')}
        </p>
      </div>
      <Link href={CONTACT_SALES_HREF}>
        <Button type="primary" icon={<PhoneOutlined aria-hidden />}>
          {tEnterprise('contactCta')}
        </Button>
      </Link>
    </section>
  );
}

/** "Cơ bản 5 xe" - nhãn vị trí kèm trần xe của admin; bậc thứ tư trở đi dùng tên admin (đã mang số xe). */
function useSelectionLabel() {
  const t = useTranslations('Subscription.combined');
  const tierText = useTierText();
  return (selection: CombinedPlanSelection): string => {
    const text = tierText(selection.tier, selection.rank);
    const cap = selection.tier.limits.maxVehicles;
    return selection.rank < TIER_RANK_KEYS.length && cap != null
      ? t('tierWithCap', { tier: text.name, count: cap })
      : text.name;
  };
}

/** Chân bước 1: các gói đang chọn (giá tháng ở kỳ đang chọn) + "Tiếp tục". Tổng tiền thuộc bước 2. */
function PlansFooter({
  state,
  onCancel,
  onNext,
}: {
  state: CombinedPlanPurchaseState;
  onCancel: () => void;
  onNext: () => void;
}) {
  const t = useTranslations('Subscription.combined');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const selectionLabel = useSelectionLabel();
  const { selections } = state;

  return (
    <div className={styles.footer}>
      <div className={styles.summary}>
        {selections.length === 0 ? (
          <p className={styles.summaryLine}>{t('pickAtLeastOne')}</p>
        ) : (
          <p className={styles.summaryPlans}>
            {selections.map((item) => (
              <span key={item.scope}>
                {t.rich('summaryPlan', {
                  scope: t(`scope.${item.scope}`),
                  tier: selectionLabel(item),
                  amount: fmt.money(item.perMonth),
                  b: (chunks) => <strong>{chunks}</strong>,
                  muted: (chunks) => <span className={styles.summaryPrice}>{chunks}</span>,
                })}
              </span>
            ))}
          </p>
        )}
      </div>
      <div className={styles.pay}>
        <Button size="large" onClick={onCancel}>
          {tCommon('actions.cancel')}
        </Button>
        <Button size="large" type="primary" disabled={selections.length === 0} onClick={onNext}>
          {t('next')}
        </Button>
      </div>
    </div>
  );
}

/** Chân bước 2: quay lại · tổng (của server khi bản xem trước đã khớp) · tạo hoá đơn. */
function ConfirmFooter({
  total,
  submitting,
  canSubmit,
  onBack,
  onSubmit,
}: {
  total: string | null;
  submitting: boolean;
  canSubmit: boolean;
  onBack: () => void;
  onSubmit: () => void;
}) {
  const t = useTranslations('Subscription.combined');
  const fmt = useAppFormat();

  return (
    <div className={styles.footer}>
      <Button
        size="large"
        icon={<ArrowLeftOutlined aria-hidden />}
        onClick={onBack}
        disabled={submitting}
      >
        {t('back')}
      </Button>
      <div className={styles.pay}>
        <div className={styles.total} aria-live="polite">
          <span className={styles.totalLabel}>{t('totalLabel')}</span>
          <strong className={styles.totalAmount}>{total ? fmt.money(total) : '-'}</strong>
        </div>
        <Button
          size="large"
          type="primary"
          loading={submitting}
          disabled={!canSubmit}
          onClick={onSubmit}
        >
          {t('submit')}
        </Button>
      </div>
    </div>
  );
}
