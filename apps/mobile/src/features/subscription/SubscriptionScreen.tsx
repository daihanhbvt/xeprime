import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  BILLING_MODE,
  BILLING_PHASE,
  PERMISSION,
  SUBSCRIPTION_INVOICE_STATUS_META,
  STATUS_COLOR,
  type BillingPhase,
  type SubscriptionInvoiceStatus,
} from '@xeprime/types';
import { nowInAppTz, toAppTz } from '@xeprime/domain';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { IconButton } from '@/components/ui/IconButton';
import { Pagination } from '@/components/ui/Pagination';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import type { ReactNode } from 'react';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useCopy } from '@/hooks/use-copy';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  INVOICES_DEFAULT_LIMIT,
  type MySubscription,
  type SlotUsage,
  type SubscriptionInvoice,
} from '@/api/subscription/api';
import { InvoicePaymentPanel } from './components/InvoicePaymentPanel';
import { PlanFeatureList } from './components/PlanFeatureList';
import { PurchaseSheet } from './components/PurchaseSheet';
import {
  useMySubscription,
  usePendingInvoice,
  useSubscriptionInvoices,
} from './hooks/use-subscription';

/**
 * "Gói của tôi" (W2, ADR 0015/0026) — bản native của `/manage/subscription`.
 *
 * Cùng THỨ TỰ KHỐI với web: gói hiện hành → chỗ xe đang dùng → lượt miễn phí → tính năng theo gói
 * → hoá đơn đang chờ chuyển khoản → lịch sử hoá đơn.
 *
 * Người dùng KHÔNG được bất ngờ ở đơn thứ ba — lượt miễn phí và điều gì xảy ra khi hết đứng ngay
 * đầu màn, trước cả lịch sử hoá đơn.
 *
 * ## Hai quyền, hai việc
 *
 * `subscription.view` cho XEM gói và hạn mức — `shop_manager` có, vì điều hành đội xe cần biết
 * còn bao nhiêu chỗ. `subscription.purchase` cho MUA/gia hạn thì mặc định chỉ chủ gian hàng có
 * (`rbac.ts`), và API đã chặn. Giao diện phải khớp: thiếu quyền thì KHÔNG có lối nào dẫn vào
 * luồng đó, và `PurchaseSheet` KHÔNG được dựng trong cây — một tấm trượt treo sẵn là một đường
 * vào mà API sẽ từ chối ở bước cuối. Ẩn nút vẫn không phải lớp chặn (CLAUDE.md §6); chặn thật ở
 * server, đây chỉ là không mời người dùng đi vào ngõ cụt.
 */
/**
 * `header` — VỎ điều hướng của khu đang đứng.
 *
 * Cùng màn phục vụ hai khu: khu quản lý (`/manage/subscription`) và khu khách
 * (`/account/subscription` — chủ xe tuyến hoa hồng KHÔNG vào khu quản lý được, ADR 0038 điều 4).
 * Mặc định là đầu trang khu quản lý, nơi màn này ra đời; để nguyên mặc định ở khu khách thì người
 * dùng thấy đầu trang của một khu họ không thuộc về, và không có đường lui.
 */
/** Dưới ngưỡng này thì ô thời hạn đổi sang sắc cảnh báo — cùng mốc web dùng. */
const TERM_WARNING_DAYS = 7;

