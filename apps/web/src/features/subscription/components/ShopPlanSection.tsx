'use client';

import { BankOutlined, CheckCircleFilled, PhoneOutlined, TrophyOutlined } from '@ant-design/icons';
import { Alert, Button, Skeleton } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { BILLING_PHASE, PERMISSION, canUpgradeToPackageTrack } from '@xeprime/types';

import { PLAN_PURCHASE_PARAM } from '@/constants/routes';
import { InfoCard } from '@/components/layout/InfoCard';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

import { useMySubscription, usePendingInvoices, useTenantPlans } from '../hooks/use-subscription';
import {
  PLAN_LANE_PARAM,
  PLAN_LANE_SCOPES,
  SHOP_PLAN_LANE_ORDER,
  currentPlanForScope,
  enterprisePlanOf,
  parsePlanLane,
  pendingInvoiceForScope,
  planLaneElementId,
  quotaForLane,
  type PlanLaneScope,
} from '../plan-lanes';
import { PLAN_PURCHASE_INTENT_ACTION, planPurchaseIntentAction } from '../plan-purchase-intent';
import { enterpriseTierOf, type PlanTier } from '../plan-purchase';
import type { CurrentPlan, MySubscription } from '../types';
import { PlanFeatureList } from './PlanFeatureList';
import { CONTACT_SALES_HREF } from './PlanPricingTable';
import { EnterpriseOffer, PlanPurchaseDialog } from './PlanPurchaseDialog';
import { ShopInvoicesCard } from './ShopInvoicesCard';
import { ShopPlanLaneCard, daysLeftOf } from './ShopPlanLaneCard';
import { SubscriptionWorkspace } from './SubscriptionWorkspace';
import styles from './ShopPlanSection.module.css';

/**
 * "Gói & hạn mức" + "Hóa đơn và thanh toán" của trang Thông tin cửa hàng - design `23999:111391`
 * (gian hàng thường) và `23999:111045` (đang dùng gói doanh nghiệp).
 *
 * ## Quyền
 *
 * `subscription.view` cho xem (nơi gọi đã gác). `subscription.purchase` cho mua: thiếu nó thì KHÔNG
 * có nút "Nâng cấp / Đổi gói", không lối mua trên thẻ, và hộp mua không được dựng - một hộp treo
 * sẵn là một đường vào mà API sẽ từ chối ở bước cuối. Phiên hỗ trợ (ADR 0050 §10) chỉ xem.
 *
 * ## Chủ xe tuyến hoa hồng chưa từng trả tiền
 *
 * Màn của họ là LUỒNG NÂNG CẤP (còn một bước hồ sơ ở giữa - `PackageUpgradeWizard`), không phải hộp
 * mua gói của gian hàng. Gặp ca đó (link cũ) thì dựng nguyên `SubscriptionWorkspace` như trước.
 *
 * ## `?lane=` và `?purchase=1`
 *
 * CTA "mua gói cho loại xe này" ở màn xe (`PLAN_SCOPE_REQUIRED`) dẫn tới đây kèm `?lane=`, email gia
 * hạn kèm `?purchase=1`. Đọc MỘT lần khi dữ liệu gói đã có, cuộn tới làn đó và mở hộp mua (chọn sẵn
 * bậc của làn), rồi gỡ khỏi URL - F5 hay Quay lại không mở lại hộp.
 */
