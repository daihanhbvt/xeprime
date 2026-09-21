import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, space } from '@/theme/tokens';
import type { SubscriptionInvoice } from '@/api/subscription/api';
import { usePlanPurchase } from '../plan-purchase';
import { usePurchaseSubscription, useTenantPlans } from '../hooks/use-subscription';
import { InvoicePaymentPanel } from './InvoicePaymentPanel';
import { PlanPricingTable } from './PlanPricingTable';

/**
 * Mua / gia hạn gói (W2, ADR 0015): chọn gói + kỳ hạn + số chỗ → sinh HOÁ ĐƠN kèm mã đối soát.
 *
 * Gói chỉ kích hoạt khi tiền về (ADR 0026 điều 4) — tấm này chuyển sang bước "chuyển khoản" NGAY
 * khi hoá đơn tạo xong để mã không bị bỏ lỡ.
 *
 * Bộ chọn và công thức giá đến từ `usePlanPurchase` + `PlanPurchaseFields`, dùng chung với bước 2
 * của onboarding gian hàng trả phí: hai bản của cùng công thức là cách chắc chắn nhất để một màn
 * hiện một con số mà server tính ra con số khác.
 */
export function PurchaseSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Subscription');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const plans = useTenantPlans(open);
  const purchase = usePurchaseSubscription();
  const selection = usePlanPurchase(plans.data ?? []);
  /** Hoá đơn vừa tạo — có giá trị là tấm đang ở bước "chuyển khoản". */
  const [invoice, setInvoice] = useState<SubscriptionInvoice | null>(null);

  function submit() {
    if (!selection.selection) return;
    purchase.mutate(selection.selection.body, {
      onSuccess: (created) => setInvoice(created),
      onError: (error) => toast.showError(errorMessage(error)),
    });
  }

  function close() {
    setInvoice(null);
    selection.reset();
    onClose();
  }

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={invoice ? t('payment.title') : t('purchase.title')}
    >
      {invoice ? (
        <YStack gap={space.md}>
          {/*
            Hướng dẫn chuyển khoản dùng CHUNG với màn "Gói của tôi" — đóng tấm rồi vẫn tìm lại
            được cùng một QR ở đó.
          */}
          <InvoicePaymentPanel invoice={invoice} />
          <Button label={t('payment.done')} onPress={close} />
        </YStack>
      ) : plans.isLoading ? (
        <MiniRowsSkeleton rows={4} />
      ) : plans.isError ? (
        <YStack gap={space.sm}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('purchase.loadError')}
          </Text>
          <Button
            label={tCommon('retry')}
            variant="secondary"
            size="sm"
            onPress={() => void plans.refetch()}
          />
        </YStack>
      ) : selection.tiers.length === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('purchase.empty')}
        </Text>
      ) : (
        <YStack gap={space.md}>
          <PlanPricingTable state={selection} />

          {/*
            Đây là lần DUY NHẤT gian hàng trả tiền cho XePrime, và quy chế sàn là văn bản quy định
            phí dịch vụ với thứ tự hiển thị mà họ đang mua. Khu quản lý không có chân trang chợ xe
            nên nếu không đặt ở đây thì không có đường nào khác.
          */}
          <LegalConsentNote place="subscription" />

          <YStack gap={space.sm}>
            <Button
              label={t('purchase.submit')}
              loading={purchase.isPending}
              disabled={!selection.selection}
              onPress={submit}
            />
            <Button
              label={tCommon('close')}
              variant="ghost"
              disabled={purchase.isPending}
              onPress={close}
            />
          </YStack>
        </YStack>
      )}
    </BottomSheet>
  );
}