export function SubscriptionScreen({ header }: { header?: ReactNode } = {}) {
  const shell = header ?? <ManageHeader />;
  const t = useTranslations('Subscription');
  const tPermission = useTranslations('ManageCommon.permission');
  const permissions = usePermissions();

  const [page, setPage] = useState(1);
  const [purchaseOpen, setPurchaseOpen] = useState(false);
  /*
   * Lịch sử GẬP LẠI mặc định, đúng như web: người ta mở nó vài tháng một lần, thường để tìm một
   * mã cụ thể. Thứ đứng trước phải là VIỆC PHẢI LÀM (hoá đơn đang chờ tiền) — một gian hàng có
   * hoá đơn quá hạn mà nhìn chủ yếu thấy một danh sách cũ thì màn này sắp thứ tự sai.
   */
  const [historyOpen, setHistoryOpen] = useState(false);

  const canView = permissions.has(PERMISSION.SUBSCRIPTION_VIEW);
  const canPurchase = permissions.has(PERMISSION.SUBSCRIPTION_PURCHASE);
  const me = useMySubscription(canView);
  const invoices = useSubscriptionInvoices(page, canView);
  /*
   * Hoá đơn đang chờ tiền đi qua BỀ MẶT RIÊNG (`GET /subscription/invoices/pending`), không phải
   * phép dò trong trang hoá đơn đang mở.
   *
   * Hai lý do, và cả hai đều là tiền: (1) lật sang trang 2 thì khối QR biến mất, trong khi khoản
   * tiền đó vẫn đang chờ; (2) bề mặt riêng tự hỏi lại theo nhịp và dừng khi hoá đơn tới trạng thái
   * kết, nên người dùng chuyển khoản xong quay lại app là thấy gói đã bật — không phải tự kéo làm
   * mới và đoán xem tiền đã về chưa (ADR 0022).
   */
  const pending = usePendingInvoice(canView);

  if (!permissions.isLoading && !canView) {
    return (
      <>
        {shell}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tPermission('deniedTitle')}
            description={`${tPermission('deniedBody')}\n${tPermission('requires')} ${PERMISSION.SUBSCRIPTION_VIEW}`}
          />
        </Screen>
      </>
    );
  }

  if (me.isLoading) {
    return (
      <>
        {shell}
        <Screen edges={['left', 'right', 'bottom']}>
          <ManagePageTitle title={t('page.title')} />
          <MiniRowsSkeleton rows={6} />
        </Screen>
      </>
    );
  }

  if (me.isError || !me.data) {
    return (
      <>
        {shell}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={me.error}
            title={t('page.loadError')}
            onRetry={() => void me.refetch()}
          />
        </Screen>
      </>
    );
  }

  const { currentPlan, usage, fleetQuota, freeTrips } = me.data;
  const pendingInvoice = pending.data ?? undefined;
  const total = invoices.data?.meta?.total ?? 0;

  return (
    <>
      {shell}
      <Screen edges={['left', 'right', 'bottom']}>
        <ManagePageTitle title={t('page.title')} />

        <YStack gap={space.md}>
          <CurrentPlanCard
            plan={currentPlan}
            canPurchase={canPurchase}
            onPurchase={() => setPurchaseOpen(true)}
          />

          <Card>
            <YStack gap={space.md}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                {t('usage.title')}
              </Text>
              {/*
                MỘT dòng trần cho cả đội xe (ADR 0041 điều 4) — cả hai tuyến nay đếm TỔNG ô tô +
                xe máy. Hai dòng theo loại bên dưới chỉ nói MỨC DÙNG, không mang trần nào: viết
                trần tổng vào dòng của từng loại là màn hình nói "3 ô tô" trong khi backend chặn ở
                "3 xe", và chủ xe sẽ đăng đủ 3 ô tô rồi ngạc nhiên vì chiếc xe máy đầu tiên bị từ
                chối.
              */}
              <FleetTotalRow used={fleetQuota.totalUsed} limit={fleetQuota.totalLimit ?? null} />
              <UsageRow label={t('usage.car')} usage={usage.car} />
              <UsageRow label={t('usage.motorbike')} usage={usage.motorbike} />

              {/* Còn bao lâu nữa hết hạn — con số thứ ba của web, và là thứ quyết định gia hạn. */}
              {currentPlan ? <TermRow endsAt={currentPlan.endsAt} /> : null}

              <QuotaWarning fleetQuota={fleetQuota} />
            </YStack>
          </Card>

          <Card>
            <YStack gap={space.xs}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                {t('freeTrips.title')}
              </Text>
              <Text col={colors.price} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                {t('freeTrips.left', { left: freeTrips.left })}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('freeTrips.used', { used: freeTrips.used, allowance: freeTrips.allowance })}
              </Text>
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('freeTrips.explain')}
              </Text>
            </YStack>
          </Card>

          {/*
            "Nâng cấp được thêm gì" — ADR 0027 §Hệ quả: chỗ bán hàng thật sự của màn này. Tự biến
            mất khi không còn tính năng nào bị khoá, và không mời bấm khi thiếu quyền mua.
          */}
          <PlanFeatureList {...(canPurchase ? { onUpgrade: () => setPurchaseOpen(true) } : {})} />

          {pendingInvoice ? (
            <Card>
              <YStack gap={space.md}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('payment.pendingTitle')}
                </Text>
                <InvoicePaymentPanel invoice={pendingInvoice} />
              </YStack>
            </Card>
          ) : null}

          <YStack gap={space.sm}>
            <BlockTitle>{t('invoices.title')}</BlockTitle>

            {invoices.isLoading ? (
              <MiniRowsSkeleton rows={3} />
            ) : invoices.isError && !invoices.data ? (
              <ScreenError
                error={invoices.error}
                title={t('invoices.loadError')}
                onRetry={() => void invoices.refetch()}
              />
            ) : (invoices.data?.items.length ?? 0) === 0 ? (
              /*
                Chỗ trống nói ĐỦ HAI Ý: chưa có gì, và bao giờ thì có. Một dòng "chưa phát sinh
                hoá đơn" trơ trọi để người dùng tự đoán mình có đang thiếu thao tác nào không.
              */
              <YStack gap={2}>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('invoices.empty')}
                </Text>
                <Text col={colors.placeholder} fos={fontSize.label}>
                  {t('invoices.emptyHint')}
                </Text>
              </YStack>
            ) : historyOpen ? (
              <>
                {(invoices.data?.items ?? []).map((invoice) => (
                  <InvoiceRow key={invoice.id} invoice={invoice} />
                ))}
                {total > INVOICES_DEFAULT_LIMIT ? (
                  <Pagination
                    page={page}
                    limit={INVOICES_DEFAULT_LIMIT}
                    total={total}
                    onChange={setPage}
                  />
                ) : null}
              </>
            ) : (
              <Button
                label={t('invoices.showHistory')}
                variant="secondary"
                size="sm"
                onPress={() => setHistoryOpen(true)}
              />
            )}
          </YStack>
        </YStack>
      </Screen>

      {/* Thiếu quyền mua ⇒ KHÔNG dựng tấm trượt trong cây, đúng như web. */}
      {canPurchase ? (
        <PurchaseSheet open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
      ) : null}
    </>
  );
}

