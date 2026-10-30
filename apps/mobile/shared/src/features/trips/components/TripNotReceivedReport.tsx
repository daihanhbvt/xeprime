import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { TRIP_ROLE, notReceivedWindowPhase } from '@xeprime/types';
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
import { useReportTripNotReceived } from '../hooks/use-trips';

/**
 * "CHƯA NHẬN ĐƯỢC XE" — bản native của web `TripNotReceivedReport` (ADR 0066, lớp 1).
 *
 * Ba trạng thái — luật do server quyết, client chỉ canh ĐỒNG HỒ để hiện/ẩn đúng mốc:
 *  - `openDispute` ⇒ khối "đang xử lý" (người thuê) hoặc "đang có khiếu nại" (chủ xe xem cùng chuyến);
 *  - server còn cho báo (`notReceivedReportUntil`) và đồng hồ trong `[pickupAt, pickupAt + 120′]`
 *    ⇒ nút đỏ + hộp xác nhận nói rõ hệ quả;
 *  - còn lại ⇒ không vẽ gì. Cửa chặn thật vẫn là `POST /trips/:id/report-not-received`.
 */
export function TripNotReceivedReport({ trip }: { trip: CustomerTripDetail }) {
  const colors = useColors();
  const t = useTranslations('Trips.notReceived');
  const fmt = useAppFormat();
  const now = useNow();
  const [open, setOpen] = useState(false);

  if (trip.openDispute) {
    const host = trip.role === TRIP_ROLE.HOST;
    return (
      <Callout tone="warning" title={host ? t('hostOpenTitle') : t('openTitle')}>
        {host ? t('hostOpenBody') : t('openBody')}
      </Callout>
    );
  }

  // Chỉ để HIỂN THỊ — xem chú thích cùng chỗ ở web: trang mở trước giờ nhận xe phải tự hiện nút
  // đúng `pickupAt` và tự ẩn lúc cửa sổ đóng, không chờ hỏi lại server.
  const until = trip.notReceivedReportUntil;
  const windowOpen =
    until != null &&
    trip.pickupAt != null &&
    notReceivedWindowPhase(new Date(trip.pickupAt), new Date(now)) === 'open';
  if (!windowOpen) return null;

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
        {t('lead', { time: fmt.dateTime(until) })}
      </Text>
      <Button variant="dangerOutline" shape="square" label={t('action')} onPress={() => setOpen(true)} />
      {/* Dựng có điều kiện: mỗi lần mở là một instance mới, không mang lỗi lần trước sang. */}
      {open ? <ReportDialog tripId={trip.id} onClose={() => setOpen(false)} /> : null}
    </YStack>
  );
}

function ReportDialog({ tripId, onClose }: { tripId: string; onClose: () => void }) {
  const colors = useColors();
  const t = useTranslations('Trips.notReceived');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const report = useReportTripNotReceived(tripId);

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
