import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { ScreenError } from '@/components/state/ScreenError';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { useUpdateVatInvoiceSetting, useVatInvoiceSetting } from '../hooks/use-shop';

/**
 * "Hỗ trợ xuất hoá đơn VAT" — MỘT thiết lập cho mọi xe của gian hàng / chủ xe (ADR 0059). Bản
 * native của `VatInvoiceSetting` bên web.
 *
 * Hai chỗ đặt, một component: tuyến gói ở "Chính sách thuê" (`ShopPolicyScreen`), tuyến hoa hồng ở
 * "Hồ sơ chủ xe" (`OwnerProfileScreen`). Component chỉ là PHẦN THÂN (thẻ); tiêu đề khối là của màn
 * chứa nó.
 *
 * Lưu ngay khi bấm; `checked` bám cache `GET /tenants/current/vat-invoice`, nên lỗi thì công tắc
 * đứng nguyên chỗ cũ kèm thông báo theo MÃ lỗi. Thiếu `tenant.update` (`canEdit`) thì chỉ còn
 * trạng thái bằng chữ — không vẽ công tắc cho một hành động không mở. App không có phiên hỗ trợ
 * của nền tảng, nên không có nhánh `useSupportHides` như web.
 */
export function VatInvoiceSetting({ canEdit }: { canEdit: boolean }) {
  const t = useTranslations('Shop.vatInvoice');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const setting = useVatInvoiceSetting(true);
  const update = useUpdateVatInvoiceSetting();

  if (setting.isError && !setting.data) {
    return (
      <ScreenError
        error={setting.error}
        title={t('loadError')}
        onRetry={() => void setting.refetch()}
      />
    );
  }

  if (!setting.data) return <MiniRowsSkeleton rows={2} />;

  const on = setting.data.vatInvoiceSupported;

  function onToggle() {
    if (update.isPending) return;
    const next = !on;
    update.mutate(next, {
      onSuccess: () => toast.showSuccess(next ? t('enabled') : t('disabled')),
      onError: (error) => toast.showError(errorMessage(error)),
    });
  }

  return (
    <Card>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.sm}>
          <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('label')}
          </Text>
          <StatusBadge
            label={on ? t('on') : t('off')}
            color={on ? STATUS_COLOR.SUCCESS : STATUS_COLOR.NEUTRAL}
            size="sm"
          />
        </XStack>
        {canEdit ? (
          <ToggleRow
            label={t('ariaLabel')}
            checked={on}
            disabled={update.isPending}
            onToggle={onToggle}
          />
        ) : null}
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('note')}
        </Text>
      </YStack>
    </Card>
  );
}
