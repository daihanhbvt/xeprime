import CarOutlined from '@ant-design/icons-svg/es/asn/CarOutlined';
import type { Href } from 'expo-router';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { memo, useCallback, useMemo, useState, type ReactNode } from 'react';
import { ImageBackground, Linking, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BILLING_PHASE,
  HOST_METRIC_STATE,
  HOST_METRIC_WINDOW_DAYS,
  MARKETPLACE_VISIBILITY_REASON_META,
  PERMISSION,
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  WALLET_STATUS,
  hostMetricState,
  responseSpeedOf,
  type HostMetrics as HostMetricsShape,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { MONTH_PARAM_FORMAT, dayjs, nowInAppTz } from '@xeprime/domain';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { AntIcon } from '@/components/icons/AntIcon';
import { LineIcon } from '@/components/icons/LineIcon';
import { Button } from '@/components/ui/Button';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { LinkArrow } from '@/components/ui/LinkArrow';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { RemoteImage } from '@/components/ui/RemoteImage';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StackedBar } from '@/components/ui/StackedBar';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { HostMetrics } from '@/features/marketplace/components/HostMetrics';
import { useMySubscription } from '@/features/subscription/hooks/use-subscription';
import { VEHICLE_SORT } from '@/features/vehicles/vehicle-sort';
import { useVehiclesPage } from '@/features/vehicles/hooks/use-vehicles';
import type { VehicleListItem } from '@/features/vehicles/api';
import { canWithdraw } from '@/features/wallet/can-withdraw';
import { WithdrawSheet } from '@/features/wallet/components/WithdrawSheet';
import { useWalletStatement, useWalletSummary } from '@/features/wallet/hooks/use-wallet';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { resolvePartnerPlanUrl } from '@/lib/partner-web-url';
import { elevation } from '@/theme/elevation';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontWeight, gradients, iconSize, market as marketColors, radius, typeScale } from '@/theme/tokens';
import type { PartnerOverviewMarket } from '../api';
import { PLAN_RENEW_WARNING_DAYS, daysUntil } from '../dashboard-model';
import type { DashboardLinks } from '../hooks/use-dashboard';
import { DashboardPanel } from './DashboardPanel';

/*
 * Các khối phụ của Tổng quan, vẽ theo Figma Overview MB (`24175:52345`): thẻ ví, "Đội xe & gói
 * dịch vụ", "Uy tín", "Xe của bạn". Luật hiện / dữ liệu giữ nguyên bản web `SidePanels`.
 */

/** Các phần trong một khối cách 12 - Figma "Nhóm thông tin" `gap 12`. */
const STACK_GAP = 12;

function Stack({ children }: { children: ReactNode }) {
  return <YStack gap={STACK_GAP}>{children}</YStack>;
}

/** Ghi chú 12/18 mờ (hoặc cảnh báo). */
function Note({ text, warn = false }: { text: string; warn?: boolean }) {
  const colors = useColors();
  return (
    <Text
      col={warn ? colors.warning : colors.placeholder}
      fos={typeScale.label.fontSize}
      lh={typeScale.label.lineHeight}
    >
      {text}
    </Text>
  );
}

// ── Đội xe & gói dịch vụ ────────────────────────────────────────────────────────────────────────

type MarketKey = 'onMarket' | 'inReview' | 'draft' | 'needsRevision';

/**
 * "Đội xe & gói dịch vụ" - Figma `24175:52525`: GỘP hai khối cũ "Gói dịch vụ" và "Xe trên chợ"
 * vào một thẻ, MỖI phần giữ đúng luật hiện của mình (nơi gọi quyết):
 *  - `showPlan`: cờ gói của nền tảng + `subscription.view` + không phải tuyến hoa hồng;
 *  - `market`: `undefined` = đang tải, dữ liệu = hiện; nơi gọi KHÔNG dựng khi `null`/tuyến hoa hồng.
 * Tiêu đề theo phần đang hiện; "Quản lý xe →" chỉ đi cùng phần xe trên chợ.
 */
