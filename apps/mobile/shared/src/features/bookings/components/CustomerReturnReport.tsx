import { useState } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BOOKING_STATUS } from '@xeprime/types';
import { toAppTz } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useRejectCustomerReturn } from '@/features/handovers/hooks/use-handovers';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import type { BookingDetail } from '../api';

/**
 * Lời báo "Đã trả xe" của khách đang chờ gian hàng (ADR 0081) — bản native của web
 * `CustomerReturnReport`. Hai lối ra: xác nhận biên bản nhận xe như thường (nút chính của thanh hành
 * động), hoặc "Khách chưa trả xe" ⇒ huỷ lời báo + XePrime mở tranh chấp. Im lặng quá hạn ⇒ tự hoàn
 * thành. `canDispute` đi cùng quyền xác nhận bàn giao — server kiểm lại.
 */
export function CustomerReturnReport({
  booking,
  canDispute,
}: {
  booking: BookingDetail;
  canDispute: boolean;
}) {
  if (
    booking.status !== BOOKING_STATUS.ACTIVE ||
    !booking.customerReturnedAt ||
    !booking.returnAutoCompleteAt
  ) {
    return null;
  }
  return (
    <PendingReport
      bookingId={booking.id}
      reportedAt={booking.customerReturnedAt}
      deadline={booking.returnAutoCompleteAt}
      canDispute={canDispute}
    />
  );
}

function PendingReport({
  bookingId,
  reportedAt,
  deadline,
  canDispute,
}: {
  bookingId: string;
  reportedAt: string;
  deadline: string;
  canDispute: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Bookings.detailPage.customerReturn');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const [confirming, setConfirming] = useState(false);
  const reject = useRejectCustomerReturn(bookingId);

  return (
    <>
      <Callout tone="warning" title={t('title', { time: fmt.rentalPoint(toAppTz(reportedAt)) })}>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.bodySm}>
            {t('body', { deadline: fmt.rentalPoint(toAppTz(deadline)) })}
          </Text>
          {canDispute ? (
            <Button
              label={t('reject')}
              variant="dangerOutline"
              size="sm"
              onPress={() => setConfirming(true)}
            />
          ) : null}
        </YStack>
      </Callout>
      <AlertDialog
        open={confirming}
        title={t('confirmTitle')}
        destructive
        confirmLabel={t('confirmOk')}
        loading={reject.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          if (reject.isPending) return;
          reject.mutate(undefined, {
            onSuccess: () => {
              setConfirming(false);
              toast.showSuccess(t('rejected'));
            },
            onError: (err) => toast.showError(errorMessage(err)),
          });
        }}
        body={
          <Text col={colors.text} fos={fontSize.body}>
            {t('confirmBody')}
          </Text>
        }
      />
    </>
  );
}
