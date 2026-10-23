'use client';

import { Alert, Button, Spin } from 'antd';
import { useEffect, useState, type ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import { PERMISSION, canUpgradeToPackageTrack } from '@xeprime/types';

import { PLAN_PURCHASE_PARAM } from '@/constants/routes';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { useUrlFilters } from '@/hooks/use-url-filters';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { usePermissions } from '@/hooks/use-permissions';

import { useMySubscription, usePendingInvoices } from '../hooks/use-subscription';
import {
  FIRST_PLAN_LANE,
  PLAN_LANE_PARAM,
  PLAN_LANE_SCOPES,
  currentPlanForScope,
  enterprisePlanOf,
  parsePlanLane,
  planLaneElementId,
  type PlanLaneScope,
} from '../plan-lanes';
import { PLAN_PURCHASE_INTENT_ACTION, planPurchaseIntentAction } from '../plan-purchase-intent';
import { PackageUpgradeWizard, UPGRADE_TITLE_ID } from './PackageUpgradeWizard';
import { PlanFeatureList } from './PlanFeatureList';
import { PlanLanesPanel } from './PlanLanesPanel';
import { PlanSummaryPanel } from './PlanSummaryPanel';
import { PurchaseModal } from './PurchaseModal';
import { SubscriptionInvoicesPanel } from './SubscriptionInvoicesPanel';
import styles from './SubscriptionWorkspace.module.css';

/**
 * "Gói & hạn mức" + "Hoá đơn thanh toán" (ADR 0015/0026 · ADR 0065).
 *
 * Dựng ở HAI chỗ, cùng một vai — section "gói" của trang hồ sơ ở mỗi tuyến:
 *  - `SHOP?section=plan` — "Gói & hạn mức" của trang Cửa hàng (gian hàng tuyến gói);
 *  - `ACCOUNT?section=plan` — "Gói dịch vụ" của "Hồ sơ chủ xe" (tuyến hoa hồng, 07/10/2026).
 *
 * `header` đi vào bằng prop thay vì tự dựng: cả hai chỗ hiện đều đã có tiêu đề section của riêng
 * nó và truyền `null`. Mỗi trang vẫn đúng một `h1`.
 *
 * ## Mua gói là quyền RIÊNG
 *
 * `subscription.view` cho XEM gói và hạn mức; `subscription.purchase` cho MUA/gia hạn (mặc định chỉ
 * chủ gian hàng, API chặn). Thiếu quyền ⇒ KHÔNG có CTA nào dẫn vào luồng đó, và `PurchaseModal`
 * KHÔNG được dựng trong cây — một modal treo sẵn là một đường vào mà API sẽ từ chối ở bước cuối.
 *
 * ## Hai hình dạng của việc MUA, theo TUYẾN
 *
 * | Tuyến | Màn mua | Vì sao |
 * | --- | --- | --- |
 * | gói (gia hạn / mua thêm loại xe) | hai LÀN + `PurchaseModal` theo làn | mỗi loại xe một gói (ADR 0065) |
 * | hoa hồng (nâng cấp) | `PackageUpgradeWizard` NGAY TRÊN TRANG | còn một bước hồ sơ ở giữa |
 *
 * ## `?lane=` và `?purchase=1`
 *
 * CTA "mua gói cho loại xe này" ở màn xe (`PLAN_SCOPE_REQUIRED`) dẫn tới đây kèm `?lane=`; màn này
 * cuộn tới làn đó, đặt tiêu điểm, và mở hộp thoại mua nếu đi kèm `?purchase=1`. Cả hai tham số đọc
 * MỘT lần khi dữ liệu gói đã có, rồi gỡ khỏi URL — F5 hay Quay lại không mở lại hộp thoại.
 */
export function SubscriptionWorkspace({
  header = null,
}: {
  /** Tiêu đề TRANG khi màn này đứng riêng; nhúng trong một `SectionCard` thì bỏ trống. */
  header?: ReactNode;
}) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common');
  const { has } = usePermissions();
  const canPurchase = has(PERMISSION.SUBSCRIPTION_PURCHASE);
  const { tenant } = useTenantScope();
  /*
   * Phiên hỗ trợ gian hàng (ADR 0050 §10) chỉ XEM gói đang dùng và sổ hoá đơn: không lời mời nâng
   * cấp/mua và không khối chuyển khoản của hoá đơn đang chờ.
   */
  const inSupport = useSupportHides(SUPPORT_HIDDEN_AREA.PLAN_PURCHASE);

  /*
   * Chủ xe tuyến hoa hồng ⇒ màn NÂNG CẤP thay cho các làn mua. Điều kiện đọc từ luật dùng chung
   * (ADR 0038 điều 1 · ADR 0040 điều 4): gian hàng đã từng trả tiền KHÔNG rơi vào đây — với họ đây
   * vẫn là màn gia hạn / mua lại theo làn.
   */
  const upgrading = canPurchase && canUpgradeToPackageTrack(tenant);
  const canBuyLanes = canPurchase && !upgrading && !inSupport;

  const me = useMySubscription();
  // Luồng nâng cấp tự giữ query này ở bước 3 của nó; phiên hỗ trợ không xem khối chuyển khoản.
  const pending = usePendingInvoices(!upgrading && !inSupport);
  /** Làn đang mở hộp thoại mua; `null` = đóng. Giữ làn cuối để hiệu ứng đóng không nháy. */
  const [purchase, setPurchase] = useState<{ scope: PlanLaneScope; open: boolean }>({
    scope: FIRST_PLAN_LANE,
    open: false,
  });
  const [highlightedLane, setHighlightedLane] = useState<PlanLaneScope | null>(null);
  /*
   * Idempotent: mở lại đúng làn đang mở trả về CÙNG state, nên một effect chạy lại (vd setter URL
   * đổi identity) không dựng một vòng render vô tận.
   */
  const openPurchase = (scope: PlanLaneScope) =>
    setPurchase((state) => (state.open && state.scope === scope ? state : { scope, open: true }));

  const { filters: intent, setFilters: setIntent } = useUrlFilters((params) => ({
    [PLAN_PURCHASE_PARAM]: params.get(PLAN_PURCHASE_PARAM) === '1',
    [PLAN_LANE_PARAM]: parsePlanLane(params.get(PLAN_LANE_PARAM)) ?? undefined,
  }));
  const purchaseRequested = intent[PLAN_PURCHASE_PARAM] === true;
  const laneRequested = intent[PLAN_LANE_PARAM] ?? null;
  const ready = Boolean(me.data);
  const currentPlans = me.data?.currentPlans;

  useEffect(() => {
    if ((!purchaseRequested && !laneRequested) || !ready) return;
    setIntent({ [PLAN_PURCHASE_PARAM]: false, [PLAN_LANE_PARAM]: undefined }, { resetPage: false });
    if (upgrading) {
      if (purchaseRequested && canPurchase && !inSupport)
        requestAnimationFrame(focusUpgradeSection);
      return;
    }
    /*
     * Làn đích: tham số `?lane=`, hoặc — với `?purchase=1` trần từ email gia hạn — làn DUY NHẤT
     * đang có gói. Hai làn đều có (hay đều không) mà không nói làn nào ⇒ chỉ cuộn tới khối làn,
     * không đoán hộ người dùng loại xe họ muốn mua.
     */
    const lanesWithPlan = PLAN_LANE_SCOPES.filter((scope) =>
      currentPlanForScope(currentPlans ?? [], scope),
    );
    const target = laneRequested ?? (lanesWithPlan.length === 1 ? lanesWithPlan[0] : null);
    const enterprise = enterprisePlanOf(currentPlans ?? []);
    if (target) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- phản ứng một lần với ý định trên URL
      setHighlightedLane(target);
      requestAnimationFrame(() => focusElement(planLaneElementId(target)));
    }
    const action = planPurchaseIntentAction({ canPurchase, upgrading, inSupport });
    if (
      purchaseRequested &&
      action === PLAN_PURCHASE_INTENT_ACTION.OPEN_DIALOG &&
      target &&
      !enterprise
    ) {
      openPurchase(target);
    }
  }, [
    purchaseRequested,
    laneRequested,
    ready,
    canPurchase,
    upgrading,
    inSupport,
    currentPlans,
    setIntent,
  ]);

  if (me.isLoading) {
    return (
      <div>
        {header}
        <div className={styles.center}>
          <Spin />
        </div>
      </div>
    );
  }

  if (me.isError || !me.data) {
    return (
      <div>
        {header}
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
      </div>
    );
  }

  const data = me.data;

  return (
    <div className={styles.workspace}>
      {header}
      <PlanSummaryPanel data={data} />
      {/*
        Các LÀN chỉ dành cho gian hàng (đang có gói, hoặc đã từng trả tiền). Chủ xe tuyến hoa hồng
        chưa từng trả có luồng nâng cấp riêng ngay dưới — bảng giá hai làn nằm trong đó.
      */}
      {upgrading ? null : (
        <PlanLanesPanel
          data={data}
          pendingInvoices={inSupport ? [] : (pending.data ?? [])}
          highlightedLane={highlightedLane}
          onPurchase={canBuyLanes ? openPurchase : undefined}
        />
      )}
      {/*
        "Nâng cấp để mở khoá" là một THẺ RIÊNG: nó nói về thứ người dùng chưa có. Tự biến mất khi
        không còn tính năng nào bị khoá. Ở tuyến gói, lối nâng là cuộn tới các làn.
      */}
      {inSupport ? null : <PlanFeatureList onUpgrade={canBuyLanes ? focusLanes : undefined} />}
      {upgrading ? <PackageUpgradeWizard /> : null}
      {/*
        Luồng nâng cấp đã dựng khối chuyển khoản ở bước 3 của nó. Để sổ hoá đơn dựng thêm một
        khối nữa là hai lời mời trả cho CÙNG một hoá đơn trên cùng một trang.
      */}
      <SubscriptionInvoicesPanel showPending={!upgrading && !inSupport} />
      {canBuyLanes ? (
        <PurchaseModal
          open={purchase.open}
          scope={purchase.scope}
          current={currentPlanForScope(data.currentPlans, purchase.scope)}
          onClose={() => setPurchase((state) => ({ ...state, open: false }))}
        />
      ) : null}
    </div>
  );
}

/**
 * Cuộn tới một phần tử VÀ đặt tiêu điểm vào nó — cuộn không thôi thì người dùng bàn phím vẫn đứng ở
 * nút vừa bấm. `preventScroll` cho `focus()`: `scrollIntoView` đã cuộn mượt, để trình duyệt cuộn lần
 * thứ hai (tức thời) sẽ giật ngược giữa animation.
 */
function focusElement(id: string): void {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  el.focus({ preventScroll: true });
}

function focusUpgradeSection(): void {
  focusElement(UPGRADE_TITLE_ID);
}

/** "Xem gói cao hơn" ở tuyến gói ⇒ làn đầu tiên. */
function focusLanes(): void {
  focusElement(planLaneElementId(FIRST_PLAN_LANE));
}
