import { Image, Linking, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  PERMISSION,
  ROUTE_TYPE,
  SERVICE_TYPE,
  STATUS_COLOR,
  TENANT_CUSTOMER_RISK_LEVEL,
  type BookingRequestStatus,
  type RouteType,
  type TenantCustomerRiskLevel,
  type VehicleType,
} from '@xeprime/types';
import { telHref, toAppTz, zaloHref } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { RespondDeadline } from './components/RespondDeadline';
import type { BookingRequestItem } from './api';

const VEHICLE_THUMB = { width: 96, height: 72 } as const;
const AVATAR_SIZE = 44;

/**
 * Chi tiết MỘT yêu cầu thuê — bản native của `BookingRequestDetailDialog`. Thẻ hộp thư để QUÉT,
 * màn này để ĐỌC HẾT (ghi chú hiện trọn, hạn phản hồi thành dòng dữ liệu).
 *
 * THAY nội dung của chính màn hộp thư thay vì push route mới: trang, bộ lọc và vị trí cuộn của
 * hộp thư còn nguyên khi đóng, và không tốn request nào vì dữ liệu đã có từ danh sách.
 */
export function BookingRequestDetailScreen({
  request,
  onApprove,
  onReject,
  onClose,
}: {
  request: BookingRequestItem;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
  onClose: () => void;
}) {
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();

  const status = request.status as BookingRequestStatus;
  const meta = BOOKING_REQUEST_STATUS_META[status];
  const isPending = status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
  const canApprove = permissions.has(PERMISSION.BOOKING_REQUEST_APPROVE);

  const vehicleMeta = [request.vehicleCode, request.vehiclePlate].filter(Boolean).join(' · ');

  const riskLevel = request.customerRiskLevel as TenantCustomerRiskLevel | null;
  const showRisk = riskLevel != null && riskLevel !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL;

  const isLongTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const isWithDriver = request.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const routeType = request.routeType as RouteType | null;
  const longDistance =
    routeType === ROUTE_TYPE.INTER_CITY || routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  // Quy đổi MỘT lần sang giờ Việt Nam — `fmt.*` nhận `Dayjs`, không nhận chuỗi ISO.
  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  const hasSchedule = pickup !== null && dropoff !== null;

  const tel = telHref(request.customerPhone);
  const zalo = zaloHref(request.customerPhone);

  return (
    <>
      <AppHeader title={t('detail.title')} onBack={onClose} />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={layout.section}>
          <Card tone="accent" lift="flat">
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <StatusBadge
                label={domainLabel('bookingRequestStatus', status, meta.label)}
                color={meta.color}
                size="sm"
              />
              {isPending ? <RespondDeadline respondBy={request.respondBy} /> : null}
            </XStack>
          </Card>

          <Card>
            <YStack gap={space.sm}>
              <SectionTitle>{t('vehicle.heading')}</SectionTitle>
              <XStack gap={space.sm}>
                {request.vehicleImageUrl ? (
                  <Image
                    source={{ uri: request.vehicleImageUrl }}
                    style={{ ...VEHICLE_THUMB, borderRadius: radius.sm }}
                    resizeMode="cover"
                    accessibilityLabel={request.vehicleName}
                  />
                ) : (
                  <YStack
                    {...VEHICLE_THUMB}
                    br={radius.sm}
                    bg={colors.surfaceMuted}
                    ai="center"
                    jc="center"
                  >
                    <Ionicons name="car-outline" size={iconSize.lg} color={colors.placeholder} />
                  </YStack>
                )}
                <YStack f={1} gap={space.xs}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {request.vehicleName}
                  </Text>
                  {vehicleMeta ? (
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {vehicleMeta}
                    </Text>
                  ) : null}
                  <XStack flexWrap="wrap" gap={space.xs}>
                    {request.vehicleType ? (
                      <Chip
                        label={domainLabel('vehicleType', request.vehicleType as VehicleType)}
                        size="sm"
                      />
                    ) : null}
                    <Chip label={domainLabel('serviceType', request.serviceType)} size="sm" />
                  </XStack>
                </YStack>
              </XStack>
            </YStack>
          </Card>

          <Card>
            <YStack gap={space.sm}>
              <SectionTitle>{t('customer.heading')}</SectionTitle>
              <XStack ai="center" gap={space.sm}>
                {request.customerAvatarUrl ? (
                  <Image
                    source={{ uri: request.customerAvatarUrl }}
                    style={{ width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: radius.pill }}
                    resizeMode="cover"
                  />
                ) : (
                  <YStack
                    w={AVATAR_SIZE}
                    h={AVATAR_SIZE}
                    br={radius.pill}
                    bg={colors.primaryLight}
                    ai="center"
                    jc="center"
                  >
                    <Text col={colors.primaryActive} fos={fontSize.body} fow={fontWeight.bold}>
                      {request.customerName.charAt(0).toUpperCase()}
                    </Text>
                  </YStack>
                )}
                <YStack f={1} gap={1}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {request.customerName}
                  </Text>
                  {request.customerEmail ? (
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {request.customerEmail}
                    </Text>
                  ) : null}
                </YStack>
              </XStack>

              {/* Số điện thoại bấm gọi được — trên điện thoại đó là việc gần nhất làm được. */}
              <DataRow
                label={t('detail.phone')}
                value={request.customerPhone}
                {...(tel
                  ? {
                      action: (
                        <Pressable
                          onPress={() => void Linking.openURL(tel)}
                          accessibilityRole="button"
                          accessibilityLabel={t('actions.call')}
                          hitSlop={space.sm}
                        >
                          <Ionicons
                            name="call-outline"
                            size={iconSize.sm}
                            color={colors.primaryActive}
                          />
                        </Pressable>
                      ),
                    }
                  : {})}
              />
              {zalo ? (
                <DataRow
                  label={t('actions.zalo')}
                  value={request.customerPhone}
                  action={
                    <Pressable
                      onPress={() => void Linking.openURL(zalo)}
                      accessibilityRole="button"
                      accessibilityLabel={t('actions.zalo')}
                      hitSlop={space.sm}
                    >
                      <Ionicons
                        name="open-outline"
                        size={iconSize.sm}
                        color={colors.primaryActive}
                      />
                    </Pressable>
                  }
                />
              ) : null}

              {showRisk ? (
                <Text col={colors.warning} fos={fontSize.label}>
                  {t('customer.riskWarning', {
                    level: domainLabel('tenantCustomerRiskLevel', riskLevel),
                  })}
                </Text>
              ) : null}
              {!request.tenantCustomerId ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('customer.noProfile')}
                </Text>
              ) : null}
            </YStack>
          </Card>

          <Card>
            <YStack gap={space.xs}>
              <SectionTitle>{t('schedule.heading')}</SectionTitle>

              {hasSchedule ? (
                <>
                  <DataRow label={t('schedule.pickup')} value={fmt.rentalPoint(pickup)} />
                  <DataRow label={t('schedule.return')} value={fmt.rentalPoint(dropoff)} />
                  <DataRow
                    label={t('schedule.duration')}
                    value={fmt.rentalDuration(pickup, dropoff)}
                  />
                  {isLongTerm && request.longTermPackageMonths ? (
                    <DataRow
                      label={t('schedule.package')}
                      value={fmt.packageLabel(request.longTermPackageMonths) ?? ''}
                    />
                  ) : null}
                </>
              ) : (
                // Dài hạn chưa duyệt KHÔNG có lịch (ADR 0011) — nói gói + nguyện vọng.
                <>
                  <DataRow
                    label={t('schedule.package')}
                    value={
                      fmt.packageLabel(request.longTermPackageMonths) ??
                      t('schedule.packageMissing')
                    }
                  />
                  <DataRow label={t('schedule.pickupWish')} value={fmt.pickupWish(request)} />
                </>
              )}

              {isWithDriver && routeType ? (
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('schedule.route')}
                  </Text>
                  {/* Đường dài tô CẢNH BÁO — chuyến ra khỏi tỉnh là rủi ro khác hẳn nội thành. */}
                  <StatusBadge
                    label={domainLabel('routeType', routeType)}
                    color={longDistance ? STATUS_COLOR.WARNING : STATUS_COLOR.NEUTRAL}
                    size="sm"
                  />
                </XStack>
              ) : null}
              {isWithDriver && request.pickupAddress ? (
                <DataRow label={t('schedule.pickupAddress')} value={request.pickupAddress} block />
              ) : null}
              {isWithDriver && request.destination ? (
                <DataRow label={t('schedule.destination')} value={request.destination} block />
              ) : null}

              <DataRow
                label={t('schedule.handoverHeading')}
                value={
                  request.deliveryRequested
                    ? t('schedule.handoverDelivery')
                    : t('schedule.handoverAtShop')
                }
              />
              {request.deliveryRequested && request.deliveryAddress ? (
                <DataRow
                  label={t('schedule.deliveryAddress')}
                  value={request.deliveryAddress}
                  block
                />
              ) : null}

              {isLongTerm && !hasSchedule ? <Hint>{t('schedule.pickupWishHint')}</Hint> : null}
              {request.deliveryRequested ? <Hint>{t('schedule.deliveryFeeHint')}</Hint> : null}
            </YStack>
          </Card>

          {request.note ? (
            <Card>
              <YStack gap={space.xs}>
                <SectionTitle>{t('note.label')}</SectionTitle>
                {/* Ở màn chi tiết KHÔNG cắt dòng: đây đúng là chỗ để đọc hết. */}
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {request.note}
                </Text>
              </YStack>
            </Card>
          ) : null}

          {request.rejectReason ? (
            <Card>
              <YStack gap={space.xs}>
                <SectionTitle>{t('trace.rejectReason')}</SectionTitle>
                <Text col={colors.text} fos={fontSize.bodySm}>
                  {request.rejectReason}
                </Text>
              </YStack>
            </Card>
          ) : null}

          <Card>
            <YStack gap={space.xs}>
              <DataRow label={t('detail.createdAt')} value={fmt.dateTime(request.createdAt)} />
              {isPending ? (
                <DataRow label={t('deadline.label')} value={fmt.dateTime(request.respondBy)} />
              ) : null}
              {request.decidedAt ? (
                <DataRow label={t('detail.decidedAt')} value={fmt.dateTime(request.decidedAt)} />
              ) : null}
            </YStack>
          </Card>

          {isPending && canApprove ? (
            <YStack gap={space.sm}>
              <Button label={t('actions.approve')} size="lg" onPress={() => onApprove(request)} />
              <Button
                label={t('actions.reject')}
                variant="secondary"
                onPress={() => onReject(request)}
              />
            </YStack>
          ) : null}

          <Button label={tCommon('close')} variant="ghost" onPress={onClose} />
        </YStack>
      </Screen>
    </>
  );
}

function SectionTitle({ children }: { children: string }) {
  return (
    <XStack ai="center" gap={space.xs}>
      <YStack w={3} h={iconSize.sm} br={radius.pill} bg={colors.primary} />
      <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold}>
        {children.toUpperCase()}
      </Text>
    </XStack>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.label}>
      {children}
    </Text>
  );
}
