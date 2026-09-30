import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DEPOSIT_POLICY_REASON, PERMISSION, STATUS_COLOR } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { ScreenError } from '@/components/state/ScreenError';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { PaymentSettings } from '../api';
import { usePaymentSettings, useUpdatePaymentSettings } from '../hooks/use-shop';

/**
 * THU CỌC QUA XEPRIME — một KHỐI trong màn "Chính sách thuê", không còn là một màn riêng.
 *
 * Gương của web (16/09/2026): cả trang cũ chỉ có đúng MỘT công tắc, nên nó về sống cạnh các
 * thiết lập tiền cọc/thế chấp mà gian hàng vốn đã tới đó để chỉnh. Route cũ
 * `/manage/shop/payment-settings` còn sống dưới dạng chuyển hướng, cho ai đã đặt lối tắt.
 *
 * KHÔNG gác theo `PLAN_FEATURE.ESCROW_HOLD` (ADR 0027 điều 4): gian hàng thiếu cờ phải ĐỌC được
 * trạng thái và hiểu tính năng thuộc gói nào; chặn thật nằm ở server cho đường GHI.
 *
 * Tự IM LẶNG khi người dùng không có `seller_profile.view` — đây là một khối giữa trang, không
 * phải một màn, nên không có chỗ để dựng một trạng thái "không có quyền" của riêng nó; màn chứa
 * nó đã có trạng thái đó cho chính sách thuê.
 */
export function DepositSettingsSection() {
  const t = useTranslations('Shop.paymentSettings');
  const { has } = usePermissions();
  const { tenant } = useTenantScope();

  const canView = has(PERMISSION.SELLER_PROFILE_VIEW);
  const canEdit = has(PERMISSION.SELLER_PROFILE_MANAGE);
  const query = usePaymentSettings(canView && Boolean(tenant));

  if (!canView) return null;

  return (
    <YStack gap={space.md}>
      {/*
        Tiêu đề khối tự dựng chứ không mượn `BlockTitle`: đây là một MỤC ngang hàng với các khối
        chính sách của màn (thẻ trắng, tiêu đề cỡ thường), không phải một nhãn nhỏ bên trong thẻ.
      */}
      <YStack gap={2}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('subtitle')}
        </Text>
      </YStack>

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
    </YStack>
  );
}

/** `null` = công tắc dùng được. Chuỗi trả về là khoá i18n dưới `locked.*`. */
function lockReason(
  settings: PaymentSettings,
): 'platform' | 'commission' | 'featureMissing' | 'notConfigured' | null {
  /*
   * ĐỨNG TRƯỚC mọi lý do khác, cùng thứ tự với `DepositPolicyService.resolveForTenant`: trong
   * giai đoạn này không gian hàng nào đọc được lý do theo tuyến hay theo gói nữa, và hiện câu
   * "bạn đang ở tuyến hoa hồng" cho một gian hàng tuyến gói là nói sai về hợp đồng của họ.
   */
  if (settings.reason === DEPOSIT_POLICY_REASON.PLATFORM_MANDATORY) return 'platform';
  if (settings.reason === DEPOSIT_POLICY_REASON.COMMISSION_MANDATORY) return 'commission';
  if (settings.reason === DEPOSIT_POLICY_REASON.PACKAGE_FEATURE_MISSING) return 'featureMissing';
  /*
   * Chưa xác định được tuyến — LỖI CẤU HÌNH, không phải một lựa chọn kinh doanh (ADR 0038).
   *
   * Phải có câu riêng: hai câu trên đều nói "gói của bạn quy định thế", còn ở đây gian hàng không
   * làm gì sai và cũng không tự sửa được. Gộp vào featureMissing sẽ đẩy họ đi mua một gói mà họ
   * đã có.
   */
  if (settings.reason === DEPOSIT_POLICY_REASON.BILLING_NOT_CONFIGURED) return 'notConfigured';
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
function DepositToggleCard({ settings, canEdit }: { settings: PaymentSettings; canEdit: boolean }) {
  const t = useTranslations('Shop.paymentSettings');
  const router = useRouter();
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
              Khoá theo GIAI ĐOẠN thì không có nút nào cả: không có gói nào mua được để mở nó, và
              một nút "Xem gói thuê bao" ở đây là mời gian hàng đi tiêu tiền cho một thứ không
              liên quan. Ba lý do còn lại đều có một việc thật để làm.
            */}
            {locked === 'platform' ? null : (
              <Button
                label={t(`locked.${locked}.cta` as never)}
                variant="secondary"
                size="sm"
                onPress={() => router.push(ROUTES.manage.subscription())}
              />
            )}
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
