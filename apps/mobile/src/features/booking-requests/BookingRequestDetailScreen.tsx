import { Linking, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_STATUS,
  BOOKING_REQUEST_STATUS_META,
  isBookingRequestPastDue,
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
import { telHref, toAppTz, zaloHref, LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { Chip } from '@/components/ui/Chip';
import { DetailChevron } from '@/components/ui/DetailArrow';
import { DataRow } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ROUTES } from '@/navigation/routes';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { RespondDeadline } from './components/RespondDeadline';
import type { BookingRequestItem } from './api';

const VEHICLE_THUMB = { width: 96, height: 72 } as const;
const AVATAR_SIZE = 44;

/** Không phụ thuộc prop/state — dựng MỘT lần ở module scope, không phải mỗi lần render. */
const VEHICLE_THUMB_STYLE = { ...VEHICLE_THUMB, borderRadius: radius.sm };
const AVATAR_STYLE = { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: radius.pill };

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
  onCancel,
  onClose,
}: {
  request: BookingRequestItem;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
  /** HUỶ một chuyến ĐÃ NHẬN (ADR 0045 điều 1) — chỉ có ở `awaiting_hold`. */
  onCancel: (request: BookingRequestItem) => void;
  onClose: () => void;
}) {
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();

  const status = request.status as BookingRequestStatus;
  const meta = BOOKING_REQUEST_STATUS_META[status];
  /*
   * HAI chặng cần gian hàng quyết định, và chặng thứ hai là chặng TỐN KÉM hơn hẳn:
   *
   *   · `pending_host_approval` — khách mới hỏi, chưa ai mất gì;
   *   · `hold_paid` (LEGACY ADR 0039) — khách ĐÃ TRẢ TIỀN và chỗ xe đang bị giữ. Bỏ sót chặng này là
   *     bày ra một màn ghi "chờ bạn duyệt" mà không có nút nào để duyệt, trong khi tiền của
   *     khách nằm ở XePrime và đồng hồ phản hồi đang chạy tới lượt hoàn tự động.
   */
  const needsDecision =
    status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL ||
    status === BOOKING_REQUEST_STATUS.HOLD_PAID;
  /*
   * Quá hạn phản hồi thì KHÔNG còn quyết định nào — server từ chối cả duyệt lẫn từ chối
   * (`BOOKING_REQUEST_EXPIRED`), nên bày nút ra là mời người dùng bấm một thứ chắc chắn hỏng.
   *
   * Hỏi `respondBy` chứ không hỏi `status`: trạng thái `expired` do worker ghi theo nhịp, nên có
   * một cửa sổ mà bản ghi vẫn còn `pending_host_approval` trong khi giờ đã hết. Đây chính là vị
   * từ mà server dùng, nên hai phía không bao giờ nói hai câu khác nhau.
   */
  const pastDue = isBookingRequestPastDue(request.respondBy);
  const decidable = needsDecision && !pastDue;
  const canApprove = permissions.has(PERMISSION.BOOKING_REQUEST_APPROVE);
  const canViewVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);

  const vehicleMeta = [request.vehicleCode, request.vehiclePlate]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

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
              {needsDecision ? <RespondDeadline respondBy={request.respondBy} /> : null}
            </XStack>
          </Card>

          {/*
            Mở được HỒ SƠ 360 của xe ngay từ đây — web cũng vậy (`VehicleDetailDialog` mở từ hộp
            thư). Đang duyệt yêu cầu mà muốn kiểm hạn đăng kiểm hay KM của xe thì xem tại chỗ,
            không phải đi vòng qua danh sách xe.

            Khác web ở VỎ, không ở nghĩa: web mở overlay để giữ chỗ đang đứng, native đẩy một màn
            và nút Lui trả về đúng đây — đó là hành vi đi sâu chuẩn của stack khu quản lý.

            Gác `vehicles.view`: thiếu quyền thì khối vẫn hiện đủ thông tin, chỉ không bấm được.
          */}
          <Card
            {...(canViewVehicle
              ? {
                  onPress: () => navigateOnce(ROUTES.manage.vehicleDetail(request.vehicleId)),
                  accessibilityLabel: request.vehicleName,
                }
              : {})}
          >
            <YStack gap={space.sm}>
              <SectionTitle>{t('vehicle.heading')}</SectionTitle>
              {/*
                Cả thẻ đã bắt chạm (`onPress` ở trên) nên mũi tên chỉ đi KÈM nội dung, không phải
                một đích chạm riêng — thêm `DetailArrow` nổi ở đây sẽ là lối vào thứ hai cho đúng
                một việc.
              */}
              <XStack ai="center" gap={space.sm}>
                {request.vehicleImageUrl ? (
                  <Image
                    source={{ uri: request.vehicleImageUrl }}
                    style={VEHICLE_THUMB_STYLE}
                    contentFit="cover"
                    cachePolicy="memory-disk"
                    transition={150}
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
                    {/*
                      Lịch của CHÍNH chiếc xe này — web có lối này ở CẢ thẻ lẫn chi tiết
                      (`BookingRequestDetailDialog`), và chi tiết mới là nơi quyết định duyệt hay
                      từ chối được đưa ra. Bỏ nó ở đây là bỏ đúng chỗ nó cần nhất.
                    */}
                    {canViewVehicle ? (
                      <Chip
                        label={t('vehicle.viewSchedule')}
                        icon="calendar-outline"
                        tone="accent"
                        role="button"
                        size="sm"
                        onPress={() =>
                          navigateOnce(
                            vehicleSchedulePath(
                              { name: request.vehicleName, plateNumber: request.vehiclePlate },
                              { back: true },
                            ),
                          )
                        }
                      />
                    ) : null}
                  </XStack>
                </YStack>
                {canViewVehicle ? <DetailChevron /> : null}
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
                    style={AVATAR_STYLE}
                    contentFit="cover"
                    cachePolicy="memory-disk"
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

          {/*
            TIỀN — CÙNG dữ liệu đã hiện trên thẻ (`request.pricing`), không gọi API lần hai.
            `null` (dài hạn chưa chốt lịch, xe thiếu giá…) thì KHÔNG dựng thẻ rỗng.
          */}
          {request.pricing ? (
            <Card>
              <YStack gap={space.xs}>
                <SectionTitle>{t('pricing.heading')}</SectionTitle>
                <DataRow
                  label={t('pricing.rentalTotal')}
                  value={fmt.money(request.pricing.rentalTotal)}
                />
                {request.pricing.customerTotalAmount !== request.pricing.rentalTotal ? (
                  <DataRow
                    label={t('pricing.customerTotal')}
                    value={fmt.money(request.pricing.customerTotalAmount)}
                  />
                ) : null}
                {request.pricing.paidAmount != null ? (
                  <DataRow
                    label={t('pricing.paidViaPlatform')}
                    value={fmt.money(request.pricing.paidAmount)}
                  />
                ) : null}
                {request.pricing.remainingAmount != null ? (
                  <DataRow
                    label={t('pricing.payAtHandover')}
                    value={fmt.money(request.pricing.remainingAmount)}
                  />
                ) : null}
                {request.pricing.isEstimate ? <Hint>{t('pricing.estimateHint')}</Hint> : null}
              </YStack>
            </Card>
          ) : null}

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
              {needsDecision ? (
                <DataRow label={t('deadline.label')} value={fmt.dateTime(request.respondBy)} />
              ) : null}
              {request.decidedAt ? (
                <DataRow label={t('detail.decidedAt')} value={fmt.dateTime(request.decidedAt)} />
              ) : null}
            </YStack>
          </Card>

          {decidable && canApprove ? (
            <YStack gap={space.sm}>
              <Button
                label={t('actions.approve')}
                icon="checkmark-circle-outline"
                size="lg"
                onPress={() => onApprove(request)}
              />
              <Button
                label={t('actions.reject')}
                icon="close-circle-outline"
                variant="secondary"
                onPress={() => onReject(request)}
              />
            </YStack>
          ) : needsDecision && pastDue ? (
            /*
              Quá hạn mà bản ghi CHƯA kịp đổi trạng thái: nói rõ vì sao không còn nút, và nói việc
              còn làm được (gọi khách). Một khoảng trống ở đây đọc ra như màn hình bị hỏng.
            */
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('deadline.pastDueHint')}
            </Text>
          ) : request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD && canApprove ? (
            /*
             * Chuyến đã nhận, đang chờ khách trả tiền: việc chính là ĐỢI, nên chỗ này chỉ có một
             * lối thoát. Nút nhỏ, nền nhạt — người mở chi tiết ra hiếm khi để huỷ; họ mở để đọc
             * lại lịch trình rồi gọi cho khách (ADR 0045 điều 1).
             */
            <Button
              label={t('actions.cancel')}
              icon="close-circle-outline"
              variant="danger"
              size="sm"
              onPress={() => onCancel(request)}
            />
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