/**
 * Gói hiện hành — hoặc lời giải thích vì sao CHƯA có gói.
 *
 * "Chưa có gói" KHÔNG phải một trạng thái rỗng: gian hàng đó đang ở tuyến hoa hồng theo chuyến
 * (ADR 0028 điều 1), và họ phải đọc được điều đó ở đúng chỗ họ đi tìm gói của mình.
 */
function CurrentPlanCard({
  plan,
  canPurchase,
  onPurchase,
}: {
  plan: NonNullable<ReturnType<typeof useMySubscription>['data']>['currentPlan'];
  /** Quyền `subscription.purchase`. Thiếu ⇒ KHÔNG dựng nút nào dẫn vào luồng API sẽ chặn. */
  canPurchase: boolean;
  onPurchase: () => void;
}) {
  const t = useTranslations('Subscription');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();

  const isCommission = plan?.billingMode === BILLING_MODE.COMMISSION;

  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('current.title')}
        </Text>

        {plan ? (
          <>
            <XStack ai="center" gap={space.xs} flexWrap="wrap">
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                {plan.planName}
              </Text>
              {plan.billingMode ? (
                <StatusBadge
                  label={domainLabel('billingMode', plan.billingMode)}
                  color={STATUS_COLOR.NEUTRAL}
                  size="sm"
                />
              ) : null}
            </XStack>

            {/*
              Hạn mức đọc từ SNAPSHOT trên dòng thuê bao (`quota`), không xuyên qua bậc gói
              (ADR 0041 điều 3): admin sửa trần của một bậc là quyết định về DANH MỤC, và để nó
              lật hạn mức của gian hàng đang chạy giữa kỳ là đổi điều kiện một hợp đồng đã thu tiền.

              `maxVehicles === null` nghĩa là KHÔNG GIỚI HẠN và phải thắng — đọc nó thành "chưa
              khai" rồi rơi về một con số là sai ở đúng chỗ tốn tiền nhất.
            */}
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('current.expires', { date: fmt.date(plan.endsAt) })}
              {plan.quota
                ? `${LIST_SEPARATOR}${
                    plan.quota.maxVehicles == null
                      ? t('purchase.limitVehiclesUnlimited')
                      : t('purchase.limitVehicles', { count: plan.quota.maxVehicles })
                  }`
                : ''}
            </Text>

            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {isCommission ? t('current.commissionSummary') : t('current.packageSummary')}
            </Text>
          </>
        ) : (
          <>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('current.none')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('current.noneHint')}
            </Text>
          </>
        )}

        {canPurchase ? (
          <Button
            label={plan ? t('current.renewButton') : t('current.purchaseButton')}
            onPress={onPurchase}
          />
        ) : null}
      </YStack>
    </Card>
  );
}

