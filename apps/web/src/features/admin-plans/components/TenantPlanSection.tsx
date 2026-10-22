'use client';

import { CreditCardOutlined } from '@ant-design/icons';
import { App, Button, Pagination, Popconfirm, Radio, Select, Spin } from 'antd';
import { useMemo, useState } from 'react';
import { useTranslations } from 'next-intl';
import {
  BILLING_MODE,
  PERMISSION,
  SUBSCRIPTION_ASSIGN_KIND,
  SUBSCRIPTION_CHANGE_TIMING,
  SUBSCRIPTION_ORIGIN,
  SUBSCRIPTION_TERM_MONTHS,
  SUBSCRIPTION_TERM_STATE,
  SUBSCRIPTION_TERM_STATE_META,
  addCalendarMonthsVn,
  daysLeftUntil,
  parsePlanLimits,
  planScopesConflict,
  planSubscriptionChain,
  planVehicleScopeOf,
  PLAN_STATUS,
  PLAN_VEHICLE_SCOPE,
  PLAN_VEHICLE_SCOPE_VALUES,
  planTermPrice,
  subscriptionCancelBlockOf,
  type PlanLimitsJson,
  type SubscriptionChangeTiming,
  type SubscriptionTermMonths,
  type SubscriptionTermState,
} from '@xeprime/types';
import { LIST_SEPARATOR, formatMoneyInput, wholeUnits } from '@xeprime/domain';
import { StatusTag } from '@/components/data-display/StatusTag';
import { MoneyInput } from '@/components/form/MoneyInput';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { cx } from '@/lib/cx';
import { dayjs } from '@/lib/datetime';
import { SUBSCRIPTIONS_DEFAULT_LIMIT } from '../api';
import { useAssignSubscription, useCancelSubscription } from '../hooks/use-plan-mutations';
import { useLiveSubscriptions, usePlans, useTenantSubscriptions } from '../hooks/use-plans';
import { groupPlans } from '../plan-catalog';
import type { CurrentPlan, Plan, PlatformTenantPlanTerm, Subscription } from '../types';
import styles from './TenantPlanSection.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { usePermissions } from '@/hooks/use-permissions';

/** Trạng thái KỲ do SERVER chấm (`termState`) — client không tự chấm bằng đồng hồ của nó. */
const stateOf = (sub: Subscription) => sub.termState as SubscriptionTermState;

/** Thứ tự làn cố định (doanh nghiệp → ô tô → xe máy, `PLAN_VEHICLE_SCOPE_VALUES`) — thẻ không đổi chỗ. */
function sortByScope<T extends Pick<Subscription, 'vehicleScope' | 'startsAt'>>(
  rows: readonly T[],
): T[] {
  const rank = (row: T) => PLAN_VEHICLE_SCOPE_VALUES.indexOf(planVehicleScopeOf(row.vehicleScope));
  return [...rows].sort(
    (a, b) => rank(a) - rank(b) || new Date(a.startsAt).getTime() - new Date(b.startsAt).getTime(),
  );
}

/**
 * Section "Gói dịch vụ" trong hộp thao tác quản trị nền tảng (ADR 0010/0041).
 *
 * Tại mỗi thời điểm gian hàng có TỐI ĐA MỘT kỳ đang hiệu lực; gia hạn sớm tạo một kỳ CHỜ ĐẾN KỲ
 * nối đuôi kỳ đó (ADR 0010 điều 2). Màn này nói đúng điều đó: thẻ "Đang hiệu lực", thẻ "Kỳ kế
 * tiếp", và lịch sử gắn trạng thái KỲ — không in thẳng `status = active` của DB.
 *
 * Hai nguồn dữ liệu, cố ý tách: chuỗi kỳ CÒN HẠN (`state=live`) cho thẻ, xem trước và luật huỷ;
 * LỊCH SỬ (phân trang) chỉ để đọc. Luật xem trước và luật huỷ là CÙNG hàm server dùng
 * (`planSubscriptionChain`, `subscriptionCancelBlockOf`) — ngày web hứa là ngày server ghi.
 */
