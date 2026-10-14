import { useCallback, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BILLING_MODE,
  BILLING_PHASE,
  PERMISSION,
  QUOTA_LIMIT_REASON,
  STATUS_COLOR,
  type BillingPhase,
} from '@xeprime/types';
import { nowInAppTz, toAppTz } from '@xeprime/domain';
import { useRouter } from 'expo-router';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import type { IconName } from '@/components/ui/Chip';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { Divider } from '@/components/ui/DataRow';
import { IconDisc } from '@/components/ui/IconDisc';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { PlanConsultationSheet } from '@/features/app-config/PlanConsultationSheet';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import type { ReactNode } from 'react';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { MySubscription, SlotUsage } from '@/api/subscription/api';
import { useMySubscription } from './hooks/use-subscription';

/**
 * "Gói & hạn mức" — bản native của `/manage/subscription`, CHỈ ĐỌC.
 *
 * App XePrime Partner KHÔNG bán gói trong app (không IAP): mua/gia hạn chuyển hẳn lên web
 * partner.xeprime.vn. Màn này vì thế không có nút gia hạn, không QR, không hoá đơn, không luồng
 * thanh toán nào. Thứ còn lại luôn hiện: tên tuyến/gói + mô tả ngắn, thời hạn, tổng xe / trần
 * (trần do server tính từ `quota` của thuê bao, rơi về `limits` — ADR 0041 điều 3), số ô tô, xe
 * máy, và phí dịch vụ ở tuyến hoa hồng.
 *
 * Không liệt kê gói hệ thống, không khối "mở khoá tính năng" (quy định IAP của App Store / Google
 * Play). Chỉ nút "Liên hệ tư vấn" hiện khi nền tảng bật `isPlanPromotionEnabled` (hỏi lại
 * `GET /app-config/partner` mỗi lần màn được focus). Mặc định ẩn.
 *
 * `shell`: `manage` = vỏ khu quản lý; `account` = khu tài khoản. App Partner không còn route gói
 * riêng — thân `SubscriptionWorkspace` nhúng ở trang Cửa hàng và Hồ sơ chủ xe.
 */
export function SubscriptionScreen({
  header,
  shell = 'manage',
}: {
  header?: ReactNode;
  /** Giữ để nơi gọi cũ biên dịch — tiêu đề và mô tả nay giống nhau ở mọi tuyến. */
  ownerLite?: boolean;
  shell?: 'manage' | 'account';
} = {}) {
  const t = useTranslations('Subscription.mobilePlan');
  const router = useRouter();
  const account = shell === 'account';

  return (
    <>
      {header ??
        (account ? (
          <AppHeader
            title={t('title')}
            onBack={() => goBackOr(router, ROUTES.account.home())}
          />
        ) : (
          <ManageHeader />
        ))}
      <Screen edges={['left', 'right', 'bottom']}>
        {account ? null : <ManagePageTitle title={t('title')} />}
        <SubscriptionWorkspace />
      </Screen>
    </>
  );
}

/** Dưới ngưỡng này thì ô thời hạn đổi sang sắc cảnh báo — cùng mốc web dùng. */
const TERM_WARNING_DAYS = 7;

/**
 * THÂN của màn gói — không có vỏ điều hướng, không có <Screen> riêng: nó còn được nhúng ở màn
 * Cửa hàng và Hồ sơ chủ xe (khối "Gói & hạn mức").
 */
export function SubscriptionWorkspace() {
  const t = useTranslations('Subscription');
  const tPlan = useTranslations('Subscription.mobilePlan');
  const tPermission = useTranslations('ManageCommon.permission');
  const permissions = usePermissions();
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const [consultOpen, setConsultOpen] = useState(false);
  const closeConsult = useCallback(() => setConsultOpen(false), []);

  const canView = permissions.has(PERMISSION.SUBSCRIPTION_VIEW);
  const { data: user } = useCurrentUser();
  const serviceFeePercent = user?.tenant?.serviceFeePercent ?? null;
  const me = useMySubscription(canView);

  if (!permissions.isLoading && !canView) {
    return (
      <ScreenMessage
        icon="lock-closed-outline"
        title={tPermission('deniedTitle')}
        description={`${tPermission('deniedBody')}\n${tPermission('requires')} ${PERMISSION.SUBSCRIPTION_VIEW}`}
      />
    );
  }

  if (me.isLoading) {
    return <MiniRowsSkeleton rows={6} />;
  }

  if (me.isError || !me.data) {
    return (
      <ScreenError error={me.error} title={t('page.loadError')} onRetry={() => void me.refetch()} />
    );
  }

  const { currentPlan, usage, fleetQuota } = me.data;

  return (
    <>
      <YStack gap={space.md}>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {isPlanPromotionEnabled ? tPlan('subtitleShown') : tPlan('subtitleHidden')}
        </Text>

        <CurrentPlanCard plan={currentPlan} />

        <Card>
          <YStack gap={space.md}>
            {/* MỘT trần cho cả đội xe (ADR 0041 điều 4); hai dòng theo loại chỉ nói mức dùng. */}
            <FleetTotalRow used={fleetQuota.totalUsed} limit={fleetQuota.totalLimit ?? null} />
            <UsageRow label={t('usage.car')} usage={usage.car} icon="car-sport-outline" />
            <UsageRow label={t('usage.motorbike')} usage={usage.motorbike} icon="bicycle-outline" />

            {/* Phí dịch vụ đọc từ chính sách phí hiệu lực (`/auth/me`); tuyến gói không có dòng này. */}
            {serviceFeePercent != null ? (
              <>
                <Divider />
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {t('usage.serviceFee')}
                  </Text>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {t('usage.serviceFeeValue', { percent: serviceFeePercent })}
                  </Text>
                </XStack>
              </>
            ) : null}

            <QuotaWarning fleetQuota={fleetQuota} />
          </YStack>
        </Card>

        {isPlanPromotionEnabled ? (
          <Button
            label={tPlan('contactButton')}
            icon="chatbubbles-outline"
            onPress={() => setConsultOpen(true)}
          />
        ) : null}
      </YStack>

      <PlanConsultationSheet open={consultOpen} onClose={closeConsult} />
    </>
  );
}

