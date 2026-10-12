import { Ionicons } from '@expo/vector-icons';
import type { Href } from 'expo-router';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BILLING_PHASE,
  HOST_METRIC_WINDOW_DAYS,
  MARKETPLACE_VISIBILITY_REASON_META,
  PERMISSION,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  WALLET_STATUS,
  type HostMetrics as HostMetricsShape,
} from '@xeprime/types';
import { MONTH_PARAM_FORMAT, dayjs, nowInAppTz } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { InlineAction } from '@/components/ui/InlineAction';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { HostMetrics } from '@/features/marketplace/components/HostMetrics';
import { useMySubscription } from '@/features/subscription/hooks/use-subscription';
import { VEHICLE_SORT } from '@/features/vehicles/vehicle-sort';
import { useVehiclesPage } from '@/features/vehicles/hooks/use-vehicles';
import type { VehicleListItem } from '@/features/vehicles/api';
import { useWalletStatement, useWalletSummary } from '@/features/wallet/hooks/use-wallet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { PartnerOverviewMarket } from '../api';
import { PLAN_RENEW_WARNING_DAYS, daysUntil } from '../dashboard-model';
import type { DashboardLinks } from '../hooks/use-dashboard';
import { DashboardPanel } from './DashboardPanel';

/** Thân khối chuẩn — lề đều với các khối khác của Tổng quan. */
function Body({ children }: { children: React.ReactNode }) {
  return (
    <YStack px={space.md} py={space.md} gap={space.sm}>
      {children}
    </YStack>
  );
}

function Note({ text, warn = false }: { text: string; warn?: boolean }) {
  return (
    <Text col={warn ? colors.danger : colors.textMuted} fos={fontSize.label}>
      {text}
    </Text>
  );
}

// ── Xe trên chợ ─────────────────────────────────────────────────────────────────────────────────

/**
 * Xe trên chợ — bản native của `MarketPanel` bên web. Bốn dòng của vòng đời công khai; "Cần sửa"
 * nổi màu khi có việc. Mỗi dòng mở Đội xe lọc sẵn theo trạng thái công khai của dòng, như web.
 */
export function MarketPanel({
  market,
  links,
}: {
  market: PartnerOverviewMarket | undefined;
  links: DashboardLinks;
}) {
  const t = useTranslations('Dashboard.market');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const canCreate = has(PERMISSION.VEHICLE_CREATE);
  const total = market ? market.onMarket + market.inReview + market.needsRevision + market.draft : 0;

  const rows = market
    ? [
        {
          key: 'onMarket',
          label: t('onMarket'),
          count: market.onMarket,
          dot: colors.success,
          warn: false,
          href: links.vehicles,
        },
        {
          key: 'needsRevision',
          label: t('needsRevision'),
          count: market.needsRevision,
          dot: market.needsRevision > 0 ? colors.warning : colors.border,
          warn: market.needsRevision > 0,
          href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.NEEDS_REVISION),
        },
        {
          key: 'inReview',
          label: t('inReview'),
          count: market.inReview,
          dot: colors.border,
          warn: false,
          href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW),
        },
        {
          key: 'draft',
          label: t('draft'),
          count: market.draft,
          dot: colors.border,
          warn: false,
          href: links.vehiclesByPublicStatus(VEHICLE_PUBLIC_STATUS.DRAFT),
        },
      ]
    : [];

  return (
    <DashboardPanel
      title={t('title')}
      icon="storefront"
      tone="primary"
      loading={!market}
      action={{ label: t('manage'), onPress: () => navigateOnce(links.vehicles) }}
    >
      {market ? (
        <Body>
          {total === 0 ? (
            <>
              <Note text={t('empty')} />
              {canCreate ? (
                <Button label={t('add')} icon="add" onPress={() => navigateOnce(links.vehicleNew)} />
              ) : null}
            </>
          ) : (
            <>
              {rows.map((row) => (
                <Pressable
                  key={row.key}
                  onPress={() => navigateOnce(row.href)}
                  accessibilityRole="button"
                  accessibilityLabel={`${row.label}: ${fmt.count(row.count)}`}
                >
                  <XStack ai="center" gap={space.sm} py={2}>
                    <YStack w={8} h={8} br={radius.pill} bg={row.dot} />
                    <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                      {row.label}
                    </Text>
                    <Text
                      col={row.warn ? colors.warning : colors.text}
                      fos={fontSize.bodySm}
                      fow={fontWeight.bold}
                    >
                      {fmt.count(row.count)}
                    </Text>
                  </XStack>
                </Pressable>
              ))}
            </>
          )}
        </Body>
      ) : null}
    </DashboardPanel>
  );
}

