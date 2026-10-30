import { memo, useCallback, useEffect, useState, type ReactNode } from 'react';
import { Image } from 'expo-image';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  DRIVER_ASSIGNMENT_OUTCOME,
  holdRemainingMs,
  isDriverTripAwaitingAnswer,
  STOREFRONT_KIND,
} from '@xeprime/types';
import { chargedDays, driverTripBadges, telHref, toAppTz } from '@xeprime/domain';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { ToneBadge } from '@/components/ui/ToneBadge';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { DriverTrip } from '../api';
import { useAcceptDriverTrip, useDeclineDriverTrip, useReleaseDriverTrip } from '../hooks';

/** `--xp-space-12`. */
const GAP_12 = space.sm + space.xs;
/** Ảnh xe cao 180 ở màn hẹp (`.image` web ≤640px). */
const IMAGE_HEIGHT = 180;
/** Ảnh bên thuê nhỏ cạnh tên chủ xe (`EmployerAvatar size="sm"`, 24px). */
const OWNER_AVATAR = 24;
/** Bo `--xp-space-6` của biển số. */
const PLATE_RADIUS = 6;

/**
 * Thẻ một chuyến nhìn từ tài xế — bản native của `DrivingTripCard` web (#221, Figma "Vehicle Card"
 * `21777:56605`, `21788:58194`), bố cục ≤640px: ảnh xe trên cùng (hoặc "Chưa có ảnh xe"), mã đơn
 * nghiêng, tên xe + biển số, các viên trạng thái (`driverTripBadges`), các dòng Chủ xe · Khách hàng
 * · Thời gian (kèm số ngày) · Đón tại · Điểm đến, rồi chân thẻ theo chặng:
 *  - chờ tôi nhận → đồng hồ hạn trả lời + Gọi khách / Từ chối / Nhận chuyến;
 *  - đã nhận, còn cửa sổ trả lại → "Bạn đã xác nhận…" + đồng hồ + Gọi khách / Hủy chuyến;
 *  - đã nhận, hết cửa sổ → "Bạn đã xác nhận…" + Gọi khách;
 *  - đã qua → Liên hệ hỗ trợ.
 *
 * Không có khối "Thu nhập chuyến": tài xế không thấy tiền (ADR 0063 điều 10). Chạm ảnh/tên mở chi
 * tiết; nút ở chân thẻ NẰM NGOÀI vùng chạm đó.
 */