/** Gói hiện hành — hoặc lời giải thích vì sao CHƯA có gói (tuyến hoa hồng, ADR 0028 điều 1). */
function CurrentPlanCard({
  plan,
}: {
  plan: NonNullable<ReturnType<typeof useMySubscription>['data']>['currentPlan'];
}) {
  const t = useTranslations('Subscription');
  const isCommission = plan?.billingMode === BILLING_MODE.COMMISSION;
  const leadColor = plan ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NEUTRAL;

  return (
    <Card padded={false}>
      <XStack>
        <CardAccent color={leadColor} />
        <YStack f={1} p={space.md} gap={space.sm}>
          <XStack ai="center" gap={space.sm}>
            <IconDisc icon="ribbon-outline" tone={colors.primary} filled />
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold} numberOfLines={2}>
                {plan ? plan.planName : t('mobilePlan.noPlan')}
              </Text>
            </YStack>
            {plan ? (
              <StatusBadge label={t('current.activeTag')} color={STATUS_COLOR.SUCCESS} size="sm" />
            ) : null}
          </XStack>

          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {!plan || isCommission
              ? t('mobilePlan.commissionSummary')
              : t('mobilePlan.packageSummary')}
          </Text>

          {plan ? <TermRow endsAt={plan.endsAt} /> : null}
        </YStack>
      </XStack>
    </Card>
  );
}

/** Trần TỔNG — một con số cho cả ô tô lẫn xe máy. `limit == null` = không giới hạn. */
function FleetTotalRow({ used, limit }: { used: number; limit: number | null }) {
  const t = useTranslations('Subscription');
  const full = limit != null && used >= limit;

  return (
    <YStack gap={space.xs} bg={colors.surfaceMuted} br={radius.md} p={space.sm}>
      <XStack ai="center" jc="space-between" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('usage.fleetTotal')}
        </Text>
        <Text col={full ? colors.warning : colors.text} fos={fontSize.body} fow={fontWeight.bold}>
          {limit == null ? used : `${used}/${limit}`}
        </Text>
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {limit == null ? t('usage.unlimited') : t('usage.fleetLimitSub')}
      </Text>
      {limit != null && limit > 0 ? (
        <ProgressBar
          percent={Math.min(100, Math.round((used / limit) * 100))}
          tone={full ? 'exception' : 'active'}
          size="sm"
        />
      ) : null}
    </YStack>
  );
}

/**
 * Còn bao nhiêu ngày, hoặc đang ở PHA nào — PHA đọc từ server (`/auth/me`), số ngày tính bằng
 * đồng hồ máy chỉ để đọc.
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
        {t('term.pillLabel')}
      </Text>
      <Text
        col={urgent ? colors.warning : colors.textMuted}
        fos={fontSize.bodySm}
        fow={fontWeight.semibold}
      >
        {lapsed
          ? t('mobilePlan.termLapsed')
          : grace
            ? t('mobilePlan.termGrace')
            : t('term.daysLeft', { days: Math.max(0, daysLeft) })}
      </Text>
    </XStack>
  );
}

/**
 * MỘT dòng cảnh báo khi đã dùng hết chỗ. Không còn lời mời mua gói: tuyến hoa hồng chỉ được
 * nói đã chạm trần của tuyến (mua gói là việc của web).
 */
function QuotaWarning({ fleetQuota }: { fleetQuota: MySubscription['fleetQuota'] }) {
  const t = useTranslations('Subscription');
  const limit = fleetQuota.totalLimit;
  if (limit == null || limit <= 0 || fleetQuota.totalUsed < limit) return null;

  return (
    <Callout
      tone="warning"
      title={
        fleetQuota.reason === QUOTA_LIMIT_REASON.OWNER_LITE
          ? t('mobilePlan.commissionLimitReached', { limit })
          : t('usage.atLimitTotal', { limit })
      }
    />
  );
}

/** Một dòng MỨC DÙNG theo loại xe — không có trần (ADR 0041 điều 4). */
function UsageRow({ label, usage, icon }: { label: string; usage: SlotUsage; icon: IconName }) {
  return (
    <XStack ai="center" gap={space.sm}>
      <IconDisc icon={icon} tone={colors.info} surface={colors.infoSurface} />
      <Text f={1} minWidth={0} col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
        {usage.used}
      </Text>
    </XStack>
  );
}