// ── Gói dịch vụ ─────────────────────────────────────────────────────────────────────────────────

/**
 * Gói dịch vụ — bản native của `PlanPanel` bên web: tên gói, còn bao nhiêu ngày (hoặc đang ân
 * hạn), số xe đã dùng trên trần. Sắp hết hạn + có `subscription.purchase` ⇒ nút "Gia hạn gói".
 * Nơi gọi chỉ dựng khối này khi có `subscription.view`.
 */
export function PlanPanel({ href }: { href: Href }) {
  const t = useTranslations('Dashboard.plan');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const { data: user } = useCurrentUser();
  const { data, isPending, isError, refetch } = useMySubscription();

  const plan = data?.currentPlan ?? null;
  const quota = data?.fleetQuota;
  const inGrace = user?.tenant?.billingPhase === BILLING_PHASE.GRACE;
  const daysLeft = plan ? daysUntil(plan.endsAt, dayjs()) : null;
  const expiring = inGrace || (daysLeft !== null && daysLeft <= PLAN_RENEW_WARNING_DAYS);
  const canRenew = has(PERMISSION.SUBSCRIPTION_PURCHASE);

  const limit = quota?.kind === 'total' ? quota.totalLimit : null;
  const used = quota?.totalUsed ?? 0;
  const atCapacity = limit !== null && used >= limit;
  const graceEndsAt = user?.tenant?.graceEndsAt;

  return (
    <DashboardPanel
      title={t('title')}
      icon="ribbon"
      tone="warning"
      loading={isPending}
      error={isError && !data}
      onRetry={() => void refetch()}
    >
      {data ? (
        <Body>
          {!plan ? (
            <Note text={t('none')} />
          ) : (
            <>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                {plan.planName}
              </Text>
              <Text
                col={expiring ? colors.danger : colors.textMuted}
                fos={fontSize.label}
                fow={expiring ? fontWeight.semibold : fontWeight.regular}
              >
                {inGrace && graceEndsAt
                  ? t('grace', { date: fmt.date(graceEndsAt) })
                  : `${t('daysLeft', { count: Math.max(0, daysLeft ?? 0) })} · ${t('endsAt', {
                      date: fmt.date(plan.endsAt),
                    })}`}
              </Text>
              <XStack ai="center" jc="space-between">
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('vehicles')}
                </Text>
                <Text col={colors.text} fos={fontSize.label} fow={fontWeight.semibold}>
                  {limit === null ? t('vehiclesUnlimited', { used }) : t('vehiclesValue', { used, limit })}
                </Text>
              </XStack>
              {limit !== null ? (
                <ProgressBar
                  size="sm"
                  percent={limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100}
                  tone={atCapacity ? 'exception' : 'active'}
                />
              ) : null}
              {atCapacity ? <Note text={t('atCapacity')} warn /> : null}
              {expiring && canRenew ? (
                <Button label={t('renew')} onPress={() => navigateOnce(href)} />
              ) : (
                <InlineAction label={t('open')} onPress={() => navigateOnce(href)} />
              )}
            </>
          )}
        </Body>
      ) : null}
    </DashboardPanel>
  );
}

// ── Uy tín ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Uy tín với khách — đúng ba chỉ số khách thấy trên chợ (`HostMetricsService`, ADR 0045), dựng
 * bằng CHÍNH component `HostMetrics` của trang gian hàng: ngưỡng mẫu và `null` ≠ 0 đi theo nó.
 */