function DrivingTripCardImpl({
  trip,
  onPress,
}: {
  trip: DriverTrip;
  onPress: (trip: DriverTrip) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Driving.tripCard');
  const tBadge = useTranslations('Driving.tripBadge');
  const tDetail = useTranslations('Driving.detail');
  const tToast = useTranslations('Driving.toast');
  const tActions = useTranslations('Common.actions');
  const tListing = useTranslations('Listings.card');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const accept = useAcceptDriverTrip();
  const decline = useDeclineDriverTrip();
  const release = useReleaseDriverTrip();
  const [confirmingDecline, setConfirmingDecline] = useState(false);
  const [confirmingRelease, setConfirmingRelease] = useState(false);
  const busy = accept.isPending || decline.isPending || release.isPending;

  const isOpen = trip.outcome === DRIVER_ASSIGNMENT_OUTCOME.OPEN;
  const pending = isDriverTripAwaitingAnswer(trip);
  const callHref = trip.customer.phone ? telHref(trip.customer.phone) : null;
  const days = chargedDays(toAppTz(trip.pickupAt), toAppTz(trip.returnAt));
  const openDetail = useCallback(() => onPress(trip), [onPress, trip]);
  const onError = (err: unknown) => toast.showError(errorMessage(err));

  const note =
    pending && trip.respondBy ? (
      <DeadlineNote
        deadline={trip.respondBy}
        prefix={t('respondLeft')}
        expired={t('respondExpired')}
        tone="danger"
      />
    ) : isOpen && trip.releaseUntil ? (
      <DeadlineNote
        deadline={trip.releaseUntil}
        prefix={t('releaseLeft')}
        lead={t('confirmed')}
        tone="success"
      />
    ) : isOpen && !pending ? (
      <Text col={colors.successAccent} fos={fontSize.body} fow={fontWeight.medium}>
        {t('confirmed')}
      </Text>
    ) : null;

  const actions: ReactNode[] = [];
  if (isOpen && callHref) {
    actions.push(
      <YStack f={1} key="call">
        <Button
          label={t('callCustomer')}
          icon="call-outline"
          variant="secondary"
          onPress={() => void Linking.openURL(callHref)}
        />
      </YStack>,
    );
  }
  if (pending) {
    actions.push(
      <YStack f={1} key="decline">
        <Button
          label={t('decline')}
          icon="close"
          variant="dangerOutline"
          disabled={busy}
          loading={decline.isPending}
          onPress={() => setConfirmingDecline(true)}
        />
      </YStack>,
      <YStack f={1} key="accept">
        <Button
          label={t('accept')}
          icon="checkmark"
          disabled={busy}
          loading={accept.isPending}
          onPress={() =>
            accept.mutate(trip.id, {
              onSuccess: () => toast.showSuccess(tToast('tripAccepted')),
              onError,
            })
          }
        />
      </YStack>,
    );
  }
  if (isOpen && trip.releaseUntil) {
    actions.push(
      <YStack f={1} key="release">
        <Button
          label={t('release')}
          icon="close"
          variant="dangerOutline"
          disabled={busy}
          loading={release.isPending}
          onPress={() => setConfirmingRelease(true)}
        />
      </YStack>,
    );
  }
  if (!isOpen) {
    actions.push(
      <YStack f={1} key="support">
        <Button
          label={t('support')}
          icon="chatbubble-ellipses-outline"
          variant="secondary"
          onPress={() => navigateOnce(ROUTES.account.support())}
        />
      </YStack>,
    );
  }

  return (
    <>
      <Card>
        <YStack gap={GAP_12}>
          <Pressable
            onPress={openDetail}
            accessibilityRole="link"
            accessibilityLabel={t('openDetail', { code: trip.code })}
          >
            <YStack gap={space.md}>
              {trip.vehicle.mainImageUrl ? (
                <Image
                  source={{ uri: trip.vehicle.mainImageUrl }}
                  style={{ width: '100%', height: IMAGE_HEIGHT, borderRadius: radius.control }}
                  contentFit="cover"
                  accessibilityIgnoresInvertColors
                />
              ) : (
                <YStack
                  h={IMAGE_HEIGHT}
                  br={radius.control}
                  bg={colors.surfaceMuted}
                  ai="center"
                  jc="center"
                >
                  <Text col={colors.textPlaceholder} fos={fontSize.bodySm}>
                    {t('noImage')}
                  </Text>
                </YStack>
              )}

              <YStack gap={space.md}>
                <YStack gap={2}>
                  <Text col={colors.textPlaceholder} fos={fontSize.body} fontStyle="italic">
                    #{trip.code}
                  </Text>
                  <XStack
                    ai="center"
                    flexWrap="wrap"
                    columnGap={GAP_12 + space.sm}
                    rowGap={space.xs}
                  >
                    <Text
                      col={colors.text}
                      fos={fontSize.h3}
                      fow={fontWeight.semibold}
                      flexShrink={1}
                    >
                      {trip.vehicle.name}
                    </Text>
                    {trip.vehicle.plateNumber ? (
                      <YStack
                        px={space.sm}
                        py={2}
                        bw={1}
                        bc={colors.border}
                        br={PLATE_RADIUS}
                        bg={colors.background}
                      >
                        <Text col={colors.textMuted} fos={fontSize.body} fow={fontWeight.medium}>
                          {trip.vehicle.plateNumber}
                        </Text>
                      </YStack>
                    ) : null}
                  </XStack>
                </YStack>
                <XStack flexWrap="wrap" ai="center" gap={GAP_12}>
                  {driverTripBadges({ ...trip, respondedAt: trip.respondedAt ?? null }).map(
                    (badge) => (
                      <ToneBadge key={badge.key} tone={badge.tone}>
                        {tBadge(badge.key)}
                      </ToneBadge>
                    ),
                  )}
                </XStack>
              </YStack>
            </YStack>
          </Pressable>

          <YStack gap={space.sm}>
            <Fact label={t('owner')}>
              <XStack ai="center" gap={space.sm} flexShrink={1} jc="flex-end">
                <Avatar
                  name={trip.employer.name}
                  url={trip.employer.avatarUrl ?? null}
                  size={OWNER_AVATAR}
                  {...(trip.employer.kind === STOREFRONT_KIND.SHOP
                    ? { verifiedLabel: tListing('shopVerified') }
                    : {})}
                />
                <Text
                  col={colors.primaryHover}
                  fos={fontSize.body}
                  fow={fontWeight.medium}
                  flexShrink={1}
                  ta="right"
                >
                  {trip.employer.name}
                </Text>
              </XStack>
            </Fact>
            <Fact label={t('customer')}>
              <Text col={colors.text} fos={fontSize.body} ta="right" flexShrink={1}>
                {trip.customer.name}
                {trip.customer.phone ? (
                  <Text col={colors.placeholder}>{` | ${trip.customer.phone}`}</Text>
                ) : null}
              </Text>
            </Fact>
            <Fact label={t('time')}>
              <Text col={colors.text} fos={fontSize.body} ta="right" flexShrink={1}>
                {fmt.dateTimeRange(trip.pickupAt, trip.returnAt)}
                <Text col={colors.placeholder}>{` ${t('days', { count: days })}`}</Text>
              </Text>
            </Fact>
            {trip.pickupAddress ? (
              <Fact label={t('pickup')}>
                <Text col={colors.text} fos={fontSize.body} ta="right" flexShrink={1}>
                  {trip.pickupAddress}
                </Text>
              </Fact>
            ) : null}
            {trip.destination ? (
              <Fact label={t('destination')}>
                <Text col={colors.text} fos={fontSize.body} ta="right" flexShrink={1}>
                  {trip.destination}
                </Text>
              </Fact>
            ) : null}
          </YStack>

          {note || actions.length > 0 ? (
            <YStack gap={GAP_12} pt={GAP_12} borderTopWidth={1} borderTopColor={colors.border}>
              {note}
              {actions.length > 0 ? (
                <XStack gap={GAP_12} flexWrap="wrap">
                  {actions}
                </XStack>
              ) : null}
            </YStack>
          ) : null}
        </YStack>
      </Card>

      {isOpen && trip.releaseUntil ? (
        <AlertDialog
          open={confirmingRelease}
          title={t('releaseConfirmTitle')}
          message={t('releaseConfirmBody')}
          confirmLabel={t('release')}
          cancelLabel={tActions('close')}
          destructive
          loading={release.isPending}
          onConfirm={() =>
            release.mutate(trip.id, {
              onSuccess: () => {
                setConfirmingRelease(false);
                toast.showSuccess(tToast('tripReleased'));
              },
              onError: (err) => {
                setConfirmingRelease(false);
                onError(err);
              },
            })
          }
          onCancel={() => setConfirmingRelease(false)}
        />
      ) : null}

      {pending ? (
        <AlertDialog
          open={confirmingDecline}
          title={tDetail('declineConfirm')}
          confirmLabel={t('decline')}
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
                onError(err);
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

/** Một dòng thông tin — `.fact` web: nhãn xám bên trái, giá trị căn phải. */
function Fact({ label, children }: { label: string; children: ReactNode }) {
  const colors = useColors();
  return (
    <XStack jc="space-between" ai="flex-start" gap={space.md}>
      <Text col={colors.placeholder} fos={fontSize.body} flexShrink={0}>
        {label}
      </Text>
      {children}
    </XStack>
  );
}

/** `hh:mm:ss` có đệm số 0 — đúng dạng bản vẽ ("00:59:38"). */
function paddedClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(Math.floor(total / 3600))}:${pad(Math.floor((total % 3600) / 60))}:${pad(total % 60)}`;
}

/**
 * Dòng hạn ở chân thẻ — `DeadlineNote` web. Mốc do SERVER chốt (`respondBy`, `releaseUntil`); đồng
 * hồ chỉ hiển thị — cửa chặn thật nằm trong câu `UPDATE` của lệnh.
 */
function DeadlineNote({
  deadline,
  prefix,
  expired,
  lead,
  tone,
}: {
  deadline: string;
  prefix: string;
  expired?: string;
  lead?: string;
  tone: 'danger' | 'success';
}) {
  const colors = useColors();
  const [now, setNow] = useState(() => Date.now());
  const remaining = holdRemainingMs(deadline, new Date(now));

  useEffect(() => {
    if (holdRemainingMs(deadline) <= 0) return;
    const timer = setInterval(() => {
      setNow(Date.now());
      if (holdRemainingMs(deadline) <= 0) clearInterval(timer);
    }, 1_000);
    return () => clearInterval(timer);
  }, [deadline]);

  const color = tone === 'danger' ? colors.danger : colors.successAccent;
  const weight = tone === 'success' ? fontWeight.medium : fontWeight.regular;
  if (remaining <= 0) {
    return lead || expired ? (
      <Text col={color} fos={fontSize.body} fow={weight}>
        {lead ?? expired}
      </Text>
    ) : null;
  }
  return (
    <Text col={color} fos={fontSize.body} fow={weight}>
      {lead ? (
        <>
          {`${lead} `}
          <Text col={colors.placeholder}>{prefix}</Text>
        </>
      ) : (
        prefix
      )}
      <Text fow={fontWeight.semibold} fontVariant={['tabular-nums']}>
        {paddedClock(remaining)}
      </Text>
    </Text>
  );
}