/**
 * Trần TỔNG của tuyến hoa hồng — một con số cho cả ô tô lẫn xe máy.
 *
 * Không có phần "đội xe / trên chợ" như `UsageRow`: trần này chỉ gác điểm TẠO xe, không gác điểm
 * gửi lên chợ (ADR 0038 điều 12), nên một con số "trên chợ" ở đây sẽ gợi ý một hạn mức thứ hai
 * không tồn tại.
 */
function FleetTotalRow({ used, limit }: { used: number; limit: number | null }) {
  const t = useTranslations('Subscription');
  const full = limit != null && used >= limit;

  return (
    <YStack gap={space.xs}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {t('usage.fleetTotal')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {limit == null
            ? `${used}${LIST_SEPARATOR}${t('usage.unlimited')}`
            : t('usage.ofLimit', { used, limit })}
        </Text>
      </XStack>

      {/*
        `limit == null` = KHÔNG giới hạn (bậc doanh nghiệp) ⇒ không vẽ thanh và không nhắc mua
        gói: một thanh 0% cho thứ không có trần là hình ảnh nói ngược với con chữ bên cạnh nó, và
        mời một gian hàng không giới hạn đi mua thêm chỗ là nói sai về hợp đồng của họ.
      */}
      {limit != null && limit > 0 ? (
        <>
          <ProgressBar
            percent={Math.min(100, Math.round((used / limit) * 100))}
            tone={full ? 'exception' : 'active'}
            size="sm"
            label={t('usage.fleetTotal')}
          />
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('usage.fleetTotalHint', { limit })}
          </Text>
        </>
      ) : null}
    </YStack>
  );
}

/**
 * Còn bao nhiêu ngày, hoặc đang ở PHA nào.
 *
 * PHA đọc từ server (`/auth/me`), không suy từ `endsAt` bằng đồng hồ máy: `current` và `grace`
 * có cùng một `endsAt` trong quá khứ nhưng khác nhau ở toàn bộ quyền dùng Manage, và chỉ server
 * biết `graceDays` của gói là bao nhiêu (ADR 0038 điều 1).
 *
 * Số NGÀY thì tính bằng đồng hồ máy, và thế là đủ: nó chỉ để đọc. Máy lệch giờ làm con số lệch một
 * ngày, không làm ai mất tính năng.
 */
function TermRow({ endsAt }: { endsAt: string }) {
  const t = useTranslations('Subscription');
  const { tenant } = useTenantScope();
  const phase = (tenant?.billingPhase ?? null) as BillingPhase | null;
  const daysLeft = toAppTz(endsAt).diff(nowInAppTz(), 'day');

  const lapsed = phase === BILLING_PHASE.LAPSED;
  const grace = phase === BILLING_PHASE.GRACE;
  const urgent = lapsed || grace || daysLeft <= TERM_WARNING_DAYS;

  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {t('term.label')}
      </Text>
      <Text
        col={urgent ? colors.warning : colors.textMuted}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
      >
        {lapsed
          ? t('term.lapsed')
          : grace
            ? t('term.grace')
            : t('term.daysLeft', { days: Math.max(0, daysLeft) })}
      </Text>
    </XStack>
  );
}