export function FleetPlanPanel({
  showPlan,
  showMarket,
  market,
  links,
}: {
  showPlan: boolean;
  showMarket: boolean;
  market: PartnerOverviewMarket | undefined;
  links: DashboardLinks;
}) {
  const tFleet = useTranslations('Dashboard.fleetPlan');
  const tPlan = useTranslations('Dashboard.plan');
  const tMarket = useTranslations('Dashboard.market');
  const navigateOnce = useNavigateOnce();
  const onManage = useCallback(() => navigateOnce(links.vehicles), [navigateOnce, links.vehicles]);
  if (!showPlan && !showMarket) return null;

  // Chỉ phần xe: "Đội xe" - "Xe trên chợ" trùng dòng "Trạng thái xe trên chợ" ngay dưới.
  const title = showPlan && showMarket ? tFleet('title') : showPlan ? tPlan('title') : tFleet('fleetTitle');
  return (
    <InfoGroupCard
      title={title}
      {...(showMarket ? { headerLink: { label: tMarket('manage'), onPress: onManage } } : {})}
    >
      {showPlan ? <PlanSection href={links.subscription} /> : null}
      {showMarket ? <MarketSection market={market} links={links} /> : null}
    </InfoGroupCard>
  );
}

/**
 * Phần GÓI - dải tối Figma `24175:52527` (ảnh nền, bo 16, đệm 8/12): ô kính 36 với icon toà nhà,
 * tên gói 14/20 trắng, hạn 12/18 xám nhạt, viên "Còn N ngày". Dải bấm được ⇒ trang gói. Bên dưới
 * giữ các phần web có mà Figma không vẽ: "Xe đã dùng" + thanh, chạm trần, nút "Gia hạn gói" khi
 * sắp hết hạn + có `subscription.purchase` (app không bán gói - nút MỞ site partner).
 */
function PlanSection({ href }: { href: Href }) {
  const colors = useColors();
  const t = useTranslations('Dashboard.plan');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const { data: user } = useCurrentUser();
  const { data, isPending, isError } = useMySubscription();
  const onOpen = useCallback(() => navigateOnce(href), [navigateOnce, href]);

  if (isPending) return <MiniRowsSkeleton />;
  if (isError || !data) return <Note text={t('loadError')} />;
  const plan = data.currentPlan ?? null;
  if (!plan) return <Note text={t('none')} />;

  const quota = data.fleetQuota;
  const inGrace = user?.tenant?.billingPhase === BILLING_PHASE.GRACE;
  const daysLeft = daysUntil(plan.endsAt, dayjs());
  const expiring = inGrace || daysLeft <= PLAN_RENEW_WARNING_DAYS;
  const limit = quota?.kind === 'total' ? quota.totalLimit : null;
  const used = quota?.totalUsed ?? 0;
  const atCapacity = limit !== null && used >= limit;
  const graceEndsAt = user?.tenant?.graceEndsAt;
  const renewUrl = has(PERMISSION.SUBSCRIPTION_PURCHASE) ? resolvePartnerPlanUrl() : null;
  const sub = inGrace && graceEndsAt ? t('grace', { date: fmt.date(graceEndsAt) }) : t('endsAt', { date: fmt.date(plan.endsAt) });

  return (
    <YStack gap={STACK_GAP}>
      <Pressable onPress={onOpen} accessibilityRole="link" accessibilityLabel={`${plan.planName}. ${sub}`}>
        {({ pressed }) => (
          <ImageBackground
            source={PLAN_BG}
            resizeMode="cover"
            style={[styles.planStrip, pressed ? styles.pressed : null]}
            imageStyle={styles.planStripImage}
          >
            <YStack p={PLAN_ICON_PAD} br={radius.control} bg={marketColors.onDarkGlass}>
              <LineIcon name="buildings" color={colors.brandShape} size={PLAN_ICON} />
            </YStack>
            <YStack f={1} minWidth={0} gap={2}>
              <Text
                col={marketColors.onDark}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {plan.planName}
              </Text>
              <Text
                col={expiring ? colors.warning : marketColors.onDarkMuted}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                numberOfLines={2}
              >
                {sub}
              </Text>
            </YStack>
            {inGrace ? null : (
              <YStack px={8} py={2} br={radius.card} bg={expiring ? colors.dangerSurface : marketColors.onDarkChip}>
                <Text
                  col={expiring ? colors.dangerStrong : marketColors.onDarkChipText}
                  fos={typeScale.label.fontSize}
                  lh={typeScale.label.lineHeight}
                  fow={fontWeight.medium}
                  numberOfLines={1}
                >
                  {t('daysLeft', { count: Math.max(0, daysLeft) })}
                </Text>
              </YStack>
            )}
          </ImageBackground>
        )}
      </Pressable>
      <YStack gap={8}>
        <XStack jc="space-between" gap={8}>
          <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
            {t('vehicles')}
          </Text>
          <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
            {limit === null ? t('vehiclesUnlimited', { used }) : t('vehiclesValue', { used, limit })}
          </Text>
        </XStack>
        {limit !== null ? (
          <ProgressBar
            percent={limit > 0 ? Math.min(100, Math.round((used / limit) * 100)) : 100}
            tone={atCapacity ? 'exception' : 'active'}
            {...(atCapacity ? {} : { color: colors.brandShape })}
          />
        ) : null}
        {atCapacity ? <Note text={t('atCapacity')} warn /> : null}
      </YStack>
      {expiring && renewUrl ? (
        <XStack jc="flex-end">
          <Button label={t('renew')} onPress={() => void Linking.openURL(renewUrl)} />
        </XStack>
      ) : null}
    </YStack>
  );
}

