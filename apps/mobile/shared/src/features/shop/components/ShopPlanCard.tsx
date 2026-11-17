import BankOutlined from '@ant-design/icons-svg/es/asn/BankOutlined';
import CarOutlined from '@ant-design/icons-svg/es/asn/CarOutlined';
import CheckCircleFilled from '@ant-design/icons-svg/es/asn/CheckCircleFilled';
import { useState } from 'react';
import { Linking, Pressable, type LayoutChangeEvent } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BILLING_PHASE,
  PERMISSION,
  PLAN_VEHICLE_SCOPE,
  VEHICLE_QUOTA_KIND,
  planVehicleScopeOf,
  type PlanVehicleScope,
} from '@xeprime/types';
import { nowInAppTz, toAppTz } from '@xeprime/domain';
import type { MySubscription } from '@/api/subscription/api';
import { AntIcon } from '@/components/icons/AntIcon';
import { MotorbikeIcon } from '@/components/icons/BrandIcons';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InfoCard } from '@/components/ui/InfoCard';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { PlanConsultationSheet } from '@/features/app-config/PlanConsultationSheet';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useMySubscription } from '@/features/subscription/hooks/use-subscription';
import { useAppFormat } from '@/i18n/use-app-format';
import { resolvePartnerPlanUrl } from '@/lib/partner-web-url';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, market, radius, space } from '@/theme/tokens';

type CurrentPlan = MySubscription['currentPlans'][number];
type VehicleTypeQuota = MySubscription['vehicleQuotas']['car'];
type LaneScope = typeof PLAN_VEHICLE_SCOPE.CAR | typeof PLAN_VEHICLE_SCOPE.MOTORBIKE;

/** Thứ tự làn của trang Thông tin cửa hàng - Ô TÔ trước (`SHOP_PLAN_LANE_ORDER` web). */
const SHOP_PLAN_LANE_ORDER: readonly LaneScope[] = [PLAN_VEHICLE_SCOPE.CAR, PLAN_VEHICLE_SCOPE.MOTORBIKE];

/** Ô icon làn 40 bo 8, icon 22 (`.laneIcon`). */
const LANE_ICON_BOX = 40;
const LANE_ICON = 22;
/** Số "đã dùng / trần" 30/38 (`.usageUsed`). */
const USAGE_SIZE = 30;
const USAGE_LINE = 38;
/** Thanh suất cao 8 (`.progress`). */
const PROGRESS_HEIGHT = 8;

function currentPlanForScope(plans: readonly CurrentPlan[], scope: PlanVehicleScope): CurrentPlan | null {
  return plans.find((plan) => planVehicleScopeOf(plan.vehicleScope) === scope) ?? null;
}

function quotaIsFull(quota: VehicleTypeQuota): boolean {
  return quota.kind === VEHICLE_QUOTA_KIND.TOTAL && quota.limit != null && quota.used >= quota.limit;
}

/** Số ngày còn lại - đồng hồ máy, chỉ để ĐỌC (quyền dùng đọc `phase` của server). */
function daysLeftOf(endsAt: string): number {
  return Math.max(0, toAppTz(endsAt).diff(nowInAppTz(), 'day'));
}

/**
 * "Gói & hạn mức" của trang Thông tin cửa hàng - bản native của `ShopPlanSection` web ở khổ điện
 * thoại (design `23999:111391` / `23999:111045`): mỗi loại xe một thẻ làn (gói đang dùng + hạn, số
 * xe đã kích hoạt / trần kèm thanh suất, câu tình trạng suất, một lối mua), hoặc khối gói doanh
 * nghiệp đang dùng.
 *
 * App Partner KHÔNG bán gói (quy định store): "Nâng cấp / Đổi gói", "Gia hạn", "Nâng cấp ngay",
 * "Mua gói" đều MỞ trang gói trên site partner (`resolvePartnerPlanUrl` - đúng `?lane=&purchase=1`
 * web đọc để mở sẵn hộp mua). Thiếu `subscription.purchase` hay chưa cấu hình URL site partner thì
 * không có lối nào - thẻ chỉ đọc. Nơi gọi gác cờ khuyến mãi gói + `subscription.view`.
 */
