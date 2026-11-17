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
import { useColors, useDarkAccentBorder } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { useTripHandoverWord } from '../hooks/use-trips';

type Word = 'pickup' | 'return';

/**
 * LỜI CỦA KHÁCH ở mốc giao/trả xe — bản native của web `TripHandoverWord` (ADR 0081).
 * Một khối, ba trạng thái (server quyết, client chỉ vẽ):
 *  - `canConfirmPickup` (hoặc đồng hồ đã qua `pickupConfirmOpensAt`) ⇒ nút "Đã nhận xe";
 *  - `canReportReturn` ⇒ nút "Đã trả xe";
 *  - `customerReturnedAt` ⇒ dòng "Bạn đã báo trả xe… tự hoàn thành lúc…".
 */
export function TripHandoverWord({ trip }: { trip: CustomerTripDetail }) {
  const colors = useColors();
  const accentBorder = useDarkAccentBorder();
  const t = useTranslations('Trips.handoverWord');
  const fmt = useAppFormat();
  const now = useNow();
  const [asking, setAsking] = useState<Word | null>(null);

  if (trip.customerReturnedAt && trip.returnAutoCompleteAt) {
    return (
      <Callout tone="info" title={t('reportedTitle', { time: fmt.dateTime(trip.customerReturnedAt) })}>
        {t('reportedBody', { deadline: fmt.dateTime(trip.returnAutoCompleteAt) })}
      </Callout>
    );
  }

  const opensAt = trip.pickupConfirmOpensAt ? new Date(trip.pickupConfirmOpensAt).getTime() : null;
  const pickupOpen = trip.canConfirmPickup || (opensAt !== null && now >= opensAt);
  const word: Word | null = pickupOpen ? 'pickup' : trip.canReportReturn ? 'return' : null;
  if (!word) return null;

  return (
    <YStack
      gap={space.sm}
      p={space.md}
      bw={1}
      bc={accentBorder.borderColor ?? colors.border}
      br={radius.md}
      bg={colors.surface}
    >
      <XStack ai="center" gap={space.xs}>
        <Ionicons name="checkmark-circle-outline" size={iconSize.md} color={colors.success} />
        <Text f={1} accessibilityRole="header" col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t(`${word}.title`)}
        </Text>
      </XStack>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {t(`${word}.lead`)}
      </Text>
      <Button variant="primary" shape="square" label={t(`${word}.action`)} onPress={() => setAsking(word)} />
      {/* Dựng có điều kiện: mỗi lần mở là một instance mới, không mang lỗi lần trước sang. */}
      {asking ? <WordDialog tripId={trip.id} word={asking} onClose={() => setAsking(null)} /> : null}
    </YStack>
  );
}

function WordDialog({ tripId, word, onClose }: { tripId: string; word: Word; onClose: () => void }) {
  const colors = useColors();
  const t = useTranslations('Trips.handoverWord');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const send = useTripHandoverWord(tripId, word);

  return (
    <AlertDialog
      open
      title={t(`${word}.dialogTitle`)}
      confirmLabel={t(`${word}.confirm`)}
      cancelLabel={t('keep')}
      loading={send.isPending}
      onCancel={onClose}
      onConfirm={() => {
        if (send.isPending) return;
        send.mutate(undefined, {
          onSuccess: () => {
            toast.showSuccess(t(`${word}.success`));
            onClose();
          },
        });
      }}
      body={
        <YStack gap={space.md} pt={space.xs}>
          <Text col={colors.text} fos={fontSize.body}>
            {t(`${word}.dialogBody`)}
          </Text>
          {send.isError ? <Callout tone="danger">{errorMessage(send.error)}</Callout> : null}
        </YStack>
      }
    />
  );
}