const PLAN_BG = require('../../../../assets/images/dashboard/plan-card-bg.jpg') as number;
/** Figma "Enterprise Plan Icon": `p 8 · r 12`, icon 20. */
const PLAN_ICON_PAD = 8;
const PLAN_ICON = 20;

/**
 * Phần XE TRÊN CHỢ - Figma `24175:52536`: "Trạng thái xe trên chợ" + tổng xe, thanh chồng 8 (khách
 * đang thấy · chờ duyệt · chưa gửi duyệt · cần sửa), rồi chú thích hai cột (chấm 6 · nhãn 14/20 ·
 * số đậm). Mỗi dòng chú thích mở Đội xe lọc sẵn theo trạng thái công khai - như web.
 */
function MarketSection({
  market,
  links,
}: {
  market: PartnerOverviewMarket | undefined;
  links: DashboardLinks;
}) {
  const colors = useColors();
  const t = useTranslations('Dashboard.market');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  const canCreate = has(PERMISSION.VEHICLE_CREATE);

  const rows = useMemo(() => {
    if (!market) return [];
    const row = (key: MarketKey, count: number, color: string, href: Href) => ({
      key,
      label: t(key),
      count,
      color,
      href,
    });
    const byStatus = (status: VehiclePublicStatus) => links.vehiclesByPublicStatus(status);
    return [
      row('onMarket', market.onMarket, colors.success, links.vehicles),
      row('inReview', market.inReview, colors.warningVivid, byStatus(VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW)),
      row('draft', market.draft, colors.borderInput, byStatus(VEHICLE_PUBLIC_STATUS.DRAFT)),
      row('needsRevision', market.needsRevision, colors.danger, byStatus(VEHICLE_PUBLIC_STATUS.NEEDS_REVISION)),
    ];
  }, [market, links, colors, t]);

  const onAdd = useCallback(() => navigateOnce(links.vehicleNew), [navigateOnce, links.vehicleNew]);

  if (!market) return <MiniRowsSkeleton />;
  const total = market.onMarket + market.inReview + market.needsRevision + market.draft;
  if (total === 0) {
    return (
      <YStack ai="flex-start" gap={10}>
        <Note text={t('empty')} />
        {canCreate ? <Button label={t('add')} icon="add" onPress={onAdd} /> : null}
      </YStack>
    );
  }

  /* Chú thích hai cột theo Figma: (khách đang thấy · chưa gửi duyệt) | (chờ duyệt · cần sửa). */
  const left = [rows[0], rows[2]].filter((r) => r !== undefined);
  const right = [rows[1], rows[3]].filter((r) => r !== undefined);

  return (
    <YStack gap={STACK_GAP}>
      <YStack gap={8}>
        <XStack jc="space-between" ai="center" gap={8}>
          <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.medium}>
            {t('statusTitle')}
          </Text>
          <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
            {t('totalValue', { count: total })}
          </Text>
        </XStack>
        <StackedBar
          segments={rows.map((r) => ({ key: r.key, value: r.count, color: r.color }))}
          accessibilityLabel={rows.map((r) => `${r.label}: ${fmt.count(r.count)}`).join(', ')}
        />
      </YStack>
      <XStack gap={LEGEND_COL_GAP}>
        {[left, right].map((column, index) => (
          <YStack key={index} f={1} minWidth={0} gap={8}>
            {column.map((r) => (
              <LegendRow
                key={r.key}
                label={r.label}
                count={fmt.count(r.count)}
                color={r.color}
                emphasise={r.key === 'needsRevision' && r.count > 0}
                href={r.href}
              />
            ))}
          </YStack>
        ))}
      </XStack>
    </YStack>
  );
}

