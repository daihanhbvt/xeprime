import { Linking, Pressable } from 'react-native';
import { bareLabel } from '@/features/bookings/components/rental-card/RentalCard';
import { useHideTabBar } from '@/components/layout/tab-bar-visibility';
import { StickyActionBar } from '@/components/ui/StickyActionBar';
import { Timeline } from '@/components/ui/Timeline';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { BOOKING_REQUEST_CLOSED_STATUSES } from './api';
import { VehicleThumb } from '@/components/ui/VehicleThumb';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { Image } from 'expo-image';
import { Ionicons } from '@/components/icons/Ionicons';
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
import { InfoHint } from '@/components/ui/InfoHint';
import { LineIcon } from '@/components/icons/LineIcon';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { requestPaymentRows } from './components/BookingRequestCard';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useCustomerProfileAccess } from './hooks/use-customer-profile-access';
import { ROUTES } from '@/navigation/routes';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';
import type { BookingRequestItem } from './api';

const AVATAR_SIZE = 44;

/** Không phụ thuộc prop/state — dựng MỘT lần ở module scope, không phải mỗi lần render. */
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
  const colors = useColors();
  const t = useTranslations('BookingRequests');
  const tCommon = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const paymentRows = requestPaymentRows(request, t);
  const tKanban = useTranslations('Bookings.board.kanban');
  const tCard = useTranslations('BookingRequests.card');
  const tDetailApp = useTranslations('BookingRequests.detail.partnerApp');
  const holdRowState = paymentRows.find((row) => row.key === 'hold')?.state;
  // Chờ duyệt mà chưa có giữ chỗ (dài hạn chưa chốt giá) vẫn nói "Chờ duyệt" như thẻ (20/11/2026).
  const holdState =
    holdRowState === 'awaiting'
      ? 'unpaid'
      : (holdRowState ??
        (request.status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL ? 'expected' : undefined));
  const requestClosed = (BOOKING_REQUEST_CLOSED_STATUSES as readonly string[]).includes(request.status);
  const holdChip =
    !requestClosed && (holdState === 'paid' || holdState === 'unpaid' || holdState === 'expected') ? (
      <Pill
        label={holdState === 'expected' ? tKanban('holdState.awaitingApproval') : tKanban(`holdState.${holdState}`)}
        tone={holdState === 'paid' ? 'success' : holdState === 'unpaid' ? 'danger' : 'warning'}
      />
    ) : null;
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const navigateOnce = useNavigateOnce();
  const customerProfileAccess = useCustomerProfileAccess();

  const status = request.status as BookingRequestStatus;
  const meta = BOOKING_REQUEST_STATUS_META[status];
  /*
   * Chỉ `pending_host_approval` còn cần gian hàng quyết định: `hold_paid` (luồng thu-trước-duyệt)
   * đã gỡ hẳn ở ADR 0055 và DB từ chối trạng thái đó — cùng vị từ `needsDecision` của web.
   */
  const needsDecision = status === BOOKING_REQUEST_STATUS.PENDING_HOST_APPROVAL;
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
  /* Nút DÍNH ĐÁY như màn chi tiết đơn (16/11/2026): từ chối/huỷ trái · duyệt phải. */
  const footer =
    decidable && canApprove ? (
      <StickyActionBar
        secondary={
          <Button label={t('actions.reject')} variant="dangerOutline" block={false} onPress={() => onReject(request)} />
        }
        primary={<Button label={t('approve.confirm')} variant="gradient" onPress={() => onApprove(request)} />}
      />
    ) : request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD && canApprove ? (
      // Hạn thanh toán nằm trong thẻ mốc thời gian của màn (người dùng 20/11/2026), không ở thanh đáy.
      <StickyActionBar
        primary={<Button label={t('actions.cancel')} variant="dangerOutline" onPress={() => onCancel(request)} />}
      />
    ) : null;
  // Màn chi tiết che thanh tab như màn chi tiết đơn (người dùng 16/11/2026).
  useHideTabBar();
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
  const accountTel = telHref(request.customerAccountPhone);

  return (
    <>
      {/* Trạng thái đi cùng hàng tiêu đề của khối XE đầu tiên — xem chú thích ở khối đó. */}
      {/* Cùng ngôn ngữ màn chi tiết đơn (16/11/2026): ← tiêu đề, viên trạng thái ở dòng phụ. */}
      <ManagePageHeader
        title={t('detail.title')}
        onBack={onClose}
        subtitle={
          // Giờ gửi giữ trọn; viên trạng thái dùng nhãn NGẮN như thẻ danh sách, vẫn chật thì "…" (20/11/2026).
          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} numberOfLines={1} flexShrink={0}>
              {t('card.sentAt', { value: fmt.dateTime(request.createdAt) })}
            </Text>
            {/* Cùng viên với thẻ: yêu cầu còn mở có giữ chỗ thì nói trạng thái GIỮ CHỖ (web 16/11/2026). */}
            {holdChip ?? (
              <Pill
                shrink
                label={tDetailApp.has(`statusShort.${status}`) ? tDetailApp(`statusShort.${status}`) : domainLabel('bookingRequestStatus', status, meta.label)}
                tone={(BOOKING_REQUEST_CLOSED_STATUSES as readonly string[]).includes(request.status) ? 'danger' : pillToneOfStatusColor(meta.color)}
              />
            )}
          </XStack>
        }
      />
      <Screen
        edges={['left', 'right', 'bottom']}
        {...(footer ? { footer } : {})}
      >
        <YStack gap={layout.section}>
          {/*
            Mở được HỒ SƠ 360 của xe ngay từ đây — web cũng vậy (`VehicleDetailDialog` mở từ hộp
            thư). Đang duyệt yêu cầu mà muốn kiểm hạn đăng kiểm hay KM của xe thì xem tại chỗ,
            không phải đi vòng qua danh sách xe.

            Khác web ở VỎ, không ở nghĩa: web mở overlay để giữ chỗ đang đứng, native đẩy một màn
            và nút Lui trả về đúng đây — đó là hành vi đi sâu chuẩn của stack khu quản lý.

            Gác `vehicles.view`: thiếu quyền thì khối vẫn hiện đủ thông tin, chỉ không bấm được.
          */}
          {/*
            Cùng bố cục thẻ xe của màn CHI TIẾT ĐƠN (chuẩn "Chờ giao xe", người dùng 16/11/2026) và web
            `BookingRequestDetailDialog`: ảnh · tên · biển số · nút lịch; "Hình thức"; dòng thời gian
            nhận → trả kèm nơi đổi tay; dài hạn chưa chốt lịch thì gói + nguyện vọng.
          */}
          <Card>
            <YStack gap={12}>
              <XStack ai="center" gap={12}>
                <Pressable
                  disabled={!canViewVehicle}
                  onPress={() => navigateOnce(ROUTES.manage.vehicleDetail(request.vehicleId))}
                  accessibilityRole="link"
                  accessibilityLabel={request.vehicleName}
                >
                  <VehicleThumb uri={request.vehicleImageUrl ?? null} accessibilityLabel={request.vehicleName} />
                </Pressable>
                <YStack f={1} minWidth={0} gap={space.xs} ai="flex-start">
                  <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} numberOfLines={1}>
                    {request.vehicleName}
                  </Text>
                  {vehicleMeta ? <Pill label={vehicleMeta} tone="neutral" /> : null}
                </YStack>
                {canViewVehicle ? (
                  <IconSquareButton
                    label={t('vehicle.viewSchedule')}
                    onPress={() =>
                      navigateOnce(
                        vehicleSchedulePath(
                          { name: request.vehicleName, plateNumber: request.vehiclePlate },
                          { back: true },
                        ),
                      )
                    }
                  >
                    <Ionicons name="calendar-outline" size={18} color={colors.primary} />
                  </IconSquareButton>
                ) : null}
              </XStack>
              <XStack
                jc="space-between"
                ai="center"
                pb={12}
                borderBottomWidth={1}
                borderBottomColor={colors.borderSubtle}
              >
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {t('detail.service')}
                </Text>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                  {domainLabel('serviceType', request.serviceType)}
                </Text>
              </XStack>
              {pickup && dropoff ? (
                <Timeline
                  items={[
                    {
                      key: 'pickup',
                      dot: 'pickup',
                      title: `${fmt.rentalPoint(pickup)} - ${
                        request.deliveryRequested
                          ? t('schedule.handoverDelivery')
                          : t('schedule.handoverAtShop')
                      }`,
                      ...(request.deliveryRequested && request.deliveryAddress
                        ? { lines: [request.deliveryAddress] }
                        : {}),
                      // Phí đã chốt thì nằm ở ô "Thanh toán" - ⓘ chỉ còn khi chưa duyệt (web #349).
                      ...(request.deliveryRequested && request.pricing?.deliveryFee == null
                        ? {
                            titleExtra: (
                              <InfoHint
                                content={t('schedule.deliveryFeeHint')}
                                label={t('schedule.handoverDelivery')}
                                size={HINT_ICON}
                              />
                            ),
                          }
                        : {}),
                      meta: fmt.rentalDuration(pickup, dropoff),
                    },
                    { key: 'return', dot: 'return', title: fmt.rentalPoint(dropoff) },
                  ]}
                />
              ) : (
                <>
                  <DataRow size="md"
                    label={t('schedule.package')}
                    value={
                      fmt.packageLabel(request.longTermPackageMonths) ?? t('schedule.packageMissing')
                    }
                  />
                  {/* Ghi chú giờ nhận (+ phí giao xe nếu có) thành dấu "i" của dòng (20/11/2026). */}
                  <DataRow
                    size="md"
                    label={t('schedule.pickupWish')}
                    value={fmt.pickupWish(request)}
                    action={
                      <InfoHint
                        content={
                          request.deliveryRequested && request.pricing?.deliveryFee == null
                            ? `${t('schedule.pickupWishHint')} ${t('schedule.deliveryFeeHint')}`
                            : t('schedule.pickupWishHint')
                        }
                        label={t('schedule.pickupWish')}
                        size={HINT_ICON}
                      />
                    }
                  />
                </>
              )}
              {hasSchedule && isLongTerm && request.longTermPackageMonths ? (
                <DataRow size="md"
                  label={t('schedule.package')}
                  value={fmt.packageLabel(request.longTermPackageMonths) ?? ''}
                />
              ) : null}
              {isWithDriver && routeType ? (
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  <Text f={1} col={colors.textMuted} fos={fontSize.body}>
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
                <DataRow size="md" label={t('schedule.pickupAddress')} value={request.pickupAddress} block />
              ) : null}
              {isWithDriver && request.destination ? (
                <DataRow size="md" label={t('schedule.destination')} value={request.destination} block />
              ) : null}

            </YStack>
          </Card>

          {/* Thẻ khách - cùng `CustomerSideCard` của chi tiết đơn: tên + "Khách quen", SĐT · Zalo, lối tắt. */}
          <Card>
            <YStack gap={space.sm}>
              {/* "Xem hồ sơ" + mũi tên ở góc PHẢI hàng tên (người dùng chốt 20/11/2026). */}
              <XStack ai="center" gap={space.sm}>
                <XStack f={1} minWidth={0} ai="center" flexWrap="wrap" gap={space.sm}>
                  <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} flexShrink={1}>
                    {request.customerName}
                  </Text>
                  {request.customerIsRegular ? <Pill label={t('detail.regular')} tone="success" /> : null}
                </XStack>
                {/* Ghi chú "chưa có hồ sơ" thành dấu "i" cạnh tên (người dùng 20/11/2026). */}
                {!request.tenantCustomerId ? (
                  <InfoHint content={t('customer.noProfile')} label={request.customerName} size={HINT_ICON} />
                ) : null}
                {/* "Xem hồ sơ" là nút icon vuông cùng kiểu nút lịch của thẻ xe (người dùng 20/11/2026). */}
                {customerProfileAccess && request.tenantCustomerId ? (
                  <IconSquareButton
                    label={t('detail.viewProfile')}
                    onPress={() =>
                      navigateOnce(ROUTES.manage.customerDetail(request.tenantCustomerId as string))
                    }
                  >
                    <LineIcon name="profile" size={18} color={colors.primary} />
                  </IconSquareButton>
                ) : null}
              </XStack>
              {request.customerPhone ? (
                <XStack ai="center" gap={space.md}>
                  <Text
                    col={colors.text}
                    fos={fontSize.body}
                    {...(tel
                      ? { onPress: () => void Linking.openURL(tel), accessibilityRole: 'link' as const }
                      : {})}
                  >
                    {request.customerPhone}
                  </Text>
                  {zalo ? (
                    <Text
                      col={colors.infoStrong}
                      fos={fontSize.body}
                      fow={fontWeight.semibold}
                      onPress={() => void Linking.openURL(zalo)}
                      accessibilityRole="link"
                    >
                      {t('actions.zalo')}
                    </Text>
                  ) : null}
                </XStack>
              ) : null}
              {request.customerEmail ? (
                <Text col={colors.textMuted} fos={fontSize.body}>
                  {request.customerEmail}
                </Text>
              ) : null}
              {request.customerAccountPhone ? (
                <DataRow size="md"
                  label={t('detail.accountPhone')}
                  value={request.customerAccountPhone}
                  {...(accountTel
                    ? {
                        action: (
                          <Pressable
                            onPress={() => void Linking.openURL(accountTel)}
                            accessibilityRole="button"
                            accessibilityLabel={t('customer.accountPhoneAria', {
                              phone: request.customerAccountPhone,
                              name: request.customerName,
                            })}
                            hitSlop={space.sm}
                          >
                            <Ionicons
                              name="call-outline"
                              size={iconSize.sm}
                              color={colors.accentText}
                            />
                          </Pressable>
                        ),
                      }
                    : {})}
                />
              ) : null}

              {showRisk ? (
                <Text col={colors.warning} fos={fontSize.label}>
                  {t('customer.riskWarning', {
                    level: domainLabel('tenantCustomerRiskLevel', riskLevel),
                  })}
                </Text>
              ) : null}
            </YStack>
          </Card>


          {/*
            TIỀN — CÙNG dữ liệu đã hiện trên thẻ (`request.pricing`), không gọi API lần hai.
            `null` (dài hạn chưa chốt lịch, xe thiếu giá…) thì KHÔNG dựng thẻ rỗng.
          */}
          {request.pricing ? (
            <Card>
              <YStack gap={space.xs}>
                {/*
                  Web `BookingRequestDetailDialog`: "Thanh toán" + nhãn "Tạm tính", rồi CÙNG các dòng
                  của thẻ (`requestPaymentRows`: giữ chỗ dự kiến / chờ khách trả / đã giữ chỗ / trả
                  khi nhận xe), dòng cuối nổi bật.
                */}
                <XStack ai="center" jc="space-between" gap={space.sm}>
                  {/* Dấu "i" giải thích số tạm tính đứng cạnh tiêu đề "Thanh toán" (người dùng 20/11/2026). */}
                  <XStack ai="center" gap={space.xs} flexShrink={1}>
                    <SectionTitle>{t('detail.paymentHeading')}</SectionTitle>
                    {request.pricing.isEstimate ? (
                      <InfoHint content={t('pricing.estimateHint')} label={t('detail.paymentHeading')} size={HINT_ICON} />
                    ) : null}
                  </XStack>
                  {request.pricing.isEstimate ? (
                    <StatusBadge label={t('card.estimate')} color={STATUS_COLOR.WARNING} size="sm" />
                  ) : null}
                </XStack>
                {/*
                  Cùng hàng tiền của thẻ "Thanh toán" ở chi tiết đơn (chuẩn "Chờ giao xe", 16/11/2026):
                  nhãn chiếm phần còn lại, số tiền không co - nhãn dài không bị ép xuống dòng.
                */}
                {paymentRows.map((row, index) => {
                  const last = index === paymentRows.length - 1;
                  return (
                    <XStack key={row.key} ai="center" jc="space-between" gap={space.md} py={2}>
                      <Text
                        f={1}
                        col={last ? colors.text : colors.textMuted}
                        fos={fontSize.body}
                        fow={last ? fontWeight.semibold : fontWeight.regular}
                      >
                        {bareLabel(row.label)}
                      </Text>
                      <Text
                        flexShrink={0}
                        col={last ? colors.brandLink : colors.text}
                        fos={last ? fontSize.bodyLg : fontSize.body}
                        fow={last ? fontWeight.bold : fontWeight.medium}
                      >
                        {row.text ?? fmt.money(row.amount)}
                      </Text>
                    </XStack>
                  );
                })}
              </YStack>
            </Card>
          ) : null}

          {request.note ? (
            <Card>
              <YStack gap={space.xs}>
                <SectionTitle>{t('note.label')}</SectionTitle>
                {/* Ở màn chi tiết KHÔNG cắt dòng: đây đúng là chỗ để đọc hết. */}
                <Text col={colors.text} fos={fontSize.body}>
                  {request.note}
                </Text>
              </YStack>
            </Card>
          ) : null}

          {request.rejectReason ? (
            <Card>
              {/* Nhãn mờ như "Hình thức" của thẻ xe, lý do ở dưới (20/11/2026). */}
              <YStack gap={space.xs}>
                <Text col={colors.textMuted} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {t('trace.rejectReason')}
                </Text>
                <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {request.rejectReason}
                </Text>
              </YStack>
            </Card>
          ) : null}

          {/*
            MỌI mốc thời gian của yêu cầu gom vào MỘT thẻ (người dùng 20/11/2026): hạn phản hồi (còn
            chờ duyệt), xử lý lúc, hạn thanh toán (chờ khách trả). "Gửi lúc" đã ở dòng phụ tiêu đề.
          */}
          {needsDecision ||
          request.decidedAt ||
          (request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD && request.holdExpiresAt) ? (
            <Card>
              <YStack gap={space.sm}>
                {needsDecision ? (
                  <DataRow size="md" labelWide label={t('deadline.label')} value={fmt.dateTime(request.respondBy)} />
                ) : null}
                {request.decidedAt ? (
                  <DataRow size="md" labelWide label={t('detail.decidedAt')} value={fmt.dateTime(request.decidedAt)} />
                ) : null}
                {request.status === BOOKING_REQUEST_STATUS.AWAITING_HOLD && request.holdExpiresAt ? (
                  <DataRow
                    size="md"
                    labelWide
                    label={tCard('awaitingPayment').replace(/:$/, '')}
                    value={fmt.dateTime(request.holdExpiresAt)}
                  />
                ) : null}
              </YStack>
            </Card>
          ) : null}

          {needsDecision && pastDue && !decidable ? (
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t('deadline.pastDueHint')}
            </Text>
          ) : null}
        </YStack>
      </Screen>
    </>
  );
}

function SectionTitle({ children }: { children: string }) {
  const colors = useColors();
  return (
    // Tiêu đề khối như "Nhóm thông tin" của Figma / thẻ chi tiết đơn: 16/24 semibold, không vạch.
    <Text col={colors.text} fos={typeScale.title.fontSize} lh={typeScale.title.lineHeight} fow={fontWeight.semibold}>
      {children}
    </Text>
  );
}

/** Dấu "i" của các ghi chú nhỏ - cỡ chữ thân bài. */
const HINT_ICON = 16;

