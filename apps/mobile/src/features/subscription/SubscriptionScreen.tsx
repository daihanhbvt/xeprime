import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  BILLING_MODE,
  PERMISSION,
  SUBSCRIPTION_INVOICE_STATUS,
  SUBSCRIPTION_INVOICE_STATUS_META,
  STATUS_COLOR,
  type SubscriptionInvoiceStatus,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Divider } from '@/components/ui/DataRow';
import { Pagination } from '@/components/ui/Pagination';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import {
  INVOICES_DEFAULT_LIMIT,
  type SlotUsage,
  type SubscriptionInvoice,
} from '@/api/subscription/api';
import { InvoicePaymentPanel } from './components/InvoicePaymentPanel';
import { PlanFeatureList } from './components/PlanFeatureList';
import { PurchaseSheet } from './components/PurchaseSheet';
import { useMySubscription, useSubscriptionInvoices } from './hooks/use-subscription';

/**
 * "Gói của tôi" (W2, ADR 0015/0026) — bản native của `/manage/subscription`.
 *
 * Cùng THỨ TỰ KHỐI với web: gói hiện hành → chỗ xe đang dùng → lượt miễn phí → tính năng theo gói
 * → hoá đơn đang chờ chuyển khoản → lịch sử hoá đơn.
 *
 * Người dùng KHÔNG được bất ngờ ở đơn thứ ba — lượt miễn phí và điều gì xảy ra khi hết đứng ngay
 * đầu màn, trước cả lịch sử hoá đơn.
 *
 * Quyền XEM gác ở đây (`SUBSCRIPTION_VIEW`, cùng quyền mà mục menu mang); quyền MUA
 * (`SUBSCRIPTION_PURCHASE`) chỉ backend kiểm — ẩn nút không phải lớp chặn (CLAUDE.md §6).
 */
export function SubscriptionScreen() {
  const t = useTranslations('Subscription');
  const tPermission = useTranslations('ManageCommon.permission');
  const permissions = usePermissions();

  const [page, setPage] = useState(1);
  const [purchaseOpen, setPurchaseOpen] = useState(false);

  const canView = permissions.has(PERMISSION.SUBSCRIPTION_VIEW);
  const me = useMySubscription(canView);
  const invoices = useSubscriptionInvoices(page, canView);

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManageHeader />
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
        <ManageHeader />
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
        <ManageHeader />
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

  const { currentPlan, usage, freeTrips } = me.data;

  /*
   * Hoá đơn đang chờ tiền — mỗi gian hàng chỉ giữ MỘT (lệnh mua void hoá đơn `issued` cũ trong
   * cùng transaction) và nó luôn mới nhất, nên tìm trong trang hiện tại là đủ: rời trang 1 thì
   * khối tự ẩn, quay lại trang 1 là thấy. Đây là đường quay lại QR sau khi đóng tấm mua.
   */
  const pendingInvoice = invoices.data?.items.find(
    (inv) =>
      inv.status === SUBSCRIPTION_INVOICE_STATUS.ISSUED ||
      inv.status === SUBSCRIPTION_INVOICE_STATUS.PARTIALLY_PAID,
  );

  const total = invoices.data?.meta?.total ?? 0;

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']}>
        <ManagePageTitle title={t('page.title')} />

        <YStack gap={space.md}>
          <CurrentPlanCard plan={currentPlan} onPurchase={() => setPurchaseOpen(true)} />

          <Card>
            <YStack gap={space.md}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                {t('usage.title')}
              </Text>
              <UsageRow label={t('usage.car')} usage={usage.car} />
              <UsageRow label={t('usage.motorbike')} usage={usage.motorbike} />
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

          {/* "Nâng cấp được thêm gì" — ADR 0027 §Hệ quả: chỗ bán hàng thật sự của màn này. */}
          <PlanFeatureList onUpgrade={() => setPurchaseOpen(true)} />

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
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('invoices.empty')}
              </Text>
            ) : (
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
            )}
          </YStack>
        </YStack>
      </Screen>

      <PurchaseSheet open={purchaseOpen} onClose={() => setPurchaseOpen(false)} />
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
  onPurchase,
}: {
  plan: NonNullable<ReturnType<typeof useMySubscription>['data']>['currentPlan'];
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

            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('current.expires', { date: fmt.date(plan.endsAt) })}
              {plan.slots
                ? `${LIST_SEPARATOR}${t('current.slotsSummary', {
                    car: plan.slots.car,
                    motorbike: plan.slots.motorbike,
                  })}`
                : ''}
            </Text>

            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {isCommission
                ? t('current.commissionSummary', { percent: plan.commissionPercent ?? 0 })
                : t('current.packageSummary')}
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

        <Button
          label={plan ? t('current.renewButton') : t('current.purchaseButton')}
          onPress={onPurchase}
        />
      </YStack>
    </Card>
  );
}

/** Một dòng mức dùng chỗ: đội xe / trên chợ so với hạn mức (`null` = không giới hạn). */
function UsageRow({ label, usage }: { label: string; usage: SlotUsage }) {
  const t = useTranslations('Subscription');
  const limit = usage.limit;
  const full = limit != null && usage.used >= limit;

  return (
    <YStack gap={space.xs}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {label}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {limit == null
            ? `${usage.used}${LIST_SEPARATOR}${t('usage.unlimited')}`
            : t('usage.ofLimit', { used: usage.used, limit })}
        </Text>
      </XStack>

      {/* Không có hạn mức thì không có gì để vẽ — một thanh đầy 100% ở đó là nói sai. */}
      {limit != null && limit > 0 ? (
        <ProgressBar
          percent={Math.min(100, Math.round((usage.used / limit) * 100))}
          /* `exception` là đúng tông web dùng khi chạm trần (`status="exception"`). */
          tone={full ? 'exception' : 'active'}
          size="sm"
          label={label}
        />
      ) : null}

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

  const meta = SUBSCRIPTION_INVOICE_STATUS_META[invoice.status as SubscriptionInvoiceStatus];

  return (
    <Card>
      <YStack gap={space.xs}>
        <XStack ai="center" gap={space.sm}>
          <Text f={1} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
            {invoice.code}
          </Text>
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