/** Figma "Vehicle status legend": hai cột cách 20. */
const LEGEND_COL_GAP = 20;

const LegendRow = memo(function LegendRow({
  label,
  count,
  color,
  emphasise,
  href,
}: {
  label: string;
  count: string;
  color: string;
  /** "Cần sửa" > 0 - số tô đỏ cùng màu chấm. */
  emphasise: boolean;
  href: Href;
}) {
  const colors = useColors();
  const t = useTranslations('Dashboard.market');
  const navigateOnce = useNavigateOnce();
  const onPress = useCallback(() => navigateOnce(href), [navigateOnce, href]);
  return (
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={`${label}: ${count}`} hitSlop={4}>
      {({ pressed }) => (
        <XStack ai="center" gap={6} opacity={pressed ? 0.6 : 1}>
          <YStack w={DOT} h={DOT} br={radius.pill} bg={color} />
          <Text
            flexShrink={1}
            col={colors.textMuted}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            numberOfLines={1}
          >
            {t('legendLabel', { label })}
          </Text>
          <Text
            col={emphasise ? colors.danger : colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.semibold}
          >
            {count}
          </Text>
        </XStack>
      )}
    </Pressable>
  );
});

const DOT = 6;

// ── Uy tín ──────────────────────────────────────────────────────────────────────────────────────

/**
 * Uy tín với khách - Figma `24175:52563`: mỗi chỉ số một hàng (nhãn 14/20 · giá trị 14/20 đậm vừa
 * xanh) + thanh 8 cho chỉ số PHẦN TRĂM, rồi ghi chú 12/18 mờ. Cùng chữ và cùng luật với
 * `HostMetrics` (bó `Shops.metrics`): chưa đủ mẫu ⇒ đúng một câu "mới có N yêu cầu…" của component
 * đó; `null` ≠ 0; "Đặt ngay" thay thời gian phản hồi khi không có mẫu do người quyết.
 */
export function ReputationPanel({ metrics }: { metrics: HostMetricsShape | undefined }) {
  const t = useTranslations('Dashboard.reputation');
  const tm = useTranslations('Shops.metrics');
  const colors = useColors();

  const rows = useMemo(() => {
    if (!metrics || hostMetricState(metrics.sampleCount) !== HOST_METRIC_STATE.READY) return null;
    const list: { key: string; label: string; value: string; percent: number | null }[] = [];
    if (metrics.responseRatePercent !== null) {
      list.push({
        key: 'responseRate',
        label: tm('responseRate'),
        value: tm('responseRateValue', { percent: metrics.responseRatePercent }),
        percent: metrics.responseRatePercent,
      });
    }
    const speed = responseSpeedOf(metrics.responseMinutesMedian);
    if (speed !== null) {
      list.push({ key: 'responseTime', label: tm('responseTime'), value: tm(`speed.${speed}`), percent: null });
    } else if (metrics.instantBook) {
      list.push({ key: 'instant', label: tm('responseTime'), value: tm('instantBook'), percent: null });
    }
    if (metrics.acceptKeepRatePercent !== null) {
      list.push({
        key: 'acceptKeep',
        label: tm('acceptKeep'),
        value: tm('acceptKeepValue', { percent: metrics.acceptKeepRatePercent }),
        percent: metrics.acceptKeepRatePercent,
      });
    }
    return list;
  }, [metrics, tm]);

  return (
    <DashboardPanel
      title={t('title')}
      extra={t('window', { days: HOST_METRIC_WINDOW_DAYS })}
      loading={!metrics}
    >
      {metrics ? (
        <Stack>
          {rows === null ? (
            <HostMetrics metrics={metrics} />
          ) : (
            rows.map((row) => (
              <YStack key={row.key} gap={8}>
                <XStack jc="space-between" ai="center" gap={8}>
                  <Text
                    flexShrink={1}
                    col={colors.textMuted}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fow={fontWeight.medium}
                  >
                    {row.label}
                  </Text>
                  <Text
                    col={colors.success}
                    fos={typeScale.body.fontSize}
                    lh={typeScale.body.lineHeight}
                    fow={fontWeight.semibold}
                  >
                    {row.value}
                  </Text>
                </XStack>
                {row.percent !== null ? <ProgressBar percent={row.percent} color={colors.successVivid} /> : null}
              </YStack>
            ))
          )}
          <Note text={t('note')} />
        </Stack>
      ) : null}
    </DashboardPanel>
  );
}

