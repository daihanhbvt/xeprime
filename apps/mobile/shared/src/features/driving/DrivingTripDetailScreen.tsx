import { useState, type ReactNode } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { API_ERROR_CODE, isDriverTripAwaitingAnswer } from '@xeprime/types';
import {
  driverWageLine,
  LIST_SEPARATOR,
  mapExternalUrl,
  mapSearchUrl,
  toGeoPoint,
} from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { getErrorCode } from '@/lib/api-client';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { DrivingTripBookingBadge, DrivingTripStatusBadge } from './components/DrivingTripTags';
import { DriverRespondCountdown } from './components/DriverRespondCountdown';
import { DropTripSheet } from './components/DropTripSheet';
import { useAcceptDriverTrip, useDeclineDriverTrip, useDriverTrip } from './hooks';

/** Có toạ độ thì mở đúng điểm (ADR 0061); chỉ có địa chỉ chữ thì tìm theo chữ. */
function placeMapUrl(
  address: string | null | undefined,
  lat: number | null | undefined,
  lng: number | null | undefined,
): string | null {
  const point = toGeoPoint(lat, lng);
  return point ? mapExternalUrl(point) : mapSearchUrl(address);
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {title}
        </Text>
        {children}
      </YStack>
    </Card>
  );
}

/**
 * Chi tiết một chuyến tôi lái (`/trips/driving/:id`, ADR 0063) — bản native của
 * `DrivingTripDetailView` (web). Chỉ xem, cộng nhận/từ chối khi lượt gán còn `pending`. SĐT khách
 * do SERVER che ngoài cửa sổ quanh chuyến; màn này chỉ nói khi nào nó hiện, không tự tính.
 * Gọi điện (`tel:`) và mở bản đồ đi qua ứng dụng của máy.
 */