export function ShopPlanCard({ onLayout }: { onLayout?: (event: LayoutChangeEvent) => void }) {
  const t = useTranslations('Subscription');
  const tShop = useTranslations('Subscription.shopPlan');
  const tCommon = useTranslations('Common');
  const { has } = usePermissions();
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const me = useMySubscription();

  const canBuy =
    isPlanPromotionEnabled && has(PERMISSION.SUBSCRIPTION_PURCHASE) && resolvePartnerPlanUrl() !== null;
  const openPlan = (lane: LaneScope | null) => {
    const url = resolvePartnerPlanUrl(lane);
    if (url) void Linking.openURL(url);
  };

  const [consultOpen, setConsultOpen] = useState(false);
  const data = me.data;
  const enterprise = data ? currentPlanForScope(data.currentPlans, PLAN_VEHICLE_SCOPE.ALL) : null;

  return (
    <InfoCard
      title={tShop('title')}
      hint={tShop('hint')}
      {...(onLayout ? { onLayout } : {})}
      extra={
        canBuy && data && !enterprise ? (
          <Button
            label={tShop('change')}
            icon="trophy-outline"
            shape="square"
            block={false}
            onPress={() => openPlan(null)}
          />
        ) : undefined
      }
    >
      {me.isLoading ? (
        <MiniRowsSkeleton rows={4} />
      ) : me.isError || !data ? (
        <Callout tone="danger" title={t('page.loadError')}>
          <XStack mt={space.xs}>
            <Button
              label={tCommon('actions.retry')}
              variant="secondary"
              size="sm"
              block={false}
              icon="refresh-outline"
              onPress={() => void me.refetch()}
            />
          </XStack>
        </Callout>
      ) : enterprise ? (
        <ActiveEnterprise
          plan={enterprise}
          data={data}
          {...(isPlanPromotionEnabled ? { onContact: () => setConsultOpen(true) } : {})}
        />
      ) : (
        <YStack gap={20}>
          {SHOP_PLAN_LANE_ORDER.map((scope) => (
            <LaneCard
              key={scope}
              scope={scope}
              current={currentPlanForScope(data.currentPlans, scope)}
              quota={scope === PLAN_VEHICLE_SCOPE.CAR ? data.vehicleQuotas.car : data.vehicleQuotas.motorbike}
              {...(canBuy ? { onPurchase: () => openPlan(scope) } : {})}
            />
          ))}
        </YStack>
      )}
      <PlanConsultationSheet open={consultOpen} onClose={() => setConsultOpen(false)} />
    </InfoCard>
  );
}

