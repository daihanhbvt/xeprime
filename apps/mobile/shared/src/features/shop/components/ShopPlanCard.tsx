import BankOutlined from '@ant-design/icons-svg/es/asn/BankOutlined';
import CheckCircleFilled from '@ant-design/icons-svg/es/asn/CheckCircleFilled';
import { Image } from 'expo-image';
import { LinearGradient } from 'expo-linear-gradient';
import { useState } from 'react';
import { StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BILLING_PHASE,
  PLAN_FEATURE,
  PLAN_VEHICLE_SCOPE,
  VEHICLE_QUOTA_KIND,
  planVehicleScopeOf,
  type PlanVehicleScope,
} from '@xeprime/types';
import { LIST_SEPARATOR, nowInAppTz, toAppTz } from '@xeprime/domain';
import type { MySubscription } from '@/api/subscription/api';
import { images } from '@/assets';
import { AntIcon } from '@/components/icons/AntIcon';
import { LineIcon } from '@/components/icons/LineIcon';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InfoCard } from '@/components/ui/InfoCard';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { PlanConsultationSheet } from '@/features/app-config/PlanConsultationSheet';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { useMySubscription } from '@/features/subscription/hooks/use-subscription';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, gradients, iconSize, market, radius, space, typeScale } from '@/theme/tokens';

type CurrentPlan = MySubscription['currentPlans'][number];
type VehicleTypeQuota = MySubscription['vehicleQuotas']['car'];
type LaneScope = typeof PLAN_VEHICLE_SCOPE.CAR | typeof PLAN_VEHICLE_SCOPE.MOTORBIKE;

/** Thứ tự làn của trang Thông tin cửa hàng - Ô TÔ trước (`SHOP_PLAN_LANE_ORDER` web). */
const SHOP_PLAN_LANE_ORDER: readonly LaneScope[] = [PLAN_VEHICLE_SCOPE.CAR, PLAN_VEHICLE_SCOPE.MOTORBIKE];

/** Thẻ làn (Figma `24231:113846`): đệm 12, bo 16, các phần cách 12. */
const LANE_PAD = 12;
const LANE_GAP = 12;
/** Ô icon làn: đệm 8 quanh icon 24, bo 8, nền `bg/primary-low` (`24231:113848`). */
const LANE_ICON_PAD = 8;
const LANE_ICON = 24;
/** Số "đã dùng / trần" 24/32 (`24231:113856`). */
const USAGE_SIZE = 24;
const USAGE_LINE = 32;
/** Thanh suất cao 8 (`24231:113858`). */
const PROGRESS_HEIGHT = 8;
/** Thẻ "Doanh nghiệp" (`24231:113941`): ô icon kính 40 bo 12, các phần cách 16. */
const ENTERPRISE_ICON_BOX = 40;
const ENTERPRISE_GAP = 16;
/** Ô huy chương góc thẻ (`24231:113810` nút 40, icon Award 1). */
const AWARD_BOX = 40;
/** Hai tính năng đầu của gói Doanh nghiệp trên dòng phụ - đúng `EnterpriseOffer` web (`features.slice(0, 2)`). */
const ENTERPRISE_FEATURES = [PLAN_FEATURE.FINANCE, PLAN_FEATURE.DEBTS] as const;

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
 * "Gói & hạn mức" - Figma Partner "Quản lý gian hàng" `24231:113809` (bản web: `ShopPlanSection`,
 * design `23999:111391` / `23999:111045`): mỗi loại xe một thẻ làn (gói đang dùng + hạn, số xe đã
 * kích hoạt / trần kèm thanh suất, câu tình trạng suất), rồi thẻ tối "Doanh nghiệp"; hoặc khối gói
 * doanh nghiệp đang dùng.
 *
 * App Partner KHÔNG bán gói và KHÔNG dẫn ra web để mua (Apple 3.1.1/3.1.3, chính sách Thanh toán
 * Google Play - người dùng chốt 19/11/2026): thẻ chỉ CHO XEM gói đang dùng + hạn mức, và lối duy
 * nhất là "Liên hệ tư vấn" (tấm đăng ký tư vấn, không giá, không link mua) - đặt trong thẻ tối
 * "Doanh nghiệp" của Figma (người dùng chốt 26/11/2026). Các link "Gia hạn" / "Nâng cấp ngay" mà
 * Figma vẽ trên thẻ làn KHÔNG dựng - đừng thêm lại. Ô huy chương ở góc chỉ là trang trí. Nơi gọi gác
 * cờ khuyến mãi gói + `subscription.view`.
 */
