import { useMemo } from 'react';
import { usePathname } from 'expo-router';
import { useQueryClient } from '@tanstack/react-query';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FEATURE_STATE,
  type FeatureState,
  type PlanFeature,
  type TenantStatus,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { useFeatureStates, usePlanEndsAt } from '@/features/auth/hooks/use-feature';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { shopStatusNotice } from '@/features/shop/status-notice';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { ROUTES } from '@/navigation/routes';
import { queryKeys } from '@/queries/query-keys';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';
import { flattenManageLeaves, manageNavForScope, matchActiveHref } from './manage-nav';

/**
 * Tính năng của trang đang mở nếu nó ở `read_only` — bản native của `expiredFeature` trong
 * `AppShell` web: tra `pathname → feature` từ CHÍNH cây menu CHƯA lọc, nên mục đã bị ẩn khỏi
 * drawer vẫn tra được.
 */
export function expiredFeatureForPath(
  pathname: string,
  featureStates: Partial<Record<PlanFeature, FeatureState>>,
): PlanFeature | null {
  const leaves = flattenManageLeaves(manageNavForScope(false));
  const href = matchActiveHref(pathname, leaves, String(ROUTES.manage.home()));
  const feature = leaves.find((leaf) => leaf.href != null && String(leaf.href) === href)?.feature;
  if (!feature) return null;
  return featureStates[feature] === FEATURE_STATE.READ_ONLY ? feature : null;
}

/**
 * Hai dải thường trực của khu quản lý, cùng chỗ và cùng điều kiện với `AppShell` web: dải trạng
 * thái gian hàng (tạm khoá / hết hạn → hỗ trợ; trừ chính trang hồ sơ gian hàng) và dải "gói hết
 * hạn, tính năng chỉ xem" (ADR 0027 điều 3). Sống trong `ManageHeader` nên phủ mọi màn gốc —
 * một chỗ sửa thay vì từng màn tự nhớ.
 */
export function ManageShellNotices() {
  const pathname = usePathname();
  const { tenant } = useTenantScope();
  const featureStates = useFeatureStates();
  const planEndsAt = usePlanEndsAt();
  const tShop = useTranslations('Shop');
  const t = useTranslations('ManageCommon');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const queryClient = useQueryClient();
  const navigateOnce = useNavigateOnce();

  const shopNotice = useMemo(() => {
    if (!tenant || pathname === String(ROUTES.manage.shop())) return null;
    const notice = shopStatusNotice(tenant.status as TenantStatus);
    return notice.showInShell ? notice : null;
  }, [tenant, pathname]);

  const expiredFeature = tenant ? expiredFeatureForPath(pathname, featureStates) : null;

  if (!shopNotice && !expiredFeature) return null;

  return (
    <YStack px={layout.screenX} pt={space.sm} gap={space.sm}>
      {shopNotice ? (
        <Callout
          tone={shopNotice.tone}
          title={tShop(`status.${shopNotice.key}.title` as 'status.draft.title')}
        >
          <CalloutBody>
            {tShop(`status.${shopNotice.key}.shell` as 'status.draft.shell')}
          </CalloutBody>
          {shopNotice.action ? (
            <XStack>
              <Button
                label={tShop(`status.action.${shopNotice.action.key}` as 'status.action.view')}
                variant="secondary"
                size="sm"
                shape="square"
                block={false}
                onPress={() => {
                  if (shopNotice.action) navigateOnce(shopNotice.action.href);
                }}
              />
            </XStack>
          ) : null}
        </Callout>
      ) : null}
      {expiredFeature ? (
        <Callout
          tone="warning"
          title={t('feature.expiredTitle', { feature: domainLabel('planFeature', expiredFeature) })}
        >
          <CalloutBody>
            {planEndsAt
              ? t('feature.expiredBodyWithDate', { date: fmt.date(planEndsAt) })
              : t('feature.expiredBody')}
          </CalloutBody>
          <XStack gap={space.sm} flexWrap="wrap">
            <Button
              label={t('feature.renewCta')}
              size="sm"
              shape="square"
              block={false}
              onPress={() => navigateOnce(ROUTES.manage.subscriptionPage())}
            />
            <Button
              label={t('feature.refreshCta')}
              variant="secondary"
              size="sm"
              shape="square"
              block={false}
              onPress={() => void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() })}
            />
          </XStack>
        </Callout>
      ) : null}
    </YStack>
  );
}