/**
 * MỘT dòng cảnh báo khi đã dùng hết chỗ — và chỉ khi đó.
 *
 * Còn chỗ trống thì các dòng hạn mức ở trên đã nói đủ, và một dải "mọi thứ đều ổn" đứng thường
 * trực chỉ dạy người dùng bỏ qua vùng đó.
 */
function QuotaWarning({ fleetQuota }: { fleetQuota: MySubscription['fleetQuota'] }) {
  const t = useTranslations('Subscription');

  /*
   * MỘT trần cho cả đội xe (ADR 0041 điều 4): cả hai tuyến nay đếm TỔNG ô tô + xe máy, nên không
   * còn hai trần theo loại để gộp thành một danh sách.
   */
  const limit = fleetQuota.totalLimit;
  if (limit == null || limit <= 0 || fleetQuota.totalUsed < limit) return null;

  return (
    <Callout tone="warning" title={t('usage.atLimitTotal', { limit })}>
      {/*
        Câu TIẾP THEO tuỳ NGUỒN của trần, không tuỳ tuyến: trần đã trả tiền thì việc cần làm là
        nâng bậc; trần Owner Lite thì là mua gói lần đầu. Hai việc khác nhau, hai câu khác nhau.
      */}
      {fleetQuota.reason === 'plan' ? t('usage.atLimitUpgrade') : t('usage.atLimitBuyPlan')}
    </Callout>
  );
}

/**
 * Một dòng MỨC DÙNG theo loại xe — KHÔNG có trần, nên không có thanh tiến trình.
 *
 * ADR 0041 điều 4 gỡ trần theo loại: trần nay là MỘT con số tổng, và nó có dòng riêng
 * (`FleetTotalRow`) ngay phía trên. Viết trần tổng vào dòng của từng loại là màn hình nói "3 ô tô"
 * trong khi backend chặn ở "3 xe", và chủ xe sẽ đăng đủ 3 ô tô rồi ngạc nhiên vì chiếc xe máy đầu
 * tiên bị từ chối — đúng lỗi mà điều 4 vừa gỡ bỏ.
 *
 * Dòng này vì thế chỉ trả lời "đang có mấy chiếc", tách bạch đội xe với số đang bán trên chợ.
 */
function UsageRow({ label, usage }: { label: string; usage: SlotUsage }) {
  const t = useTranslations('Subscription');

  return (
    <YStack gap={space.xs}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {label}
        </Text>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {usage.used}
        </Text>
      </XStack>

      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('usage.fleet')}: {usage.used}
        {LIST_SEPARATOR}
        {t('usage.onMarketplace')}: {usage.onMarketplace}
      </Text>
    </YStack>
  );
}

/** Một hoá đơn — năm cột của bảng web gập lại thành một thẻ đọc được trên màn hẹp. */
function InvoiceRow({ invoice }: { invoice: SubscriptionInvoice }) {
  const t = useTranslations('Subscription');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const copy = useCopy();

  const meta = SUBSCRIPTION_INVOICE_STATUS_META[invoice.status as SubscriptionInvoiceStatus];

  return (
    <Card>
      <YStack gap={space.xs}>
        <XStack ai="center" gap={space.sm}>
          <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
            {invoice.code}
          </Text>
          {/*
            Mã đối soát là thứ người ta dán vào nội dung chuyển khoản hoặc đọc cho kế toán — gõ
            tay một chuỗi như vậy là một khoản tiền không khớp được.
          */}
          <IconButton
            icon="copy-outline"
            label={t('invoices.copyCode')}
            onPress={() => void copy(invoice.code)}
          />
          <StatusBadge
            label={domainLabel('subscriptionInvoiceStatus', invoice.status, meta?.label)}
            color={meta?.color ?? STATUS_COLOR.NEUTRAL}
            size="sm"
          />
        </XStack>

        <Divider />

        <XStack ai="center" jc="space-between" gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.label}>
            {fmt.date(invoice.periodFrom)} → {fmt.date(invoice.periodTo)}
          </Text>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {fmt.money(invoice.totalAmount)}
          </Text>
        </XStack>

        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('invoices.columns.createdAt')}: {fmt.date(invoice.createdAt)}
        </Text>
      </YStack>
    </Card>
  );
}