export function ShopPlanSection({ id }: { id: string }) {
  const t = useTranslations('Subscription');
  const tShop = useTranslations('Subscription.shopPlan');
  const tCommon = useTranslations('Common');
  const { has } = usePermissions();
  const { tenant } = useTenantScope();
  const canPurchase = has(PERMISSION.SUBSCRIPTION_PURCHASE);
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.PLAN_PURCHASE);
  const upgrading = canPurchase && canUpgradeToPackageTrack(tenant);
  const canBuy = canPurchase && !upgrading && !inSupport;

  const me = useMySubscription();
  const pending = usePendingInvoices(!upgrading && !inSupport);
  const plans = useTenantPlans(!upgrading);
  const [dialog, setDialog] = useState<{ open: boolean; scope: PlanLaneScope | null }>({
    open: false,
    scope: null,
  });
  const [highlightedLane, setHighlightedLane] = useState<PlanLaneScope | null>(null);

  const { filters: intent, setFilters: setIntent } = useUrlFilters((params) => ({
    [PLAN_PURCHASE_PARAM]: params.get(PLAN_PURCHASE_PARAM) === '1',
    [PLAN_LANE_PARAM]: parsePlanLane(params.get(PLAN_LANE_PARAM)) ?? undefined,
  }));
  const purchaseRequested = intent[PLAN_PURCHASE_PARAM] === true;
  const laneRequested = intent[PLAN_LANE_PARAM] ?? null;
  const currentPlans = me.data?.currentPlans;

  useEffect(() => {
    if ((!purchaseRequested && !laneRequested) || !currentPlans || upgrading) return;
    setIntent({ [PLAN_PURCHASE_PARAM]: false, [PLAN_LANE_PARAM]: undefined }, { resetPage: false });
    /*
     * Làn đích: `?lane=`, hoặc - với `?purchase=1` trần từ email gia hạn - làn DUY NHẤT đang có gói.
     * Hai làn đều có (hay đều không) mà không nói làn nào ⇒ hộp mở không chọn sẵn gì, không đoán hộ
     * người dùng loại xe họ muốn mua.
     */
    const lanesWithPlan = PLAN_LANE_SCOPES.filter((scope) =>
      currentPlanForScope(currentPlans, scope),
    );
    const target = laneRequested ?? (lanesWithPlan.length === 1 ? lanesWithPlan[0]! : null);
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- phản ứng một lần với ý định trên URL
      setHighlightedLane(target);
      requestAnimationFrame(() => {
        const el = document.getElementById(planLaneElementId(target));
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el?.focus({ preventScroll: true });
      });
    }
    const action = planPurchaseIntentAction({ canPurchase, upgrading, inSupport });
    if (
      purchaseRequested &&
      action === PLAN_PURCHASE_INTENT_ACTION.OPEN_DIALOG &&
      !enterprisePlanOf(currentPlans)
    ) {
      setDialog({ open: true, scope: target });
    }
  }, [
    purchaseRequested,
    laneRequested,
    currentPlans,
    canPurchase,
    upgrading,
    inSupport,
    setIntent,
  ]);

  if (upgrading) {
    return (
      <InfoCard id={id} title={tShop('title')}>
        <SubscriptionWorkspace />
      </InfoCard>
    );
  }

  const openDialog = (scope: PlanLaneScope | null) => setDialog({ open: true, scope });
  const data = me.data;
  const enterprise = data ? enterprisePlanOf(data.currentPlans) : null;
  const enterpriseTier = enterpriseTierOf(plans.data ?? []);

  return (
    <>
      <InfoCard
        id={id}
        title={tShop('title')}
        hint={tShop('hint')}
        extra={
          canBuy && data && !enterprise ? (
            <Button
              type="primary"
              icon={<TrophyOutlined aria-hidden />}
              onClick={() => openDialog(null)}
            >
              {tShop('change')}
            </Button>
          ) : null
        }
      >
        {me.isLoading ? (
          <Skeleton active paragraph={{ rows: 4 }} />
        ) : me.isError || !data ? (
          <Alert
            type="error"
            showIcon
            title={t('page.loadError')}
            action={
              <Button size="small" onClick={() => void me.refetch()}>
                {tCommon('actions.retry')}
              </Button>
            }
          />
        ) : enterprise ? (
          <ActiveEnterprise plan={enterprise} tier={enterpriseTier} data={data} />
        ) : (
          <>
            <div className={styles.lanes}>
              {SHOP_PLAN_LANE_ORDER.map((scope) => (
                <ShopPlanLaneCard
                  key={scope}
                  scope={scope}
                  current={currentPlanForScope(data.currentPlans, scope)}
                  quota={quotaForLane(data.vehicleQuotas, scope)}
                  pendingInvoice={
                    inSupport ? null : pendingInvoiceForScope(pending.data ?? [], scope)
                  }
                  highlighted={highlightedLane === scope}
                  onPurchase={canBuy ? () => openDialog(scope) : undefined}
                />
              ))}
            </div>
            {enterpriseTier && !inSupport ? <EnterpriseOffer tier={enterpriseTier} /> : null}
            {/* "Nâng cấp để mở khoá" - tự biến mất khi không còn tính năng nào bị khoá. */}
            {inSupport ? null : (
              <PlanFeatureList onUpgrade={canBuy ? () => openDialog(null) : undefined} />
            )}
          </>
        )}
      </InfoCard>

      <ShopInvoicesCard />

      {canBuy && data ? (
        <PlanPurchaseDialog
          open={dialog.open}
          data={data}
          initialScope={dialog.scope}
          onClose={() => setDialog((state) => ({ ...state, open: false }))}
        />
      ) : null}
    </>
  );
}