export function ShopPlanCard({ onLayout }: { onLayout?: (event: LayoutChangeEvent) => void }) {
  const colors = useColors();
  const t = useTranslations('Subscription');
  const tShop = useTranslations('Subscription.shopPlan');
  const tCommon = useTranslations('Common');
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const me = useMySubscription();

  const [consultOpen, setConsultOpen] = useState(false);
  const data = me.data;
  const enterprise = data ? currentPlanForScope(data.currentPlans, PLAN_VEHICLE_SCOPE.ALL) : null;

  return (
    <InfoCard
      look="figma"
      title={tShop('title')}
      hint={tShop('hint')}
      {...(onLayout ? { onLayout } : {})}
      extra={
        <YStack
          w={AWARD_BOX}
          h={AWARD_BOX}
          br={radius.control}
          ov="hidden"
          ai="center"
          jc="center"
          accessibilityElementsHidden
          importantForAccessibility="no-hide-descendants"
        >
          <LinearGradient
            colors={gradients.walletCta.colors}
            locations={gradients.walletCta.locations}
            start={GRADIENT_START}
            end={GRADIENT_END}
            style={StyleSheet.absoluteFill}
          />
          <LineIcon name="award-1" size={iconSize.lg} color={colors.onPrimary} />
        </YStack>
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
        <>
          {SHOP_PLAN_LANE_ORDER.map((scope) => (
            <LaneCard
              key={scope}
              scope={scope}
              current={currentPlanForScope(data.currentPlans, scope)}
              quota={scope === PLAN_VEHICLE_SCOPE.CAR ? data.vehicleQuotas.car : data.vehicleQuotas.motorbike}
            />
          ))}
          {isPlanPromotionEnabled ? <EnterpriseOffer onContact={() => setConsultOpen(true)} /> : null}
        </>
      )}
      <PlanConsultationSheet open={consultOpen} onClose={() => setConsultOpen(false)} />
    </InfoCard>
  );
}

/** `bg-gradient-to-r`: trái → phải. */
const GRADIENT_START = { x: 0, y: 0.5 } as const;
const GRADIENT_END = { x: 1, y: 0.5 } as const;

/**
 * Thẻ tối "Doanh nghiệp" (Figma `24231:113941`, cùng nội dung `EnterpriseOffer` web): nền ảnh tối,
 * viền vàng, ô kính 40 + toà nhà, tiêu đề trắng + dòng phụ (hai tính năng · báo giá riêng), nút vàng
 * "Liên hệ tư vấn" mở tấm đăng ký tư vấn - không giá, không link mua.
 */
function EnterpriseOffer({ onContact }: { onContact: () => void }) {
  const colors = useColors();
  const tCombined = useTranslations('Subscription.combined');
  const tPlan = useTranslations('Subscription.mobilePlan');
  const domainLabel = useDomainLabel();
  const summary = [
    ...ENTERPRISE_FEATURES.map((feature) => domainLabel('planFeature', feature)),
    tCombined('enterpriseQuote'),
  ].join(LIST_SEPARATOR);

  return (
    <YStack gap={ENTERPRISE_GAP} p={LANE_PAD} br={radius.card} bw={1} bc={colors.primaryGlow} ov="hidden">
      <Image source={images.shopEnterpriseBg} style={StyleSheet.absoluteFill} contentFit="cover" />
      <XStack ai="flex-start" gap={LANE_GAP}>
        <YStack
          w={ENTERPRISE_ICON_BOX}
          h={ENTERPRISE_ICON_BOX}
          br={radius.control}
          bg={market.onDarkGlass}
          ai="center"
          jc="center"
        >
          <LineIcon name="buildings" size={LANE_ICON} color={colors.brandShape} />
        </YStack>
        <YStack f={1} minWidth={0}>
          <Text col={market.onDark} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
            {tCombined('enterpriseTitle')}
          </Text>
          <Text col={market.onDarkMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {summary}
          </Text>
        </YStack>
      </XStack>
      <Button
        label={tPlan('contactButton')}
        lineIcon="calling"
        variant="gradient"
        shape="square"
        onPress={onContact}
      />
    </YStack>
  );
}

/** Thẻ MỘT loại xe - Figma `24231:113846` (web `ShopPlanLaneCard`, design `23999:111394`). */
function LaneCard({
  scope,
  current,
  quota,
}: {
  scope: LaneScope;
  current: CurrentPlan | null;
  quota: VehicleTypeQuota;
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

  return (
    <YStack
      gap={LANE_GAP}
      p={LANE_PAD}
      br={radius.card}
      bw={1}
      bc={colors.border}
      bg={colors.surface}
      accessibilityLabel={tLanes(`title.${scope}`)}
    >
      <XStack ai="center" gap={space.sm}>
        <YStack p={LANE_ICON_PAD} br={radius.thumb} bg={colors.brandLow}>
          <LineIcon
            name={scope === PLAN_VEHICLE_SCOPE.CAR ? 'help-car' : 'motorbike-24'}
            size={LANE_ICON}
            color={colors.brandShape}
          />
        </YStack>
        <YStack f={1} minWidth={0}>
          <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} fow={fontWeight.semibold}>
            {current ? current.planName : scopeLabel}
          </Text>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {current
              ? tLanes('endsOn', { date: fmt.date(current.endsAt) })
              : quota.kind === VEHICLE_QUOTA_KIND.SCOPE_REQUIRED
                ? tLanes(`scopeRequired.${scope}`)
                : tLanes(`noPlanHint.${scope}`)}
          </Text>
        </YStack>
        {current ? (
          <YStack px={8} py={2} br={radius.card} bg={warn ? colors.warningSurface : colors.surfaceMuted}>
            <Text
              col={warn ? colors.warning : colors.textMuted}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
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
          <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
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
            <YStack h="100%" w={`${percent}%`} br={4} bg={full ? colors.danger : colors.warningHigh} />
          </YStack>
        ) : null}
      </YStack>

      <XStack flexWrap="wrap" ai="flex-start" jc="space-between" rowGap={8} columnGap={16}>
        <Text
          f={1}
          minWidth={160}
          col={full ? colors.danger : colors.placeholder}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
        >
          {full
            ? t('full', { scope: scopeLabel.toLowerCase() })
            : free != null
              ? t('free', { free, market: marketText })
              : marketText}
        </Text>
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
