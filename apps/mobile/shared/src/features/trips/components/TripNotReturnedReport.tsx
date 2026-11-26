import { Ionicons } from '@/components/icons/Ionicons';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { useReportTripNotReturned } from '../hooks/use-trips';

/**
 * "TÔI CHƯA TRẢ XE" - bản native của web `TripNotReturnedReport` (ADR 0105): chủ xe xác nhận nhận lại
 * xe SỚM hơn giờ trả mà khách vẫn đang giữ xe. Cùng hình khối với "Chưa nhận được xe".
 *
 * Luật do server quyết (`notReturnedReportUntil` chỉ có khi người đi thuê còn báo được); client chỉ
 * canh đồng hồ để tự ẩn nút lúc đóng:
 *  - `notReturnedReportOpen` ⇒ khối "đang xử lý";
 *  - còn trong hạn ⇒ thẻ giải thích + nút đỏ + hộp xác nhận;
 *  - còn lại ⇒ không vẽ gì. Cửa chặn thật là `POST /trips/:id/report-not-returned`.
 */
export function TripNotReturnedReport({ trip }: { trip: CustomerTripDetail }) {
  const colors = useColors();
  const t = useTranslations('Trips.notReturned');
  const fmt = useAppFormat();
  const now = useNow();
  const [open, setOpen] = useState(false);

  if (trip.notReturnedReportOpen) {
    return (
      <Callout tone="warning" title={t('openTitle')}>
        {t('openBody')}
      </Callout>
    );
  }

  const until = trip.notReturnedReportUntil;
  if (!until || new Date(now).getTime() > new Date(until).getTime()) return null;

  return (
    <YStack
      gap={space.sm}
      p={space.md}
      bw={1}
      bc={colors.danger}
      br={radius.md}
      bg={colors.dangerSurface}
    >
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="warning-outline" size={iconSize.md} color={colors.danger} />
        <Text
          f={1}
          accessibilityRole="header"
          col={colors.danger}
          fos={fontSize.body}
          fow={fontWeight.semibold}
        >
          {t('title')}
        </Text>
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t('lead', {
          returnAt: trip.returnAt ? fmt.dateTime(trip.returnAt) : '',
          time: fmt.dateTime(until),
        })}
      </Text>
      <Button
        variant="dangerOutline"
        shape="square"
        label={t('action')}
        onPress={() => setOpen(true)}
      />
      {/* Dựng có điều kiện: mỗi lần mở là một instance mới, không mang lỗi lần trước sang. */}
      {open ? <ReportDialog tripId={trip.id} onClose={() => setOpen(false)} /> : null}
    </YStack>
  );
}

function ReportDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const colors = useColors();
  const t = useTranslations('Trips.notReturned');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const report = useReportTripNotReturned(tripId);

  return (
    <AlertDialog
      open
      title={t('dialogTitle')}
      destructive
      confirmLabel={t('confirm')}
      cancelLabel={t('keep')}
      loading={report.isPending}
      onCancel={onClose}
      onConfirm={() => {
        if (report.isPending) return;
        report.mutate(undefined, {
          onSuccess: () => {
            toast.showSuccess(t('success'));
            onClose();
          },
        });
      }}
      body={
        <YStack gap={space.md} pt={space.xs}>
          <Text col={colors.text} fos={fontSize.body}>
            {t('dialogBody')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('dialogNote')}
          </Text>
          {report.isError ? <Callout tone="danger">{errorMessage(report.error)}</Callout> : null}
        </YStack>
      }
    />
  );
}