// ── Tiền của bạn (sổ ví) ────────────────────────────────────────────────────────────────────────

/**
 * Thẻ ví - Figma "Wallet Card" `24175:52390`. CHỈ chủ gian hàng (`@ShopOwnerOnly`, ADR 0038 điều 3) -
 * nơi gọi quyết. Thẻ trắng bo 16 (quầng "New/Sm Card"), trong là khung nền ấm bo 12: "RÚT ĐƯỢC NGAY"
 * + số 24/32, hai cột "Đang chờ" · "Tổng XePrime phải trả" (`total` của server = rút được + đang
 * chờ, ADR 0033 điều 6), nút "Rút về ngân hàng" mở CHÍNH tấm rút tiền của màn Số dư (cùng phép
 * `canWithdraw`: ví khoá hoặc dưới mức rút tối thiểu ⇒ nút tắt + lý do); link "Số dư & rút tiền".
 * `showIncome` (tuyến hoa hồng): thêm hàng thu nhập tháng này.
 */
export function WalletPanel({ showIncome, href }: { showIncome: boolean; href: Href }) {
  const colors = useColors();
  const dark = useAppScheme().scheme === 'dark';
  const t = useTranslations('Dashboard.wallet');
  const tWallet = useTranslations('Wallet');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const summary = useWalletSummary('shop');
  const statement = useWalletStatement(
    { period: nowInAppTz().format(MONTH_PARAM_FORMAT), page: 1 },
    showIncome,
  );
  const [withdrawOpen, setWithdrawOpen] = useState(false);
  const openWithdraw = useCallback(() => setWithdrawOpen(true), []);
  const closeWithdraw = useCallback(() => setWithdrawOpen(false), []);
  const onOpen = useCallback(() => navigateOnce(href), [navigateOnce, href]);
  const data = summary.data;
  const frozen = data?.status === WALLET_STATUS.FROZEN;
  const withdrawable = canWithdraw(data);

  return (
    <YStack
      bg={colors.surface}
      br={radius.card}
      pt={OUTER_PAD}
      px={OUTER_PAD}
      pb={OUTER_PAD_BOTTOM}
      gap={STACK_GAP}
      bw={1}
      bc={dark ? colors.border : colors.surface}
      style={dark ? undefined : elevation.ambientSm}
      accessibilityLabel={t('title')}
    >
      {summary.isPending ? (
        <MiniRowsSkeleton />
      ) : summary.isError || !data ? (
        <YStack p={INNER_PAD}>
          <Note text={t('loadError')} />
        </YStack>
      ) : (
        <YStack br={radius.control} ov="hidden" bg={dark ? colors.brandLow : colors.surface}>
          {dark ? null : (
            <Image source={WALLET_BG} style={styles.walletBg} contentFit="fill" accessible={false} />
          )}
          <YStack p={INNER_PAD} gap={STACK_GAP}>
            <YStack ai="center" gap={2}>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.medium}
                textTransform="uppercase"
                ta="center"
              >
                {t('available')}
              </Text>
              <Text
                col={colors.text}
                fos={typeScale.display.fontSize}
                lh={typeScale.display.lineHeight}
                fow={fontWeight.bold}
                numberOfLines={1}
                adjustsFontSizeToFit
              >
                {fmt.money(data.available)}
              </Text>
            </YStack>
            <XStack gap={METRIC_COL_GAP}>
              <WalletFigure label={t('pendingShort')} value={fmt.money(data.pending)} />
              <WalletFigure label={tWallet('balance.total')} value={fmt.money(data.total)} />
            </XStack>
            <Pressable
              onPress={openWithdraw}
              disabled={!withdrawable}
              accessibilityRole="button"
              accessibilityLabel={tWallet('withdraw.action')}
              accessibilityState={{ disabled: !withdrawable }}
              style={({ pressed }) => (!withdrawable ? styles.disabled : pressed ? styles.pressed : null)}
            >
              <LinearGradient
                colors={gradients.walletCta.colors}
                locations={gradients.walletCta.locations}
                start={GRADIENT_START}
                end={GRADIENT_END}
                style={styles.cta}
              >
                <Text
                  col={colors.onPrimary}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  fow={fontWeight.semibold}
                >
                  {tWallet('withdraw.action')}
                </Text>
              </LinearGradient>
            </Pressable>
            {frozen ? <Note text={t('frozen')} warn /> : null}
            {!withdrawable && !frozen ? (
              <Note text={tWallet('withdraw.belowMinimum', { min: fmt.money(data.minWithdrawAmount) })} />
            ) : null}
          </YStack>
        </YStack>
      )}

      {showIncome ? (
        <YStack px={INNER_PAD} gap={2} alignSelf="stretch">
          <XStack jc="space-between" ai="center" gap={8}>
            <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              {t('income')}
            </Text>
            <Text
              col={colors.text}
              fos={typeScale.title.fontSize}
              lh={typeScale.title.lineHeight}
              fow={fontWeight.semibold}
            >
              {statement.data ? fmt.money(statement.data.totals.ownerIncome) : statement.isError ? '-' : '…'}
            </Text>
          </XStack>
          {statement.data ? (
            <Note text={t('incomeHint', { count: statement.data.stats.completedTripCount })} />
          ) : statement.isError ? (
            <Note text={t('loadError')} />
          ) : null}
        </YStack>
      ) : null}

      <XStack jc="flex-end">
        <LinkArrow label={t('open')} onPress={onOpen} />
      </XStack>

      <WithdrawSheet scope={WALLET_SCOPE.SHOP} open={withdrawOpen} onClose={closeWithdraw} />
    </YStack>
  );
}

