import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DEPOSIT_POLICY_REASON, PERMISSION, STATUS_COLOR } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { PaymentSettings } from './api';
import { usePaymentSettings, useUpdatePaymentSettings } from './hooks/use-shop';

/**
 * Công tắc thu cọc qua XePrime (Phase 6) — bản native của `/manage/shop/payment-settings`.
 *
 * Màn KHÔNG gác theo `PLAN_FEATURE.ESCROW_HOLD` (ADR 0027 điều 4): gian hàng thiếu cờ vào đây để
 * ĐỌC trạng thái và hiểu tính năng thuộc gói nào; chặn thật nằm ở server cho đường GHI.
 */
export function ShopPaymentSettingsScreen() {
  const t = useTranslations('Shop.paymentSettings');
  const tShop = useTranslations('Shop.page');
  const { has } = usePermissions();
  const { tenant } = useTenantScope();

  const canView = has(PERMISSION.SELLER_PROFILE_VIEW);
  const canEdit = has(PERMISSION.SELLER_PROFILE_MANAGE);
  const query = usePaymentSettings(canView && Boolean(tenant));

  if (!canView) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('forbidden.title')}
            description={t('forbidden.description')}
            actionLabel={tShop('forbidden.backHome')}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']}>
        <ManagePageTitle title={t('title')} subtitle={t('subtitle')} />

        {query.isLoading ? (
          <MiniRowsSkeleton rows={5} />
        ) : query.isError || !query.data ? (
          <ScreenError
            error={query.error}
            title={t('loadError')}
            onRetry={() => void query.refetch()}
          />
        ) : (
          <DepositToggleCard settings={query.data} canEdit={canEdit} />
        )}
      </Screen>
    </>
  );
}

/** `null` = công tắc dùng được. Chuỗi trả về là khoá i18n dưới `locked.*`. */
function lockReason(settings: PaymentSettings): 'commission' | 'featureMissing' | null {
  if (settings.reason === DEPOSIT_POLICY_REASON.COMMISSION_MANDATORY) return 'commission';
  if (settings.reason === DEPOSIT_POLICY_REASON.PACKAGE_FEATURE_MISSING) return 'featureMissing';
  return null;
}

/**
 * Công tắc thu cọc — ba trạng thái, và cả ba đều HIỆN công tắc:
 *
 *  - **Tuyến hoa hồng**: bật + khoá. Ẩn nó đi thì chủ xe cơ bản không có chỗ nào đọc được vì sao
 *    khách của họ phải chuyển tiền trước — ADR 0027 điều 4 nói thẳng ẩn nút chỉ là trang trí.
 *  - **Gói thiếu `escrow_hold`**: khoá + lời mời nâng gói, kèm câu trấn an rằng họ vẫn nhận đơn
 *    bình thường. Một tính năng bị khoá phải nói được cái giá của việc không có nó.
 *  - **Gói có cờ**: bật/tắt tự do.
 *
 * Chặn THẬT nằm ở server (`DepositPolicyService.updateSettings` ném 403); `canEdit` ở đây chỉ để
 * không mời người dùng bấm một thứ chắc chắn hỏng.
 */
function DepositToggleCard({
  settings,
  canEdit,
}: {
  settings: PaymentSettings;
  canEdit: boolean;
}) {
  const t = useTranslations('Shop.paymentSettings');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const update = useUpdatePaymentSettings();

  const locked = lockReason(settings);
  const editable = settings.editable && canEdit;

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.sm}>
          <XStack ai="center" gap={space.sm}>
            <Ionicons name="wallet-outline" size={iconSize.md} color={colors.primaryActive} />
            <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('toggle.label')}
            </Text>
            <StatusBadge
              label={settings.depositRequired ? t('toggle.on') : t('toggle.off')}
              color={settings.depositRequired ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NEUTRAL}
              size="sm"
            />
          </XStack>

          <ToggleRow
            label={t('toggle.label')}
            checked={settings.depositRequired}
            disabled={!editable || update.isPending}
            onToggle={() =>
              update.mutate(
                { depositCollectionEnabled: !settings.depositRequired },
                {
                  onSuccess: () => toast.showSuccess(t('toggle.saved')),
                  onError: (error) => toast.showError(errorMessage(error)),
                },
              )
            }
          />
        </YStack>
      </Card>

      {locked ? (
        <Card tone="muted" lift="flat">
          <YStack gap={space.sm}>
            <XStack ai="flex-start" gap={space.sm}>
              <Ionicons name="lock-closed" size={iconSize.sm} color={colors.info} />
              <YStack f={1} minWidth={0} gap={2}>
                <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                  {t(`locked.${locked}.title` as never)}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t(`locked.${locked}.body` as never)}
                </Text>
              </YStack>
            </XStack>
            {/*
              Web kèm nút "Xem gói thuê bao" dẫn tới `/manage/subscription`. App chưa dựng màn
              gói, nên ở đây chỉ còn lời giải thích — một nút dẫn tới màn không tồn tại còn tệ
              hơn là không có nút.
            */}
          </YStack>
        </Card>
      ) : null}

      {/*
        Hệ quả của trạng thái ĐANG ÁP DỤNG, không phải của vị trí công tắc: gian hàng tắt công tắc
        nhưng ở tuyến hoa hồng vẫn đang thu, và họ cần đọc đúng cái đang xảy ra với khách.
      */}
      <Callout
        tone={settings.depositRequired ? 'success' : 'warning'}
        title={settings.depositRequired ? t('mode.onTitle') : t('mode.offTitle')}
      >
        {settings.depositRequired ? t('mode.onBody') : t('mode.offBody')}
      </Callout>

      <Text col={colors.placeholder} fos={fontSize.label}>
        {t('frozen')}
      </Text>
    </YStack>
  );
}