export function TenantPlanSection({
  tenantId,
  currentPlan,
  terms = [],
}: {
  tenantId: string;
  currentPlan: CurrentPlan | null;
  /**
   * Các kỳ gói đang hiệu lực, mỗi phạm vi loại xe một kỳ (`PlatformTenantPlanDto.terms`) — nguồn
   * của thẻ khi người xem KHÔNG đọc được chuỗi kỳ (thiếu `platform.billing.manage`).
   */
  terms?: readonly PlatformTenantPlanTerm[];
}) {
  const t = useTranslations('AdminPlans.tenant');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const [assignOpen, setAssignOpen] = useState(false);
  const [page, setPage] = useState(1);

  /*
   * Gói và lịch sử thuê bao là việc của người quản lý GÓI (`platform.billing.manage`). Người chỉ
   * xem gian hàng (vai support, ADR 0050) vẫn thấy gói HIỆN HÀNH — đi kèm chi tiết gian hàng —
   * nhưng không có nút gán/gia hạn/huỷ, và hai endpoint đòi quyền đó không được gọi.
   */
  const { has } = usePermissions();
  const canManageBilling = has(PERMISSION.PLATFORM_BILLING_MANAGE);
  const history = useTenantSubscriptions(canManageBilling ? tenantId : null, page);
  const liveQuery = useLiveSubscriptions(canManageBilling ? tenantId : null);
  const cancel = useCancelSubscription(tenantId);

  const live = useMemo(() => liveQuery.data ?? [], [liveQuery.data]);
  /*
   * Tối đa MỘT kỳ đang hiệu lực MỖI PHẠM VI (ADR 0065): một kỳ xe máy và một kỳ ô tô chạy song song,
   * hoặc một kỳ doanh nghiệp phủ cả hai. Sắp theo thứ tự làn để thẻ không đổi chỗ giữa hai lần mở.
   */
  const current = sortByScope(
    live.filter((sub) => stateOf(sub) === SUBSCRIPTION_TERM_STATE.CURRENT),
  );
  const scheduled = sortByScope(
    live.filter((sub) => stateOf(sub) === SUBSCRIPTION_TERM_STATE.SCHEDULED),
  );

  function handleCancel(sub: Subscription) {
    cancel.mutate(sub.id, {
      onSuccess: () => message.success(t('cancelSuccess')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const hasPlan = current.length > 0 || terms.length > 0 || Boolean(currentPlan);
  const historyItems = history.data?.items ?? [];

  return (
    <div className={styles.section}>
      <div className={styles.sectionHead}>
        <div className={styles.sectionTitle}>
          <CreditCardOutlined /> {t('title')}
        </div>
        {canManageBilling ? (
          <Button size="small" type="primary" onClick={() => setAssignOpen(true)}>
            {hasPlan ? t('renewButton') : t('assignButton')}
          </Button>
        ) : null}
      </div>

      <div className={styles.cards}>
        {current.length > 0 ? (
          current.map((term) => <TermCard key={term.id} term={term} variant="current" />)
        ) : !canManageBilling && (terms.length > 0 || currentPlan) ? (
          /*
           * Không có quyền đọc chuỗi kỳ: các kỳ gói hiệu lực đi kèm chi tiết gian hàng (mỗi phạm vi
           * một kỳ), hoặc — ngoài tuyến gói — dòng hiện hành duy nhất.
           */
          (terms.length > 0
            ? terms.map((term) => ({
                key: term.subscriptionId,
                scope: term.vehicleScope,
                planName: term.planName,
                endsAt: term.endsAt,
              }))
            : currentPlan
              ? [
                  {
                    key: currentPlan.subscriptionId,
                    scope: currentPlan.vehicleScope,
                    planName: currentPlan.planName,
                    endsAt: currentPlan.endsAt,
                  },
                ]
              : []
          ).map((item) => (
            <div key={item.key} className={cx(styles.card, styles.cardCurrent)}>
              <div className={styles.cardLabel}>
                {t('currentLabel')}
                {LIST_SEPARATOR}
                {t(`scope.${planVehicleScopeOf(item.scope)}`)}
              </div>
              <div className={styles.cardName}>{item.planName}</div>
              <div className={styles.meta}>
                {t('endsOn', { date: fmt.date(item.endsAt) })}
                {LIST_SEPARATOR}
                {t('daysLeft', { days: daysLeftUntil(item.endsAt) })}
              </div>
            </div>
          ))
        ) : liveQuery.isLoading ? null : (
          <div className={cx(styles.card, styles.cardEmpty)}>
            <div className={styles.cardName}>{t('noPlan')}</div>
            <div className={styles.meta}>{t('noPlanHint')}</div>
          </div>
        )}
        {scheduled.map((term) => (
          <TermCard key={term.id} term={term} variant="scheduled" />
        ))}
      </div>

      {!canManageBilling ? null : (
        <>
          <div className={styles.historyTitle}>{t('historyTitle')}</div>
          {history.isLoading || liveQuery.isLoading ? (
            <div className={styles.center}>
              <Spin size="small" />
            </div>
          ) : history.isError || liveQuery.isError ? (
            <div className={styles.empty}>
              {t('historyError')}{' '}
              <Button
                size="small"
                type="link"
                onClick={() => {
                  void history.refetch();
                  void liveQuery.refetch();
                }}
              >
                {tCommon('actions.retry')}
              </Button>
            </div>
          ) : historyItems.length === 0 ? (
            <div className={styles.empty}>{t('historyEmpty')}</div>
          ) : (
            <>
              <ul className={styles.historyList}>
                {historyItems.map((sub) => (
                  <HistoryRow
                    key={sub.id}
                    term={sub}
                    // Luật huỷ đọc CHUỖI KỲ CÒN HẠN đầy đủ, không đọc trang lịch sử đang xem.
                    cancellable={subscriptionCancelBlockOf(sub, live) === null}
                    cancelling={cancel.isPending && cancel.variables === sub.id}
                    onCancel={() => handleCancel(sub)}
                  />
                ))}
              </ul>
              {(history.data?.meta.total ?? 0) > SUBSCRIPTIONS_DEFAULT_LIMIT ? (
                <Pagination
                  className={styles.pager}
                  size="small"
                  current={page}
                  pageSize={SUBSCRIPTIONS_DEFAULT_LIMIT}
                  total={history.data?.meta.total ?? 0}
                  showSizeChanger={false}
                  onChange={setPage}
                />
              ) : null}
            </>
          )}
        </>
      )}

      {/* Hộp gán gói đọc danh sách bậc gói (`platform.billing.manage`) — không mount là không gọi. */}
      {canManageBilling ? (
        <AssignPlanModal
          open={assignOpen}
          tenantId={tenantId}
          liveTerms={live}
          onClose={() => setAssignOpen(false)}
        />
      ) : null}
    </div>
  );
}

/** Hạn mức snapshot của một kỳ (ADR 0041 điều 3) — `null` = không giới hạn. */
function useQuotaText() {
  const t = useTranslations('AdminPlans.tenant');
  return (term: Pick<Subscription, 'quota' | 'vehicleScope'>): string | null => {
    if (!term.quota) return null;
    const value = (limit: number | null | undefined) =>
      limit == null ? t('assign.unlimited') : String(limit);
    // Trần đọc theo PHẠM VI của kỳ (ADR 0065) — không còn trần chi nhánh (ADR 0065 điều 1).
    return t(`quotaScoped.${planVehicleScopeOf(term.vehicleScope)}`, {
      vehicles: value(term.quota.maxVehicles),
    });
  };
}

function TermCard({ term, variant }: { term: Subscription; variant: 'current' | 'scheduled' }) {
  const t = useTranslations('AdminPlans.tenant');
  const fmt = useAppFormat();
  const quotaText = useQuotaText();
  const quota = quotaText(term);
  return (
    <div
      className={cx(styles.card, variant === 'current' ? styles.cardCurrent : styles.cardScheduled)}
    >
      <div className={styles.cardLabel}>
        {variant === 'current' ? t('currentLabel') : t('scheduledLabel')}
        {LIST_SEPARATOR}
        {t(`scope.${planVehicleScopeOf(term.vehicleScope)}`)}
      </div>
      <div className={styles.cardName}>{term.planName}</div>
      <div className={styles.meta}>
        {t('period', { from: fmt.date(term.startsAt), to: fmt.date(term.endsAt) })}
        {LIST_SEPARATOR}
        {variant === 'current'
          ? t('daysLeft', { days: daysLeftUntil(term.endsAt) })
          : t('startsIn', { days: daysLeftUntil(term.startsAt) })}
      </div>
      <div className={styles.meta}>
        {[
          quota,
          term.termMonths != null
            ? t('pricePerTerm', { amount: fmt.money(term.price), months: term.termMonths })
            : fmt.money(term.price),
        ]
          .filter(Boolean)
          .join(LIST_SEPARATOR)}
      </div>
    </div>
  );
}

function HistoryRow({
  term,
  cancellable,
  cancelling,
  onCancel,
}: {
  term: Subscription;
  cancellable: boolean;
  cancelling: boolean;
  onCancel: () => void;
}) {
  const t = useTranslations('AdminPlans.tenant');
  const fmt = useAppFormat();
  const state = stateOf(term);
  const scheduled = state === SUBSCRIPTION_TERM_STATE.SCHEDULED;
  const past =
    state === SUBSCRIPTION_TERM_STATE.ENDED || state === SUBSCRIPTION_TERM_STATE.CANCELLED;

  return (
    <li className={cx(styles.historyRow, past && styles.historyRowPast)}>
      <div className={styles.historyMain}>
        <div className={styles.historyName}>
          {term.planName}
          <span className={styles.historyScope}>
            {t(`scope.${planVehicleScopeOf(term.vehicleScope)}`)}
          </span>
        </div>
        <div className={styles.meta}>
          {[
            t('period', { from: fmt.date(term.startsAt), to: fmt.date(term.endsAt) }),
            fmt.money(term.price),
            term.termMonths != null ? t('termMonths', { months: term.termMonths }) : null,
          ]
            .filter(Boolean)
            .join(LIST_SEPARATOR)}
        </div>
        {/* Nguồn gốc kỳ do server suy (`origin`) — thay cho ghi chú hệ thống viết cứng trong DB. */}
        <div className={styles.note}>
          {[
            term.origin !== SUBSCRIPTION_ORIGIN.ADMIN ? t(`origin.${term.origin}`) : null,
            term.note,
          ]
            .filter(Boolean)
            .join(LIST_SEPARATOR)}
        </div>
      </div>
      <div className={styles.historyActions}>
        <StatusTag
          value={state}
          meta={SUBSCRIPTION_TERM_STATE_META}
          group="subscriptionTermState"
        />
        {cancellable ? (
          <Popconfirm
            title={scheduled ? t('cancelScheduledTitle') : t('cancelCurrentTitle')}
            description={
              <div className={styles.confirmBody}>
                {scheduled ? t('cancelScheduledBody') : t('cancelCurrentBody')}
              </div>
            }
            okText={t('cancelConfirmOk')}
            okButtonProps={{ danger: true }}
            cancelText={t('cancelConfirmCancel')}
            onConfirm={onCancel}
          >
            <Button size="small" type="link" danger loading={cancelling}>
              {scheduled ? t('cancelScheduledAction') : t('cancelAction')}
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
  liveTerms,
  onClose,
}: {
  open: boolean;
  tenantId: string;
  /** Chuỗi kỳ còn hạn — quyết định kỳ mới bắt đầu lúc nào (cùng hàm với server). */
  liveTerms: readonly Subscription[];
  onClose: () => void;
}) {
  const t = useTranslations('AdminPlans.tenant');
  const tCommon = useTranslations('Common');
  const fmt = useAppFormat();
  const errorMessage = useErrorMessage();

  const tCatalog = useTranslations('AdminPlans');
  const { message } = App.useApp();
  /*
   * Bậc ĐANG BÁN và bậc CHƯA MỞ BÁN (`draft`) — admin gán được một bậc nháp cho một gian hàng
   * (vd khách đầu tiên của bậc mới) nhưng phải nhập giá: bậc nháp chưa có giá niêm yết đáng tin, và
   * server từ chối `VALIDATION_FAILED` nếu thiếu. Bậc đã ngừng không gán được.
   */
  const plansQuery = usePlans('all');
  const plans = {
    ...plansQuery,
    data: plansQuery.data?.filter((p) => p.status !== PLAN_STATUS.ARCHIVED),
  };
  const assign = useAssignSubscription(tenantId);
  const [planId, setPlanId] = useState<string | null>(null);
  const [termMonths, setTermMonths] = useState<SubscriptionTermMonths>(1);
  const [timing, setTiming] = useState<SubscriptionChangeTiming>(
    SUBSCRIPTION_CHANGE_TIMING.NEXT_TERM,
  );
  /**
   * Giá ĐÀM PHÁN — `null` = dùng giá niêm yết của kỳ hạn (ADR 0041 điều 5).
   *
   * Phân biệt `null` với `0` là điều kiện để cả hai ý định cùng diễn đạt được: bỏ trống là "lấy
   * giá bảng", còn gõ 0 là "tặng kỳ này" — và một lượt tặng phải để lại dấu vết trong audit chứ
   * không lẫn vào ca mặc định.
   */
  const [price, setPrice] = useState<number | null>(null);

  /*
   * Kỳ TRẢ PHÍ cuối cùng còn hạn — câu hỏi "có cần chọn thời điểm áp dụng không". Luật đầy đủ
   * (đuôi, kỳ bị huỷ, đường gán) nằm ở `planSubscriptionChain`, gọi bên dưới.
   */
  const selected: Plan | undefined = plans.data?.find((p) => p.id === planId);
  const selectedScope = selected ? planVehicleScopeOf(selected.vehicleScope) : null;
  /*
   * Chuỗi kỳ chạy THEO PHẠM VI (ADR 0065 điều 2): gán gói ô tô không nối sau kỳ xe máy, không huỷ
   * nó. Chỉ kỳ trả phí ở phạm vi XUNG ĐỘT với bậc đang chọn mới quyết định "nối sau" / "đổi ngay" —
   * cùng luật `planScopesConflict` mà `planSubscriptionChain` và EXCLUDE ở DB dùng. Chưa chọn
   * bậc thì xét mọi kỳ trả phí (dòng ngữ cảnh đầu hộp thoại).
   */
  const allPaidLive = liveTerms.filter((term) => term.billingMode !== BILLING_MODE.COMMISSION);
  const paidLive = selectedScope
    ? allPaidLive.filter((term) =>
        planScopesConflict(selectedScope, planVehicleScopeOf(term.vehicleScope)),
      )
    : allPaidLive;
  const paidTail =
    [...paidLive].sort((a, b) => new Date(b.endsAt).getTime() - new Date(a.endsAt).getTime())[0] ??
    null;
  /** Bậc doanh nghiệp (`all`) — gán nó huỷ hoá đơn mở của hai phạm vi kia và (đổi ngay) cả hai kỳ. */
  const enterpriseSelected =
    selectedScope === PLAN_VEHICLE_SCOPE.ALL && selected?.billingMode === BILLING_MODE.PACKAGE;
  // PlanDto.limits đã đủ hình, nhưng parse lại cho ra kiểu chia sẻ (PlanLimitsJson) dùng
  // với các phép xem trước — cùng parser với backend, không tự diễn giải.
  const limits: PlanLimitsJson | null = selected ? parsePlanLimits(selected.limits) : null;
  const isPackage = selected?.billingMode === BILLING_MODE.PACKAGE;
  const listed = limits ? planTermPrice(limits, termMonths) : null;
  /** Bậc tư vấn, hoặc kỳ hạn ngoài bảng giá: không có gì để rơi về ⇒ `price` BẮT BUỘC. */
  const isDraft = selected?.status === PLAN_STATUS.DRAFT;
  const priceRequired = Boolean(isPackage && (listed === null || isDraft));

  /*
   * Xem trước bằng CHÍNH hàm server dùng: ngày bắt đầu, đường gán (gia hạn / đổi từ kỳ sau / đổi
   * ngay) và số kỳ bị kết thúc. "Bây giờ" lấy lúc dựng — một khung xem trước, không phải lời hứa
   * tới từng giây; server chấm lại khi ghi.
   */
  const chain = selected
    ? planSubscriptionChain(
        liveTerms,
        { planId: selected.id, timing, vehicleScope: selected.vehicleScope },
        new Date(),
      )
    : null;
  const kind = chain?.kind ?? null;
  const replacedCount =
    chain?.kind === SUBSCRIPTION_ASSIGN_KIND.CHANGE_NOW
      ? chain.cancel.filter((term) => term.billingMode !== BILLING_MODE.COMMISSION).length
      : 0;

  /*
   * Bậc chia NHÓM theo phạm vi (ADR 0065) — cùng bốn nhóm với màn danh mục, để admin chọn "gói ô tô
   * 5 xe" chứ không phải tìm nó giữa bảy dòng cùng tên "5 xe".
   */
  const options = groupPlans(plans.data ?? []).map(({ group, plans: rows }) => ({
    label: tCatalog(`page.groups.${group}`),
    options: rows.map((p) => {
      const planLimits = parsePlanLimits(p.limits);
      const base =
        p.billingMode === BILLING_MODE.COMMISSION
          ? t('assign.planOptionCommission', { name: p.name, percent: p.commissionPercent ?? 0 })
          : planLimits.salesOnly
            ? t('assign.planOptionSalesOnly', { name: p.name })
            : t('assign.planOptionPackage', {
                name: p.name,
                vehicles:
                  planLimits.maxVehicles == null
                    ? t('assign.unlimited')
                    : String(planLimits.maxVehicles),
              });
      return {
        value: p.id,
        // Bậc nháp nói rõ nó chưa bán — giá phải nhập tay.
        label: p.status === PLAN_STATUS.DRAFT ? t('assign.draftOption', { label: base }) : base,
      };
    }),
  }));

  function reset() {
    setPlanId(null);
    setPrice(null);
    setTermMonths(1);
    setTiming(SUBSCRIPTION_CHANGE_TIMING.NEXT_TERM);
  }

  // Đóng hộp là bỏ lượt nhập: mở lại cho một quyết định khác không được mang giá đàm phán cũ theo.
  function close() {
    reset();
    onClose();
  }

  function selectPlan(id: string) {
    setPlanId(id);
    // Đổi bậc là đổi bảng giá — giữ lại một con số đàm phán của bậc trước là gán nhầm giá.
    setPrice(null);
  }

  // ends = THÁNG LỊCH qua addCalendarMonthsVn (ADR 0015 điều 2), không phải cộng ngày.
  const preview = chain
    ? {
        starts: dayjs(chain.startsAt),
        ends: dayjs(addCalendarMonthsVn(chain.startsAt, termMonths)),
      }
    : null;

  /** Tiền sẽ ghi lên dòng thuê bao: con số admin gõ thắng giá niêm yết. */
  const effectiveTotal = price ?? (listed == null ? null : Number(listed));

  const termOptions = SUBSCRIPTION_TERM_MONTHS.map((months) => {
    const amount = limits ? planTermPrice(limits, months) : null;
    return {
      value: months,
      label:
        amount == null
          ? t('assign.termOptionNoPrice', { months })
          : t('assign.termOptionPriced', { months, amount: fmt.money(amount) }),
    };
  });

  function submit() {
    // Enter vẫn gửi form khi nút đang quay — chặn lượt thứ hai.
    if (assign.isPending) return;
    if (!planId) {
      message.warning(t('assign.selectFirst'));
      return;
    }
    assign.mutate(
      {
        planId,
        termMonths,
        ...(price == null ? {} : { price: String(price) }),
        timing,
      },
      {
        onSuccess: () => {
          message.success(t(`assign.success.${kind ?? SUBSCRIPTION_ASSIGN_KIND.ASSIGN}`));
          close();
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  }

  const tailEnd = paidTail ? fmt.date(paidTail.endsAt) : '';

  return (
    <ResponsiveDialog
      title={allPaidLive.length > 0 ? t('assign.titleRenew') : t('assign.title')}
      open={open}
      onClose={close}
      footer={null}
    >
      {plans.isLoading ? (
        <div className={styles.center}>
          <Spin />
        </div>
      ) : (plans.data?.length ?? 0) === 0 ? (
        <div className={styles.empty}>{t('assign.empty')}</div>
      ) : (
        <div className={styles.assignBody}>
          {/* Mọi kỳ trả phí còn hạn, mỗi phạm vi một dòng — gán theo phạm vi nên cần thấy cả hai. */}
          {sortByScope(allPaidLive).map((term) => (
            <div key={term.id} className={styles.contextLine}>
              {t('assign.scopeContext', {
                scope: t(`scope.${planVehicleScopeOf(term.vehicleScope)}`),
                plan: term.planName,
                date: fmt.date(term.endsAt),
              })}
            </div>
          ))}

          <label className={styles.field}>
            <span className={styles.fieldLabel}>{t('assign.plan')}</span>
            <Select
              className={styles.planSelect}
              size="large"
              placeholder={t('assign.selectPlaceholder')}
              value={planId}
              options={options}
              onChange={selectPlan}
            />
          </label>

          {selected ? (
            <>
              <div className={styles.fieldRow}>
                <label className={styles.field}>
                  <span className={styles.fieldLabel}>{t('assign.term')}</span>
                  <Select<SubscriptionTermMonths>
                    value={termMonths}
                    options={termOptions}
                    onChange={setTermMonths}
                  />
                </label>
                {isPackage ? (
                  <label className={styles.field}>
                    <span className={styles.fieldLabel}>{t('assign.price')}</span>
                    <MoneyInput
                      min={0}
                      value={price}
                      placeholder={
                        listed == null
                          ? t('assign.pricePlaceholderRequired')
                          : // Giá niêm yết làm gợi ý; ô đã có hậu tố ₫ riêng.
                            formatMoneyInput(wholeUnits(listed))
                      }
                      onChange={(value) => setPrice(value ?? null)}
                    />
                  </label>
                ) : null}
              </div>
              {isPackage ? (
                <div className={styles.help}>
                  {isDraft
                    ? t('assign.priceRequiredDraftHelp')
                    : priceRequired
                      ? t('assign.priceRequiredHelp')
                      : t('assign.priceHelp')}
                </div>
              ) : null}

              {enterpriseSelected ? (
                <div className={styles.help}>{t('assign.enterpriseNote')}</div>
              ) : null}

              {paidTail ? (
                <div className={styles.field}>
                  <span className={styles.fieldLabel}>{t('assign.timing')}</span>
                  <Radio.Group
                    className={styles.timing}
                    value={timing}
                    onChange={(event) => setTiming(event.target.value as SubscriptionChangeTiming)}
                  >
                    <Radio value={SUBSCRIPTION_CHANGE_TIMING.NEXT_TERM}>
                      <span className={styles.timingTitle}>
                        {t('assign.timingNext', { date: tailEnd })}
                      </span>
                      <span className={styles.help}>{t('assign.timingNextHelp')}</span>
                    </Radio>
                    <Radio value={SUBSCRIPTION_CHANGE_TIMING.NOW}>
                      <span className={styles.timingTitle}>{t('assign.timingNow')}</span>
                      <span className={styles.help}>
                        {t('assign.timingNowHelp', { count: paidLive.length })}
                      </span>
                    </Radio>
                  </Radio.Group>
                </div>
              ) : null}
            </>
          ) : null}

          {preview && kind ? (
            <div
              className={cx(
                styles.preview,
                kind === SUBSCRIPTION_ASSIGN_KIND.CHANGE_NOW && styles.previewWarn,
              )}
            >
              <div className={styles.previewKind}>{t(`assign.kind.${kind}`)}</div>
              <div>
                {t(`assign.kindBody.${kind}`, {
                  plan: selected?.name ?? '',
                  current: chain?.previous?.planName ?? paidTail?.planName ?? '',
                  date: tailEnd,
                  count: replacedCount,
                })}
              </div>
              <dl className={styles.previewFacts}>
                <dt>{t('assign.previewPeriod')}</dt>
                <dd>
                  {t('period', {
                    from: fmt.date(preview.starts.toISOString()),
                    to: fmt.date(preview.ends.toISOString()),
                  })}
                </dd>
                <dt>{t('assign.previewTotal')}</dt>
                <dd>
                  {effectiveTotal != null
                    ? fmt.money(String(effectiveTotal))
                    : t('assign.previewNeedsPrice')}
                </dd>
                {limits && isPackage ? (
                  <>
                    <dt>{t('assign.previewQuota')}</dt>
                    <dd>
                      {t(`quotaScoped.${selectedScope ?? PLAN_VEHICLE_SCOPE.ALL}`, {
                        vehicles:
                          limits.maxVehicles == null
                            ? t('assign.unlimited')
                            : String(limits.maxVehicles),
                      })}
                    </dd>
                  </>
                ) : null}
              </dl>
            </div>
          ) : null}

          <div className={styles.actions}>
            <Button onClick={close}>{tCommon('actions.close')}</Button>
            <Button
              type="primary"
              danger={kind === SUBSCRIPTION_ASSIGN_KIND.CHANGE_NOW}
              loading={assign.isPending}
              disabled={!selected || (priceRequired && price == null)}
              onClick={submit}
            >
              {t(`assign.submit.${kind ?? SUBSCRIPTION_ASSIGN_KIND.ASSIGN}`)}
            </Button>
          </div>
        </div>
      )}
    </ResponsiveDialog>
  );
}