const WALLET_BG = require('../../../../assets/images/dashboard/wallet-bg.jpg') as number;
/** Figma "Wallet Card": ngoài `pt 8 · px 8 · pb 12`; trong `p 12`; hai cột cách 20. */
const OUTER_PAD = 8;
const OUTER_PAD_BOTTOM = 12;
const INNER_PAD = 12;
const METRIC_COL_GAP = 20;
const GRADIENT_START = { x: 0, y: 0.5 };
const GRADIENT_END = { x: 1, y: 0.5 };

const WalletFigure = memo(function WalletFigure({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <YStack f={1} minWidth={0} ai="center">
      <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={1}>
        {label}
      </Text>
      <Text
        col={colors.text}
        fos={typeScale.title.fontSize}
        lh={typeScale.title.lineHeight}
        fow={fontWeight.semibold}
        numberOfLines={1}
        adjustsFontSizeToFit
      >
        {value}
      </Text>
    </YStack>
  );
});

// ── Xe của bạn (chủ xe tuyến hoa hồng) ─────────────────────────────────────────────────────────

/** Số xe xem trước - chủ xe cá nhân có 1–3 xe, năm dòng là đủ. */
const OWNER_VEHICLE_PREVIEW = 5;
/** Web `.vehicleThumb { width: 52px; height: 40px; border-radius: 8px }`. */
const THUMB_W = 52;
const THUMB_H = 40;

/**
 * Xe của bạn - web `OwnerVehiclesPanel` (tuyến hoa hồng), trong khung "Nhóm thông tin": mức dùng
 * trần xe bên phải tiêu đề, dòng xe (ảnh 52×40 · tên · biển · thẻ trạng thái chợ + vận hành), hộp
 * mời mở gian hàng khi chạm trần, rồi "Xem tất cả →" + "Đăng thêm xe" cùng một hàng.
 */