export function DrivingTripDetailScreen({ bookingId }: { bookingId: string }) {
  const colors = useColors();
  const t = useTranslations('Driving.detail');
  const tToast = useTranslations('Driving.toast');
  const tActions = useTranslations('Common.actions');
  const router = useRouter();
  const toast = useAppToast();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const tCard = useTranslations('Driving.tripCard');
  const tWage = useTranslations('Driving.wage');
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);

  const query = useDriverTrip(bookingId);
  const accept = useAcceptDriverTrip();
  const decline = useDeclineDriverTrip();
  const busy = accept.isPending || decline.isPending;
  const trip = query.data;

  const back = () => goBackOr(router, ROUTES.driving.trips());
  const openUrl = (url: string) => void Linking.openURL(url);

  const header = (
    <AppHeader title={trip ? t('title', { code: trip.code }) : t('back')} onBack={back} />
  );

  if (query.isPending) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <YStack gap={layout.section}>
            <Skeleton height={96} />
            <SkeletonText lines={4} />
            <SkeletonText lines={3} />
          </YStack>
        </Screen>
      </>
    );
  }

  if (query.isError || !trip) {
    const notFound = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {notFound ? (
            <ScreenMessage
              icon="search-outline"
              title={t('loadError')}
              description={t('notFound')}
              actionLabel={t('back')}
              onAction={back}
            />
          ) : (
            <ScreenError
              error={query.error}
              title={t('loadError')}
              onRetry={() => void query.refetch()}
            />
          )}
        </Screen>
      </>
    );
  }

  const pending = isDriverTripAwaitingAnswer(trip);
  const pickupMap = placeMapUrl(trip.pickupAddress, trip.pickupLatitude, trip.pickupLongitude);
  const destinationMap = placeMapUrl(
    trip.destination,
    trip.destinationLatitude,
    trip.destinationLongitude,
  );
  const empty = t('emptyValue');
  const wageLine = driverWageLine(trip.wage);

  return (
    <>
      {header}
      <Screen
        edges={['left', 'right', 'bottom']}
        // Kéo để tải lại — bên thuê đổi người/đơn đổi trạng thái khi push chưa tới (gương web refetch).
        refreshing={query.isRefetching}
        onRefresh={() => void query.refetch()}
      >
        <YStack gap={layout.section}>
          <YStack gap={space.xs}>
            <XStack gap={space.xs} flexWrap="wrap">
              <DrivingTripStatusBadge trip={trip} />
              <DrivingTripBookingBadge trip={trip} />
            </XStack>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {trip.respondedAt
                ? t('respondedAt', { time: fmt.dateTime(trip.respondedAt) })
                : t('assignedAt', { time: fmt.dateTime(trip.assignedAt) })}
            </Text>
          </YStack>

          {pending ? (
            <Callout tone="warning" title={t('pendingTitle')}>
              <YStack gap={space.sm}>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('pendingBody')}
                </Text>
                <DriverRespondCountdown respondBy={trip.respondBy} />
                <XStack gap={space.sm}>
                  <YStack flexShrink={0}>
                    <Button
                      label={t('decline')}
                      variant="ghostDanger"
                      disabled={busy}
                      loading={decline.isPending}
                      onPress={() => setConfirmingDecline(true)}
                    />
                  </YStack>
                  <YStack f={1}>
                    <Button
                      label={t('accept')}
                      icon="checkmark-outline"
                      disabled={busy}
                      loading={accept.isPending}
                      onPress={() =>
                        accept.mutate(trip.id, {
                          onSuccess: () => toast.showSuccess(tToast('tripAccepted')),
                          onError: (err) => toast.showError(errorMessage(err)),
                        })
                      }
                    />
                  </YStack>
                </XStack>
              </YStack>
            </Callout>
          ) : null}

          {/* Đã nhận, chưa giao xe: rút được khi có sự cố (ADR 0074) — trong cửa sổ trả lại thì không phạt. */}
          {trip.canDrop ? (
            <Callout tone="success" title={tCard('confirmed')}>
              <YStack gap={space.sm}>
                {trip.releaseUntil ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('dropFreeUntil', { time: fmt.dateTime(trip.releaseUntil) })}
                  </Text>
                ) : null}
                <Button
                  label={tCard('drop')}
                  icon="warning-outline"
                  variant="dangerOutline"
                  disabled={busy}
                  onPress={() => setDropOpen(true)}
                />
              </YStack>
            </Callout>
          ) : null}

          {/*
           * Tiền công của CHÍNH tài xế (ADR 0075) — số hiện hành theo chặng và lịch sử sửa nếu có.
           * Chủ xe trả trực tiếp; không có tiền nào khác của chuyến ở đây.
           */}
          {wageLine ? (
            <Section title={tWage('title')}>
              <Text
                col={wageLine.kind === 'none' ? colors.textMuted : colors.text}
                fos={fontSize.body}
                fow={wageLine.kind === 'none' ? fontWeight.regular : fontWeight.semibold}
              >
                {tWage(`line.${wageLine.kind}`, {
                  amount: fmt.money(wageLine.amount),
                  days: trip.wage.days ?? 0,
                })}
              </Text>
              {wageLine.kind !== 'none' ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {tWage('paidDirect')}
                </Text>
              ) : null}
              {trip.wage.changes.length > 0 ? (
                <YStack gap={space.xs}>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
                    {tWage('changesTitle')}
                  </Text>
                  {trip.wage.changes.map((c) => (
                    <YStack key={c.id} gap={1}>
                      <Text col={colors.text} fos={fontSize.bodySm}>
                        {tWage('change', {
                          old: fmt.money(c.oldAmount),
                          new: fmt.money(c.newAmount),
                        })}
                      </Text>
                      <Text col={colors.textMuted} fos={fontSize.label}>
                        {c.changedByName
                          ? tWage('changeBy', {
                              name: c.changedByName,
                              time: fmt.dateTime(c.changedAt),
                            })
                          : tWage('changeAt', { time: fmt.dateTime(c.changedAt) })}
                      </Text>
                      {c.reason ? (
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {tWage('reason', { reason: c.reason })}
                        </Text>
                      ) : null}
                    </YStack>
                  ))}
                </YStack>
              ) : null}
            </Section>
          ) : null}

          <Section title={t('schedule')}>
            <DataRow label={t('pickupAt')} value={fmt.dateTime(trip.pickupAt)} />
            <DataRow label={t('returnAt')} value={fmt.dateTime(trip.returnAt)} />
            {trip.actualPickupAt ? (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('actualPickupAt', { time: fmt.dateTime(trip.actualPickupAt) })}
              </Text>
            ) : null}
            {trip.actualReturnAt ? (
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('actualReturnAt', { time: fmt.dateTime(trip.actualReturnAt) })}
              </Text>
            ) : null}
          </Section>

          <Section title={t('route')}>
            {trip.routeType ? (
              <DataRow label={t('route')} value={domainLabel('routeType', trip.routeType)} />
            ) : null}
            <DataRow label={t('pickupAddress')} value={trip.pickupAddress ?? empty} />
            <DataRow label={t('destination')} value={trip.destination ?? empty} />
            {pickupMap ? (
              <Button
                label={`${t('openMap')}${LIST_SEPARATOR}${t('pickupAddress')}`}
                variant="secondary"
                icon="navigate-outline"
                onPress={() => openUrl(pickupMap)}
              />
            ) : null}
            {destinationMap ? (
              <Button
                label={`${t('openMap')}${LIST_SEPARATOR}${t('destination')}`}
                variant="secondary"
                icon="navigate-outline"
                onPress={() => openUrl(destinationMap)}
              />
            ) : null}
          </Section>

          <Section title={t('vehicle')}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {[trip.vehicle.name, trip.vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
            </Text>
          </Section>

          <Section title={t('customer')}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {trip.customer.name}
            </Text>
            {trip.customer.phone ? (
              <Button
                label={`${t('callCustomer')}${LIST_SEPARATOR}${trip.customer.phone}`}
                variant="secondary"
                icon="call-outline"
                onPress={() => openUrl(`tel:${trip.customer.phone}`)}
              />
            ) : (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {trip.customer.contactVisibleFrom
                  ? t('contactFrom', { time: fmt.dateTime(trip.customer.contactVisibleFrom) })
                  : t('contactHidden')}
              </Text>
            )}
          </Section>

          <Section title={t('employer')}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {trip.employer.name}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {domainLabel('driverEmployerKind', trip.employer.kind)}
            </Text>
            {trip.employer.phone ? (
              <Button
                label={`${t('callEmployer')}${LIST_SEPARATOR}${trip.employer.phone}`}
                variant="secondary"
                icon="call-outline"
                onPress={() => openUrl(`tel:${trip.employer.phone}`)}
              />
            ) : null}
          </Section>
        </YStack>
      </Screen>

      {trip.canDrop && dropOpen ? (
        <DropTripSheet trip={trip} onClose={() => setDropOpen(false)} />
      ) : null}

      <AlertDialog
        open={confirmingDecline}
        title={t('declineConfirm')}
        confirmLabel={t('decline')}
        cancelLabel={tActions('close')}
        destructive
        loading={decline.isPending}
        onConfirm={() =>
          decline.mutate(trip.id, {
            onSuccess: () => {
              setConfirmingDecline(false);
              toast.showSuccess(tToast('tripDeclined'));
              // Từ chối xong chuyến không còn là của mình — về danh sách.
              router.replace(ROUTES.driving.trips());
            },
            onError: (err) => {
              setConfirmingDecline(false);
              toast.showError(errorMessage(err));
            },
          })
        }
        onCancel={() => setConfirmingDecline(false)}
      />
    </>
  );
}