/** Thẻ MỘT loại xe - `ShopPlanLaneCard` web (design `23999:111394`). */
function LaneCard({
  scope,
  current,
  quota,
  onPurchase,
}: {
  scope: LaneScope;
  current: CurrentPlan | null;
  quota: VehicleTypeQuota;
  onPurchase?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Subscription.shopPlan');
  const tLanes = useTranslations('Subscription.lanes');
  const tTerm = useTranslations('Subscription.term');
  const tCombined = useTranslations('Subscription.combined');
  const fmt = useAppFormat();
  const phase = current?.phase ?? null;
  const warn = phase === BILLING_PHASE.GRACE || phase === BILLING_PHASE.LAPSED;
  const scopeLabel = tCombined(`scope.${scope}`);

  const limited = quota.kind === VEHICLE_QUOTA_KIND.TOTAL && quota.limit != null;
  const full = quotaIsFull(quota);
  const free = limited ? Math.max(0, (quota.limit ?? 0) - quota.used) : null;
  const percent = limited && quota.limit ? Math.min(100, (quota.used / quota.limit) * 100) : 0;
  const marketText = quota.onMarketplace > 0 ? tLanes('onMarketplace', { count: quota.onMarketplace }) : t('noneOnMarket');
  const action = !onPurchase ? null : full ? t('upgradeNow') : current ? t('renew') : t('buy');

  return (
    <YStack
      gap={space.md}
      p={layout.cardPad}
      br={radius.card}
      bw={1}
      bc={colors.border}
      bg={colors.surface}
      accessibilityLabel={tLanes(`title.${scope}`)}
    >
      <XStack ai="center" gap={12}>
        <YStack w={LANE_ICON_BOX} h={LANE_ICON_BOX} br={8} bg={colors.primaryLight} ai="center" jc="center">
          {scope === PLAN_VEHICLE_SCOPE.CAR ? (
            <AntIcon icon={CarOutlined} size={LANE_ICON} color={colors.primaryStrong} />
          ) : (
            <MotorbikeIcon size={LANE_ICON} color={colors.primaryStrong} />
          )}
        </YStack>
        <YStack f={1} minWidth={0}>
          <Text col={colors.text} fos={fontSize.bodyLg} lineHeight={24} fow={fontWeight.semibold}>
            {current ? current.planName : scopeLabel}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.body} lineHeight={20}>
            {current
              ? tLanes('endsOn', { date: fmt.date(current.endsAt) })
              : quota.kind === VEHICLE_QUOTA_KIND.SCOPE_REQUIRED
                ? tLanes(`scopeRequired.${scope}`)
                : tLanes(`noPlanHint.${scope}`)}
          </Text>
        </YStack>
        {current ? (
          <YStack px={8} py={2} br={radius.pill} bg={warn ? colors.warningSurface : colors.surfaceMuted}>
            <Text
              col={warn ? colors.warning : colors.textMuted}
              fos={fontSize.body}
              lineHeight={20}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {phase === BILLING_PHASE.GRACE
                ? tTerm('grace')
                : phase === BILLING_PHASE.LAPSED
                  ? tTerm('lapsed')
                  : tTerm('daysLeft', { days: daysLeftOf(current.endsAt) })}
            </Text>
          </YStack>
        ) : null}
      </XStack>

      <YStack gap={8}>
        <Text>
          <Text col={colors.text} fos={USAGE_SIZE} lineHeight={USAGE_LINE} fow={fontWeight.semibold}>
            {quota.used}
          </Text>
          {limited ? (
            <Text col={colors.textPlaceholder} fos={USAGE_SIZE} lineHeight={USAGE_LINE} fow={fontWeight.semibold}>
              {` / ${quota.limit}`}
            </Text>
          ) : null}
          <Text col={colors.textMuted} fos={fontSize.body}>
            {` ${limited || quota.kind !== VEHICLE_QUOTA_KIND.UNLIMITED ? t('activated') : t('activatedUnlimited')}`}
          </Text>
        </Text>
        {limited ? (
          <YStack
            h={PROGRESS_HEIGHT}
            br={PROGRESS_HEIGHT}
            bg={colors.warningSubtle}
            ov="hidden"
            accessibilityRole="progressbar"
            accessibilityLabel={t('progressLabel', { scope: scopeLabel })}
            accessibilityValue={{ min: 0, max: quota.limit ?? 0, now: quota.used }}
          >
            <YStack h="100%" w={`${percent}%`} br={4} bg={full ? colors.danger : colors.warning} />
          </YStack>
        ) : null}
      </YStack>

      <XStack flexWrap="wrap" ai="flex-start" jc="space-between" rowGap={8} columnGap={16}>
        <Text f={1} minWidth={160} col={full ? colors.danger : colors.placeholder} fos={fontSize.body} lineHeight={20}>
          {full
            ? t('full', { scope: scopeLabel.toLowerCase() })
            : free != null
              ? t('free', { free, market: marketText })
              : marketText}
        </Text>
        {action && onPurchase ? (
          <Pressable onPress={onPurchase} accessibilityRole="link" accessibilityLabel={action} hitSlop={8}>
            <Text col={colors.primary} fos={fontSize.body} lineHeight={20} fow={fontWeight.semibold}>
              {action}
            </Text>
          </Pressable>
        ) : null}
      </XStack>
    </YStack>
  );
}

