import { memo, useCallback, useState } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { isDriverTripAwaitingAnswer } from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { IconLine } from '@/components/ui/IconLine';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import type { DriverTrip } from '../api';
import {
  DrivingTripBookingBadge,
  DrivingTripStatusBadge,
  drivingTripColor,
} from './DrivingTripTags';
import { useAcceptDriverTrip, useDeclineDriverTrip } from '../hooks';

/**
 * MỘT chuyến tôi lái — bản native của `DrivingTripCard` (web). Vạch màu mép trái theo lượt gán
 * (chờ nhận = vàng, đã nhận = xanh) + trạng thái lượt gán ở góc trên phải. Chạm phần thân để mở
 * chi tiết; chuyến đang chờ tôi nhận có thêm hàng nút Nhận / Từ chối ở góc dưới phải — NẰM NGOÀI
 * vùng chạm mở chi tiết, để một cú bấm nút không đồng thời điều hướng.
 */
function DrivingTripCardImpl({
  trip,
  onPress,
}: {
  trip: DriverTrip;
  onPress: (trip: DriverTrip) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Driving.trips');
  const tDetail = useTranslations('Driving.detail');
  const tToast = useTranslations('Driving.toast');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const accept = useAcceptDriverTrip();
  const decline = useDeclineDriverTrip();
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const busy = accept.isPending || decline.isPending;

  const pending = isDriverTripAwaitingAnswer(trip);
  const open = useCallback(() => onPress(trip), [onPress, trip]);

  const title = [trip.vehicle.name, trip.vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR);

  return (
    <>
      <Card padded={false}>
        <XStack>
          <CardAccent color={drivingTripColor(trip)} />
          <YStack f={1} minWidth={0}>
            <Pressable onPress={open} accessibilityRole="button" accessibilityLabel={title}>
              <YStack p={space.sm} gap={space.xs}>
                <XStack ai="center" gap={space.xs}>
                  <Text
                    f={1}
                    col={colors.text}
                    fos={fontSize.body}
                    fow={fontWeight.semibold}
                    numberOfLines={1}
                  >
                    {title}
                  </Text>
                  <DrivingTripStatusBadge trip={trip} />
                </XStack>
                <XStack ai="center" gap={space.xs} flexWrap="wrap">
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {trip.code}
                  </Text>
                  <DrivingTripBookingBadge trip={trip} />
                </XStack>
                <IconLine icon="time-outline">
                  {fmt.dateTimeRange(trip.pickupAt, trip.returnAt)}
                </IconLine>
                <IconLine icon="briefcase-outline">
                  {t('for', { name: trip.employer.name })}
                </IconLine>
                <IconLine icon="person-outline">
                  {trip.customer.phone
                    ? t('customerWithPhone', {
                        name: trip.customer.name,
                        phone: trip.customer.phone,
                      })
                    : t('customer', { name: trip.customer.name })}
                </IconLine>
                {trip.pickupAddress ? (
                  <IconLine icon="location-outline">
                    {t('pickup', { address: trip.pickupAddress })}
                  </IconLine>
                ) : null}
                {trip.destination ? (
                  <IconLine icon="flag-outline">
                    {t('destination', { destination: trip.destination })}
                  </IconLine>
                ) : null}
                {pending ? (
                  <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {t('needsAnswer')}
                  </Text>
                ) : null}
              </YStack>
            </Pressable>

            {pending ? (
              <XStack jc="flex-end" gap={space.sm} px={space.sm} pb={space.sm}>
                <Button
                  label={tDetail('decline')}
                  variant="ghostDanger"
                  size="sm"
                  disabled={busy}
                  loading={decline.isPending}
                  onPress={() => setConfirmingDecline(true)}
                />
                <Button
                  label={tDetail('accept')}
                  icon="checkmark-outline"
                  size="sm"
                  disabled={busy}
                  loading={accept.isPending}
                  onPress={() =>
                    accept.mutate(trip.id, {
                      onSuccess: () => toast.showSuccess(tToast('tripAccepted')),
                      onError: (err) => toast.showError(errorMessage(err)),
                    })
                  }
                />
              </XStack>
            ) : null}
          </YStack>
        </XStack>
      </Card>

      {pending ? (
        <AlertDialog
          open={confirmingDecline}
          title={tDetail('declineConfirm')}
          confirmLabel={tDetail('decline')}
          cancelLabel={tActions('close')}
          destructive
          loading={decline.isPending}
          onConfirm={() =>
            decline.mutate(trip.id, {
              onSuccess: () => {
                setConfirmingDecline(false);
                toast.showSuccess(tToast('tripDeclined'));
              },
              onError: (err) => {
                setConfirmingDecline(false);
                toast.showError(errorMessage(err));
              },
            })
          }
          onCancel={() => setConfirmingDecline(false)}
        />
      ) : null}
    </>
  );
}

/** `memo`: HÀNG của một danh sách cuộn vô hạn. */
export const DrivingTripCard = memo(DrivingTripCardImpl);