/**
 * Gói DOANH NGHIỆP đang dùng - design `23999:111045`. Một gói cho cả đội xe (ADR 0065 điều 2 - không
 * chồng với gói ô tô/xe máy, nên hai thẻ làn vắng hẳn). Bán bằng tư vấn: chỉ có "Liên hệ với XePrime",
 * không có nút "Thanh toán" của design (người dùng chốt 06/11/2026 - không có hoá đơn tự trả).
 */
function ActiveEnterprise({
  plan,
  tier,
  data,
}: {
  plan: CurrentPlan;
  tier?: PlanTier;
  data: MySubscription;
}) {
  const t = useTranslations('Subscription.shopPlan');
  const tEnterprise = useTranslations('Subscription.enterprise');
  const tTerm = useTranslations('Subscription.term');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const features = tier?.limits.features ?? [];
  const grace = plan.phase === BILLING_PHASE.GRACE;

  return (
    <section className={styles.enterpriseActive}>
      <div className={styles.enterpriseHead}>
        <span className={styles.enterpriseIcon} aria-hidden="true">
          <BankOutlined />
        </span>
        <div className={styles.enterpriseText}>
          <h3 className={styles.enterpriseTitle}>
            {plan.planName}
            <span className={styles.activeTag}>{tEnterprise('activeTag')}</span>
          </h3>
          <p className={styles.enterpriseHint}>{tEnterprise('activeSummary')}</p>
        </div>
        <Link href={CONTACT_SALES_HREF}>
          <Button icon={<PhoneOutlined aria-hidden />}>{t('contactXePrime')}</Button>
        </Link>
      </div>

      <div className={styles.enterpriseStats}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t('totalVehicles')}</span>
          <span className={styles.statValue}>
            {data.fleetQuota.totalUsed}
            <span className={styles.statSub}>{t('unlimited')}</span>
          </span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>{t('validUntil')}</span>
          <span className={styles.statValue}>
            {fmt.date(plan.endsAt)}
            <span className={styles.statSub}>
              {grace ? tTerm('grace') : t('daysRemaining', { days: daysLeftOf(plan.endsAt) })}
            </span>
          </span>
        </div>
      </div>

      <ul className={styles.enterpriseFeatures}>
        <li>
          <CheckCircleFilled aria-hidden />
          {tEnterprise('coversBoth')}
        </li>
        {features.map((feature) => (
          <li key={feature}>
            <CheckCircleFilled aria-hidden />
            {domainLabel('planFeature', feature)}
          </li>
        ))}
      </ul>
      <p className={styles.enterpriseNote}>{tEnterprise('changeHint')}</p>
    </section>
  );
}