/**
 * Gói DOANH NGHIỆP đang dùng - design `23999:111045`: một gói cho cả đội xe (hai thẻ làn vắng hẳn,
 * ADR 0065 điều 2). Bán bằng tư vấn - chỉ lời nhắc liên hệ, không nút thanh toán.
 */
function ActiveEnterprise({
  plan,
  data,
  onContact,
}: {
  plan: CurrentPlan;
  data: MySubscription;
  /** "Liên hệ với XePrime" - bán bằng tư vấn: mở tấm đăng ký tư vấn có sẵn của app. */
  onContact?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Subscription.shopPlan');
  const tEnterprise = useTranslations('Subscription.enterprise');
  const tTerm = useTranslations('Subscription.term');
  const fmt = useAppFormat();
  const grace = plan.phase === BILLING_PHASE.GRACE;

  return (
    <YStack gap={space.md} p={layout.cardPad} br={radius.card} bg={market.inverse}>
      <XStack ai="center" gap={12}>
        <YStack w={LANE_ICON_BOX} h={LANE_ICON_BOX} br={8} bg={colors.primary} ai="center" jc="center">
          <AntIcon icon={BankOutlined} size={LANE_ICON} color={colors.onPrimary} />
        </YStack>
        <YStack f={1} minWidth={0}>
          <XStack ai="center" gap={space.sm} flexWrap="wrap">
            <Text col={market.onDark} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
              {plan.planName}
            </Text>
            <YStack px={8} py={2} br={radius.pill} bg={colors.successSurface}>
              <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.medium}>
                {tEnterprise('activeTag')}
              </Text>
            </YStack>
          </XStack>
          <Text col={market.onDarkMuted} fos={fontSize.body} lineHeight={20}>
            {tEnterprise('activeSummary')}
          </Text>
        </YStack>
      </XStack>

      <XStack gap={space.md} flexWrap="wrap">
        <EnterpriseStat label={t('totalVehicles')} value={String(data.fleetQuota.totalUsed)} sub={t('unlimited')} />
        <EnterpriseStat
          label={t('validUntil')}
          value={fmt.date(plan.endsAt)}
          sub={grace ? tTerm('grace') : t('daysRemaining', { days: daysLeftOf(plan.endsAt) })}
        />
      </XStack>

      <XStack ai="center" gap={space.sm}>
        <AntIcon icon={CheckCircleFilled} size={16} color={colors.primary} />
        <Text f={1} col={market.onDark} fos={fontSize.body}>
          {tEnterprise('coversBoth')}
        </Text>
      </XStack>
      {onContact ? (
        <>
          <Text col={market.onDarkMuted} fos={fontSize.bodySm} fontStyle="italic">
            {tEnterprise('changeHint')}
          </Text>
          <Button
            label={t('contactXePrime')}
            icon="call-outline"
            variant="secondary"
            shape="square"
            onPress={onContact}
          />
        </>
      ) : null}
    </YStack>
  );
}

function EnterpriseStat({ label, value, sub }: { label: string; value: string; sub: string }) {
  return (
    <YStack f={1} minWidth={140} gap={2}>
      <Text col={market.onDarkMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      <Text col={market.onDark} fos={fontSize.h3} fow={fontWeight.semibold}>
        {value}
      </Text>
      <Text col={market.onDarkMuted} fos={fontSize.bodySm}>
        {sub}
      </Text>
    </YStack>
  );
}