export function OwnerVehiclesPanel({ links }: { links: DashboardLinks }) {
  const colors = useColors();
  const t = useTranslations('Dashboard.ownerVehicles');
  const navigateOnce = useNavigateOnce();
  const { has } = usePermissions();
  // Lối sang gói chỉ có khi nền tảng bật cờ - tắt thì app không nhắc gì tới gói.
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const vehicles = useVehiclesPage({ page: 1, limit: OWNER_VEHICLE_PREVIEW, sort: VEHICLE_SORT.NEWEST });
  const subscription = useMySubscription(has(PERMISSION.SUBSCRIPTION_VIEW));
  const onOpenVehicle = useCallback((id: string) => navigateOnce(links.vehicle(id)), [navigateOnce, links]);

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
      {...(limit !== null ? { extra: t('quota', { used, limit }) } : {})}
      loading={vehicles.isPending}
      error={vehicles.isError && !vehicles.data}
      onRetry={() => void vehicles.refetch()}
    >
      {vehicles.data ? (
        <Stack>
          {items.length === 0 ? (
            <Note text={t('empty')} />
          ) : (
            <YStack>
              {items.map((vehicle, index) => (
                <OwnerVehicleRow key={vehicle.id} vehicle={vehicle} first={index === 0} onOpen={onOpenVehicle} />
              ))}
            </YStack>
          )}
          {atCapacity && isPlanPromotionEnabled ? (
            <YStack gap={6} px={12} py={8} br={radius.control} bw={1} bc={colors.infoBorder} bg={colors.infoLow}>
              <Text col={colors.text} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                {t('atCapacity', { limit: limit ?? 0 })}
              </Text>
              <XStack>
                <LinkArrow label={t('upgrade')} onPress={() => navigateOnce(links.subscription)} />
              </XStack>
            </YStack>
          ) : null}
          <XStack ai="center" jc="space-between" gap={8}>
            {canCreate ? (
              <Button
                label={t('add')}
                icon="add"
                variant="outline"
                onPress={() => navigateOnce(links.vehicleNew)}
              />
            ) : (
              <YStack />
            )}
            {total > 0 ? <LinkArrow label={t('viewAll')} onPress={() => navigateOnce(links.vehicles)} /> : null}
          </XStack>
        </Stack>
      ) : null}
    </DashboardPanel>
  );
}

/** Một dòng xe - kẻ 1 giữa các dòng như dòng lịch giao nhận (Figma "Metric Details"). */
const OwnerVehicleRow = memo(function OwnerVehicleRow({
  vehicle,
  first,
  onOpen,
}: {
  vehicle: VehicleListItem;
  first: boolean;
  onOpen: (id: string) => void;
}) {
  const colors = useColors();
  const domainLabel = useDomainLabel();
  const { id } = vehicle;
  const onPress = useCallback(() => onOpen(id), [onOpen, id]);
  const approved = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const marketBadge = approved
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
    <Pressable onPress={onPress} accessibilityRole="link" accessibilityLabel={vehicle.name}>
      {({ pressed }) => (
        <XStack
          ai="flex-start"
          gap={12}
          py={8}
          borderTopWidth={first ? 0 : 1}
          borderTopColor={colors.border}
          opacity={pressed ? 0.7 : 1}
        >
          <YStack w={THUMB_W} h={THUMB_H} br={8} overflow="hidden" bg={colors.surfaceMuted}>
            <RemoteImage
              uri={vehicle.mainImageUrl}
              radius={8}
              fallback={
                <YStack f={1} ai="center" jc="center">
                  <AntIcon icon={CarOutlined} color={colors.placeholder} size={iconSize.sm} />
                </YStack>
              }
            />
          </YStack>
          <YStack f={1} minWidth={0} gap={8}>
            <YStack>
              <Text
                col={colors.text}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.medium}
                numberOfLines={1}
              >
                {vehicle.name}
              </Text>
              {vehicle.plateNumber ? (
                <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
                  {vehicle.plateNumber}
                </Text>
              ) : null}
            </YStack>
            <XStack gap={4} flexWrap="wrap">
              <StatusBadge label={marketBadge.label} color={marketBadge.color} size="sm" />
              <StatusBadge
                label={domainLabel('vehicleOperationStatus', vehicle.operationStatus, operation.label)}
                color={operation.color}
                size="sm"
              />
            </XStack>
          </YStack>
        </XStack>
      )}
    </Pressable>
  );
});

const styles = StyleSheet.create({
  planStrip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: radius.card,
    overflow: 'hidden',
  },
  planStripImage: { borderRadius: radius.card },
  /** Figma: ảnh nền phủ cao 287,97%, đẩy lên 182,55% - lấy đúng mảng ấm ở giữa ảnh. */
  walletBg: {
    position: 'absolute',
    left: 0,
    width: '100%',
    top: '-182.55%',
    height: '287.97%',
  },
  cta: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radius.control,
  },
  pressed: { opacity: 0.85 },
  disabled: { opacity: 0.5 },
});
