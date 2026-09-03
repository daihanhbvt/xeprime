import { useState } from 'react';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PAYMENT_KIND,
  PAYMENT_STATUS,
  PAYMENT_STATUS_META,
  PERMISSION,
  type PaymentStatus,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { usePaymentHistory, useVoidPayment } from './hooks/use-settlement';
import type { Payment } from './api';

/**
 * LỊCH SỬ tiền của một đơn (FIN-06) — bản native của `PaymentHistory`.
 *
 * Chỉ ĐỌC. Ghi một khoản thu đi qua `RecordPaymentSheet`, mở từ nơi người dùng đang nhìn thấy
 * con số phải thu: nút "Thu tiền" trên thanh hành động của đơn, hoặc "Thu cọc" trên thẻ Phát
 * sinh & Tiền cọc. Đúng ranh giới web dựng — một nút ghi tiền đặt trong hộp lịch sử thì nơi bấm
 * cách xa con số nó nói tới.
 *
 * `kind` phân biệt tiền thuê với tiền cọc, và phân biệt đó là quan trọng: **cọc không cộng vào
 * "đã trả"** — nó là tài sản giữ hộ, và cộng nó vào là báo cho chủ xe rằng khách đã trả một
 * khoản họ chưa trả.
 */
export function PaymentsScreen({ bookingId }: { bookingId: string }) {
  const t = useTranslations('Bookings.payments');
  const router = useRouter();
  const query = usePaymentHistory(bookingId);

  const back = () => goBackOr(router, ROUTES.manage.bookingDetail(bookingId));

  return (
    <>
      <AppHeader title={t('title')} onBack={back} />
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <YStack gap={layout.section}>
          <YStack bg={colors.infoSurface} p={space.md} br={space.xs}>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {t('manualOnly')}
            </Text>
          </YStack>

          {query.isPending ? (
            <YStack gap={space.sm}>
              <Skeleton height={70} />
              <Skeleton height={70} />
            </YStack>
          ) : query.isError ? (
            <ScreenError
              error={query.error}
              title={t('errorTitle')}
              onRetry={() => void query.refetch()}
            />
          ) : (query.data?.length ?? 0) === 0 ? (
            <Card tone="muted" lift="flat">
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('empty')}
              </Text>
            </Card>
          ) : (
            query.data?.map((payment) => (
              <PaymentRow key={payment.id} bookingId={bookingId} payment={payment} />
            ))
          )}
        </YStack>
      </Screen>
    </>
  );
}

function PaymentRow({ bookingId, payment }: { bookingId: string; payment: Payment }) {
  const t = useTranslations('Bookings.payments');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const voidPayment = useVoidPayment(bookingId);
  const [confirming, setConfirming] = useState(false);

  const status = payment.status as PaymentStatus;
  const meta = PAYMENT_STATUS_META[status];
  const deposit = payment.kind === PAYMENT_KIND.DEPOSIT;

  return (
    <Card>
      <YStack gap={space.xs}>
        <XStack ai="center" jc="space-between" gap={space.sm}>
          <XStack ai="center" gap={space.xs}>
            <Chip label={domainLabel('paymentKind', payment.kind)} size="sm" />
            <StatusBadge
              label={domainLabel('paymentStatus', status, meta.label)}
              color={meta.color}
              size="sm"
            />
          </XStack>
          <Text
            col={deposit ? colors.text : colors.price}
            fos={fontSize.body}
            fow={fontWeight.bold}
          >
            {fmt.money(payment.amount)}
          </Text>
        </XStack>

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {domainLabel('paymentMethod', payment.method)} ·{' '}
          {fmt.dateTime(payment.paidAt ?? payment.createdAt)}
        </Text>

        {/* Cọc là tài sản giữ hộ — nói rõ ngay trên phiếu, không để người đọc tự suy. */}
        {deposit ? (
          <Text col={colors.textMuted} fos={fontSize.label}>
            {t('depositHint')}
          </Text>
        ) : null}

        {/*
          Điều kiện lấy ĐÚNG của web: mọi phiếu chưa hoàn đều bày nút.

          Trên thực tế server chỉ lật `succeeded → refunded`, nên phiếu `pending`/`failed` bấm
          vào sẽ nhận lỗi. Giữ nguyên vì web là chuẩn — và vì đây là sổ ghi tay (ADR 0013),
          phiếu ghi xong là `succeeded`, hai trạng thái kia gần như không tồn tại trong thực tế.
        */}
        {permissions.has(PERMISSION.PAYMENT_VOID) && status !== PAYMENT_STATUS.REFUNDED ? (
          <>
            {/* Hoàn một phiếu tiền là thao tác có audit — hỏi lại trước khi làm. */}
            <Button
              label={t('void')}
              variant="ghost"
              loading={voidPayment.isPending}
              onPress={() => setConfirming(true)}
            />
            <AlertDialog
              open={confirming}
              title={t('void')}
              message={t('voidConfirm')}
              confirmLabel={t('void')}
              destructive
              loading={voidPayment.isPending}
              onCancel={() => setConfirming(false)}
              onConfirm={() =>
                voidPayment.mutate(payment.id, {
                  onSuccess: () => {
                    toast.showSuccess(t('voidSuccess'));
                    setConfirming(false);
                  },
                  onError: (error) => {
                    toast.showError(errorMessage(error));
                    setConfirming(false);
                  },
                })
              }
            />
          </>
        ) : null}
      </YStack>
    </Card>
  );
}