export function ReputationPanel({ metrics }: { metrics: HostMetricsShape | undefined }) {
  const t = useTranslations('Dashboard.reputation');
  return (
    <DashboardPanel
      title={t('title')}
      icon="shield-checkmark"
      tone="success"
      extra={t('window', { days: HOST_METRIC_WINDOW_DAYS })}
      loading={!metrics}
    >
      {metrics ? (
        <Body>
          <HostMetrics metrics={metrics} />
          <Note text={t('note')} />
        </Body>
      ) : null}
    </DashboardPanel>
  );
}

// ── Tiền của bạn (sổ ví) ────────────────────────────────────────────────────────────────────────

/**
 * Tiền của bạn — bản native của `WalletPanel` bên web. CHỈ chủ gian hàng (`@ShopOwnerOnly`, ADR
 * 0038 điều 3) — nơi gọi quyết. `showIncome` (tuyến hoa hồng): thu nhập THÁNG NÀY từ bảng tổng
 * hợp giao dịch — đúng con số chủ xe thấy ở trang số dư. Tuyến gói đọc tiền ở sổ thu chi.
 */
export function WalletPanel({ showIncome, href }: { showIncome: boolean; href: Href }) {
  const t = useTranslations('Dashboard.wallet');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const summary = useWalletSummary('shop');
  const statement = useWalletStatement(
    { period: nowInAppTz().format(MONTH_PARAM_FORMAT), page: 1 },
    showIncome,
  );
  const data = summary.data;

  return (
    <DashboardPanel
      title={t('title')}
      icon="wallet"
      tone="primary"
      loading={summary.isPending}
      error={summary.isError && !data}
      onRetry={() => void summary.refetch()}
      action={{ label: t('open'), onPress: () => navigateOnce(href) }}
    >
      {data ? (
        <Body>
          {showIncome ? (
            <YStack gap={2}>
              <Note text={t('income')} />
              {statement.data ? (
                <>
                  <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold}>
                    {fmt.money(statement.data.totals.ownerIncome)}
                  </Text>
                  <Note text={t('incomeHint', { count: statement.data.stats.completedTripCount })} />
                </>
              ) : statement.isError ? (
                <Note text={t('loadError')} warn />
              ) : (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  …
                </Text>
              )}
            </YStack>
          ) : null}
          <XStack gap={space.md}>
            <YStack f={1} gap={2}>
              <Note text={t('available')} />
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                {fmt.money(data.available)}
              </Text>
            </YStack>
            <YStack f={1} gap={2}>
              <Note text={t('pending')} />
              <Text col={colors.text} fos={fontSize.body}>
                {fmt.money(data.pending)}
              </Text>
            </YStack>
          </XStack>
          {data.status === WALLET_STATUS.FROZEN ? <Note text={t('frozen')} warn /> : null}
        </Body>
      ) : null}
    </DashboardPanel>
  );
}

// ── Xe của bạn (chủ xe tuyến hoa hồng) ─────────────────────────────────────────────────────────

/** Số xe xem trước — chủ xe cá nhân có 1–3 xe, năm dòng là đủ mà không thành danh sách xe thứ hai. */
const OWNER_VEHICLE_PREVIEW = 5;
const THUMB = 44;

/**
 * Xe của bạn — bản native của `OwnerVehiclesPanel` bên web: xe mới nhất kèm trạng thái chợ + vận
 * hành, mức dùng trần xe của Owner Lite, và lời mời mở gian hàng khi chạm trần.
 */
export function OwnerVehiclesPanel({ links }: { links: DashboardLinks }) {
  const t = useTranslations('Dashboard.ownerVehicles');
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const vehicles = useVehiclesPage({ page: 1, limit: OWNER_VEHICLE_PREVIEW, sort: VEHICLE_SORT.NEWEST });
  const subscription = useMySubscription(has(PERMISSION.SUBSCRIPTION_VIEW));

  const quota = subscription.data?.fleetQuota;
  const limit = quota?.kind === 'total' ? quota.totalLimit : null;
  const used = quota?.totalUsed ?? vehicles.data?.meta.total ?? 0;
  const atCapacity = limit !== null && used >= limit;
  const canCreate = has(PERMISSION.VEHICLE_CREATE) && !atCapacity;
  const items = vehicles.data?.items ?? [];
  const total = vehicles.data?.meta.total ?? 0;

  return (
    <DashboardPanel
      title={t('title')}
      icon="car-sport"
      tone="info"
      extra={limit !== null ? t('quota', { used, limit }) : undefined}
      loading={vehicles.isPending}
      error={vehicles.isError && !vehicles.data}
      onRetry={() => void vehicles.refetch()}
      action={total > 0 ? { label: t('viewAll'), onPress: () => navigateOnce(links.vehicles) } : undefined}
    >
      {vehicles.data ? (
        <Body>
          {items.length === 0 ? (
            <Note text={t('empty')} />
          ) : (
            items.map((vehicle) => (
              <OwnerVehicleRow
                key={vehicle.id}
                vehicle={vehicle}
                onPress={() => navigateOnce(links.vehicle(vehicle.id))}
              />
            ))
          )}
          {atCapacity ? (
            <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.warningSurface}>
              <Text col={colors.text} fos={fontSize.label}>
                {t('atCapacity', { limit: limit ?? 0 })}
              </Text>
              <InlineAction label={t('upgrade')} onPress={() => navigateOnce(links.subscription)} />
            </YStack>
          ) : null}
          {canCreate ? (
            <Button
              label={t('add')}
              icon="add"
              variant="secondary"
              onPress={() => navigateOnce(links.vehicleNew)}
            />
          ) : null}
        </Body>
      ) : null}
    </DashboardPanel>
  );
}

function OwnerVehicleRow({ vehicle, onPress }: { vehicle: VehicleListItem; onPress: () => void }) {
  const domainLabel = useDomainLabel();
  const approved = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const market = approved
    ? {
        label: domainLabel(
          'marketplaceVisibility',
          vehicle.marketplaceVisibilityReason,
          MARKETPLACE_VISIBILITY_REASON_META[vehicle.marketplaceVisibilityReason].label,
        ),
        color: MARKETPLACE_VISIBILITY_REASON_META[vehicle.marketplaceVisibilityReason].color,
      }
    : {
        label: domainLabel(
          'vehiclePublicStatus',
          vehicle.publicStatus,
          VEHICLE_PUBLIC_STATUS_META[vehicle.publicStatus].label,
        ),
        color: VEHICLE_PUBLIC_STATUS_META[vehicle.publicStatus].color,
      };
  const operation = VEHICLE_OPERATION_STATUS_META[vehicle.operationStatus];

  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={vehicle.name}
      style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
    >
      <XStack ai="center" gap={space.sm}>
        <YStack w={THUMB} h={THUMB} br={radius.sm} overflow="hidden" bg={colors.surfaceMuted}>
          <RemoteImage
            uri={vehicle.mainImageUrl}
            radius={radius.sm}
            fallback={
              <YStack f={1} ai="center" jc="center">
                <Ionicons name="car-outline" size={iconSize.md} color={colors.textMuted} />
              </YStack>
            }
          />
        </YStack>
        <YStack f={1} gap={4}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold} numberOfLines={1}>
            {vehicle.name}
            {vehicle.plateNumber ? (
              <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.regular}>
                {`  ${vehicle.plateNumber}`}
              </Text>
            ) : null}
          </Text>
          <XStack gap={space.xs} flexWrap="wrap">
            <StatusBadge label={market.label} color={market.color} size="sm" />
            <StatusBadge
              label={domainLabel('vehicleOperationStatus', vehicle.operationStatus, operation.label)}
              color={operation.color}
              size="sm"
            />
          </XStack>
        </YStack>
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
      </XStack>
    </Pressable>
  );
}
