import { memo } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_REQUEST_STATUS,
  isBookingRequestPastDue,
  STATUS_COLOR,
  BOOKING_REQUEST_STATUS_META,
  PERMISSION,
  ROUTE_TYPE,
  SERVICE_TYPE,
  TENANT_CUSTOMER_RISK_LEVEL,
  type BookingRequestStatus,
  type RouteType,
  type TenantCustomerRiskLevel,
  type VehicleType,
} from '@xeprime/types';
import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { Chip } from '@/components/ui/Chip';
import { DataRow, Divider } from '@/components/ui/DataRow';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { telHref, toAppTz, zaloHref, LIST_SEPARATOR } from '@xeprime/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { vehicleSchedulePath } from '@/features/vehicles/calendar-link';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { RespondDeadline } from './RespondDeadline';
import type { BookingRequestItem } from '../api';

/** Ảnh xe: tỉ lệ CỐ ĐỊNH để hàng thẳng dù ảnh nguồn dọc hay ngang — cùng cách web làm. */
const THUMB_WIDTH = 76;
const THUMB_HEIGHT = 57;

const AVATAR_SIZE = 32;

/** Không phụ thuộc prop/state — dựng MỘT lần ở module scope, không phải mỗi lần render. */
const AVATAR_STYLE = { width: AVATAR_SIZE, height: AVATAR_SIZE, borderRadius: radius.pill };

const styles = StyleSheet.create({
  /** Giữ nút đủ rộng để đọc nhãn; hàng liên hệ sẽ tự xuống dòng trên màn hình hẹp. */
  contactButton: { flexGrow: 1, flexBasis: '30%', minWidth: sizing.touchTarget + space.xl },
  thumb: {
    width: THUMB_WIDTH,
    height: THUMB_HEIGHT,
    borderRadius: radius.sm,
    backgroundColor: colors.surfaceMuted,
  },
});

/**
 * MỘT YÊU CẦU THUÊ trong hộp thư của gian hàng — bản native của `BookingRequestCard` bên web.
 *
 * Bốn vùng xếp dọc cùng thứ tự với web (web xếp lưới vì có bề ngang, ở đây chỉ có một cột):
 * xe · khách hàng · yêu cầu thuê · dấu vết, rồi chân thẻ liên hệ và quyết định.
 *
 * Quyền thiếu thì **ẩn** nút, không disable — một nút xám không tự giải thích được.
 */
function BookingRequestCardImpl({
  request,
  onApprove,
  onReject,
  onCancel,
  onOpenDetail,
}: {
  request: BookingRequestItem;
  onApprove: (request: BookingRequestItem) => void;
  onReject: (request: BookingRequestItem) => void;
  /**
   * HUỶ một chuyến ĐÃ NHẬN (ADR 0045 điều 1) — chỉ có ở `awaiting_hold`.
   *
   * Khác `onReject` về bản chất chứ không chỉ về nhãn: từ chối là trả lời một câu hỏi còn
   * treo, huỷ là rút lại một lời đã hứa và phải nhả lịch + hoàn phần khách đã chuyển.
   */
  onCancel: (request: BookingRequestItem) => void;
  /**
   * "Xem chi tiết" — màn hộp thư quyết định nó dẫn tới ĐÂU, không phải thẻ này: đã thành đơn
   * thì mở chi tiết ĐƠN, chưa có đơn thì mở chi tiết YÊU CẦU. Cùng phân nhánh với web.
   */
  onOpenDetail: (request: BookingRequestItem) => void;
}) {
  const t = useTranslations('BookingRequests');
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
   *     bày ra một thẻ ghi "chờ bạn duyệt" mà không có nút nào để duyệt, trong khi tiền của
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
  const canDecide = permissions.has(PERMISSION.BOOKING_REQUEST_APPROVE);
  /** Lối "Xem lịch" gác bằng ĐÚNG quyền web gác nó (`canViewVehicle` = `vehicles.view`). */
  const canViewVehicle = permissions.has(PERMISSION.VEHICLE_VIEW);

  /*
   * Có ĐƠN để mở hay không quyết định CHỮ trên lối đi ("Xem đơn" vs "Xem chi tiết"), không
   * quyết định việc lối đó có tồn tại — chi tiết yêu cầu luôn mở được. Điều kiện đơn giống hệt
   * web: phải thật sự có đơn VÀ người xem đọc được đơn, thiếu quyền mà vẫn bày là dẫn vào 403.
   */
  const openableBooking = Boolean(request.bookingId) && permissions.has(PERMISSION.BOOKING_VIEW);

  const openDetail = () => onOpenDetail(request);

  const vehicleMeta = [request.vehicleCode, request.vehiclePlate]
    .filter(Boolean)
    .join(LIST_SEPARATOR);

  const riskLevel = request.customerRiskLevel as TenantCustomerRiskLevel | null;
  const showRisk = riskLevel != null && riskLevel !== TENANT_CUSTOMER_RISK_LEVEL.NORMAL;

  const isLongTerm = request.serviceType === SERVICE_TYPE.LONG_TERM;
  const packageLabel = fmt.packageLabel(request.longTermPackageMonths);
  const isWithDriver = request.serviceType === SERVICE_TYPE.WITH_DRIVER;
  const routeType = request.routeType as RouteType | null;
  const longDistance =
    routeType === ROUTE_TYPE.INTER_CITY || routeType === ROUTE_TYPE.INTER_CITY_ONE_WAY;

  /* Quy đổi MỘT lần sang giờ Việt Nam rồi dùng lại — `fmt.*` nhận `Dayjs`, không nhận chuỗi ISO. */
  const pickup = request.pickupAt ? toAppTz(request.pickupAt) : null;
  const dropoff = request.returnAt ? toAppTz(request.returnAt) : null;
  const hasSchedule = pickup !== null && dropoff !== null;

  return (
    /*
      Vạch màu trạng thái ở mép trái — cùng ngôn ngữ với thẻ Đơn thuê · Khách hàng · Chi nhánh.
      Hộp thư yêu cầu là nơi người trực lướt tìm CỤM "còn phải trả lời", và thẻ này cao gần trọn
      màn: viên nhãn ở đỉnh thẻ trôi khỏi tầm nhìn ngay khi cuộn, còn mép màu thì chạy suốt.
    */
    <Card padded={false}>
      <XStack>
        <CardAccent color={meta.color} />

        <YStack f={1} minWidth={0} p={space.md} gap={space.md}>
          {/* Xe: mỏ neo thị giác đầu tiên, y như web. */}
          <XStack gap={space.sm}>
            {request.vehicleImageUrl ? (
              <Image
                source={{ uri: request.vehicleImageUrl }}
                style={styles.thumb}
                contentFit="cover"
                cachePolicy="memory-disk"
                transition={150}
                accessibilityLabel={request.vehicleName}
              />
            ) : (
              <YStack style={styles.thumb} ai="center" jc="center">
                <Ionicons name="car-outline" size={iconSize.lg} color={colors.placeholder} />
              </YStack>
            )}

            <YStack f={1} gap={space.xs}>
              {/*
                Tên xe TRÁI (co được) + trạng thái PHẢI — đúng chuẩn thẻ của khu quản lý, và giống
                hệt thẻ Đơn thuê ngay cạnh trong cùng menu.

                Trước 24/09/2026 viên nhãn đứng MỘT MÌNH trên một hàng riêng phía trên, căn trái:
                mắt đọc "Khách không thanh toán" trước khi biết đó là yêu cầu nào, nó ăn trọn một
                hàng (~50px kể cả `gap`) trên một thẻ vốn cao gần hết màn, và một viên pill xám
                đứng lẻ đọc ra như cái nút — cách đúng 200px bên dưới là "Xem lịch xe", cùng hình
                dạng, nhưng cái đó mới bấm được.

                Bề ngang ở 360dp: cột chữ còn ~240dp sau ảnh, nhãn chặn ở 50%. Nhãn dài thì CẮT
                bằng "…" (người dùng chốt 24/09/2026) — mười nhãn trạng thái của yêu cầu vẫn phân
                biệt được ở chừng 15 ký tự đầu ("Khung giờ đã có k…" ≠ "Khách không thanh…" ≠
                "Khách đã huỷ"), và một viên cao gấp đôi đẩy cả hàng đầu thẻ xuống.
              */}
              <XStack ai="flex-start" gap={space.sm}>
                <Text
                  f={1}
                  col={colors.text}
                  fos={fontSize.bodyLg}
                  fow={fontWeight.bold}
                  numberOfLines={2}
                >
                  {request.vehicleName}
                </Text>
                <YStack flexShrink={1} maxWidth="50%">
                  <StatusBadge
                    label={domainLabel('bookingRequestStatus', status, meta.label)}
                    color={meta.color}
                    size="sm"
                  />
                </YStack>
              </XStack>
              {vehicleMeta ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={2}>
                  {vehicleMeta}
                </Text>
              ) : null}

              {/*
                Hai viên NẰM TRONG cột chữ của xe, không phải một hàng riêng chạy hết bề ngang
                thẻ. Chúng mô tả chính chiếc xe này, nên đặt cạnh tên xe là đúng chỗ — và bỏ được
                một hàng đầy đủ trong một thẻ vốn đã dài.
              */}
              <XStack flexWrap="wrap" gap={space.xs}>
                {request.vehicleType ? (
                  <Chip
                    label={domainLabel('vehicleType', request.vehicleType as VehicleType)}
                    size="sm"
                  />
                ) : null}
                <Chip label={domainLabel('serviceType', request.serviceType)} size="sm" />
              </XStack>

              {/*
                Lịch của CHÍNH chiếc xe này — câu hỏi đầu tiên trước khi duyệt là "xe có rảnh khung
                đó không". Là một lối đi THẬT sang màn lịch (đã lọc sẵn theo biển số), không phải
                một tấm trượt: xem lịch cần cả màn hình và người ta ở lại đó một lúc. Web đặt đúng
                liên kết này ở cùng chỗ.
              */}
              {canViewVehicle ? (
                <Chip
                  label={t('vehicle.viewSchedule')}
                  accessibilityLabel={t('vehicle.viewScheduleFor', {
                    vehicle: request.vehicleName,
                  })}
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
            </YStack>
          </XStack>

          <Divider />

          {/*
            Khách hàng KHÔNG có nhãn vùng "KHÁCH HÀNG".

            Ảnh đại diện + tên + số điện thoại đã tự nói nó là ai; một dòng viết hoa phía trên chỉ
            lặp lại điều đó và tiêu mất một dòng. Thẻ này vốn có tới bốn nhãn vùng viết hoa, và
            chính chúng làm nó trông như một biểu mẫu chứ không phải một thẻ.
          */}
          <YStack gap={space.xs}>
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
                  <Text col={colors.primaryActive} fos={fontSize.bodySm} fow={fontWeight.bold}>
                    {request.customerName.trim().charAt(0).toUpperCase() || '?'}
                  </Text>
                </YStack>
              )}
              <YStack f={1} gap={1}>
                <Text
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {request.customerName}
                </Text>
                <Text col={colors.primaryActive} fos={fontSize.bodySm} numberOfLines={1}>
                  {request.customerPhone}
                </Text>
                {request.customerEmail ? (
                  <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
                    {request.customerEmail}
                  </Text>
                ) : null}
              </YStack>
            </XStack>

            {/* Khách chưa có hồ sơ trong gian hàng — nói ra, vì nó đổi cách người trực xử lý. */}
            {!request.tenantCustomerId ? <Hint>{t('customer.noProfile')}</Hint> : null}
          </YStack>

          {/*
            Yêu cầu ĐÃ thành đơn thì CẢ KHỐI là một nút mở chi tiết đơn — người trực đọc lịch xong
            bấm thẳng vào chỗ vừa đọc. Chưa có đơn thì khối ở dạng tĩnh.
          */}
          <Pressable
            onPress={openDetail}
            accessibilityRole="button"
            accessibilityLabel={
              openableBooking
                ? t('trace.viewBookingFor', { vehicle: request.vehicleName })
                : t('detail.title')
            }
            style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}
          >
            <YStack gap={space.xs} p={space.sm} br={radius.md} bg={colors.surfaceMuted}>
              <ZoneTitle>{t('schedule.heading')}</ZoneTitle>

              {hasSchedule ? (
                <>
                  <DataRow label={t('schedule.pickup')} value={fmt.rentalPoint(pickup)} />
                  <DataRow label={t('schedule.return')} value={fmt.rentalPoint(dropoff)} />
                  <DataRow
                    label={t('schedule.duration')}
                    value={fmt.rentalDuration(pickup, dropoff)}
                  />
                  {isLongTerm && packageLabel ? (
                    <DataRow label={t('schedule.package')} value={packageLabel} />
                  ) : null}
                </>
              ) : (
                // Dài hạn CHƯA duyệt không có lịch (ADR 0011): bịa một khoảng ngày ở đây khiến
                // người trực tưởng khách đã chốt giờ nhận.
                <>
                  <DataRow
                    label={t('schedule.package')}
                    value={packageLabel ?? t('schedule.packageMissing')}
                  />
                  <DataRow label={t('schedule.pickupWish')} value={fmt.pickupWish(request)} />
                </>
              )}

              {/* LUÔN nói rõ một trong hai hình thức — im lặng bị đọc là "chắc khách tự đến". */}
              <DataRow
                label={t('schedule.handoverHeading')}
                value={
                  request.deliveryRequested
                    ? t('schedule.handoverDelivery')
                    : t('schedule.handoverAtShop')
                }
              />

              {isLongTerm && !hasSchedule ? <Hint>{t('schedule.pickupWishHint')}</Hint> : null}

              <XStack
                ai="center"
                jc="flex-end"
                gap={2}
                pt={space.xs}
                borderTopWidth={1}
                bc={colors.borderSubtle}
              >
                <Text
                  flexShrink={1}
                  col={colors.primaryActive}
                  fos={fontSize.bodySm}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {openableBooking ? t('trace.viewBooking') : t('detail.title')}
                </Text>
                <Ionicons name="chevron-forward" size={iconSize.xs} color={colors.primaryActive} />
              </XStack>
            </YStack>
          </Pressable>

          {/* Ngữ cảnh chỉ MỘT SỐ yêu cầu có. */}
          {isWithDriver && (routeType || request.pickupAddress || request.destination) ? (
            <YStack gap={space.xs}>
              {routeType ? (
                <XStack ai="center" gap={space.xs} rowGap={space.xs} flexWrap="wrap">
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('schedule.route')}
                  </Text>
                  {/* `StatusBadge` chứ không `Chip`: `Chip` không có biến thể cảnh báo. */}
                  <StatusBadge
                    label={domainLabel('routeType', routeType)}
                    color={longDistance ? STATUS_COLOR.WARNING : STATUS_COLOR.NEUTRAL}
                    size="sm"
                  />
                </XStack>
              ) : null}
              {request.pickupAddress ? (
                <DataRow label={t('schedule.pickupAddress')} value={request.pickupAddress} block />
              ) : null}
              {request.destination ? (
                <DataRow label={t('schedule.destination')} value={request.destination} block />
              ) : null}
            </YStack>
          ) : null}

          {request.deliveryRequested ? (
            <YStack gap={space.xs}>
              {request.deliveryAddress ? (
                <DataRow
                  label={t('schedule.deliveryAddress')}
                  value={request.deliveryAddress}
                  block
                />
              ) : null}
              {/* KHÔNG hứa giao nhận miễn phí: đơn sinh ra phí 0₫ rồi chủ xe chốt lại sau. */}
              <Hint>{t('schedule.deliveryFeeHint')}</Hint>
            </YStack>
          ) : null}

          {/*
            TIỀN — vùng riêng cạnh lịch trình (mẫu 19/09): "khi nào" và "bao nhiêu" là hai loại
            thông tin khác nhau. `pricing` là `null` khi không tính được (dài hạn chưa chốt lịch,
            xe thiếu giá, chưa có chính sách phí — xem `BookingRequestPricingDto`), và lúc đó
            KHÔNG dựng vùng rỗng.
          */}
          {request.pricing ? (
            <YStack gap={space.xs}>
              <ZoneTitle>{t('pricing.zoneHeading')}</ZoneTitle>
              {/*
                "Khách trả" KHÔNG lặp lại khi hai số bằng nhau (không có phụ phí) — hai nhãn trỏ
                một số là mập mờ, không phải đầy đủ hơn. "Tiền thuê" luôn có mặt: nó là con số
                nền, không đổi theo phụ phí.
              */}
              <DataRow
                label={t('pricing.rentalTotal')}
                value={fmt.money(request.pricing.rentalTotal)}
                strong={request.pricing.customerTotalAmount === request.pricing.rentalTotal}
                {...(request.pricing.isEstimate &&
                request.pricing.customerTotalAmount === request.pricing.rentalTotal
                  ? { hint: t('pricing.estimateBadge') }
                  : {})}
              />
              {request.pricing.customerTotalAmount !== request.pricing.rentalTotal ? (
                <DataRow
                  label={t('pricing.customerTotal')}
                  value={fmt.money(request.pricing.customerTotalAmount)}
                  strong
                  {...(request.pricing.isEstimate ? { hint: t('pricing.estimateBadge') } : {})}
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
            </YStack>
          ) : null}

          {request.note ? (
            <NotePanel icon="chatbox-ellipses-outline" title={t('note.label')} tone="muted">
              {request.note}
            </NotePanel>
          ) : null}

          {request.rejectReason ? (
            <NotePanel icon="close-circle-outline" title={t('trace.rejectReason')} tone="danger">
              {request.rejectReason}
            </NotePanel>
          ) : null}

          {showRisk ? (
            <XStack
              ai="flex-start"
              gap={space.xs}
              p={space.sm}
              br={radius.md}
              bg={colors.warningSurface}
            >
              <Ionicons name="alert-circle-outline" size={iconSize.sm} color={colors.warning} />
              <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                {t('customer.riskWarning', {
                  level: domainLabel('tenantCustomerRiskLevel', riskLevel),
                })}
              </Text>
            </XStack>
          ) : null}

          {/*
            Dấu vết xử lý — MỘT hàng có icon dẫn, không phải hai dòng chữ mờ trôi nổi.

            Hai dòng rời nhau ở cuối thẻ đọc như phần bị bỏ quên. Gộp lại và cho một biểu tượng
            đồng hồ thì chúng thành một dữ kiện có chủ, và tiết kiệm một dòng.
          */}
          <XStack ai="flex-start" gap={space.xs}>
            <Ionicons name="time-outline" size={iconSize.xs} color={colors.placeholder} />
            <YStack f={1} gap={1}>
              <Timestamp>
                {t('trace.createdAt', { value: fmt.dateTime(request.createdAt) })}
              </Timestamp>
              {request.decidedAt ? (
                <Timestamp>
                  {t('trace.decidedAt', { value: fmt.dateTime(request.decidedAt) })}
                </Timestamp>
              ) : null}
            </YStack>
          </XStack>

          {/* Chân thẻ: liên hệ trước, quyết định sau. */}
          <YStack gap={space.sm} pt={space.sm} borderTopWidth={1} bc={colors.borderSubtle}>
            <ContactRow request={request} />

            {/*
              Đồng hồ hạn phản hồi đi THEO hai nút quyết định, không theo viên trạng thái ở đầu
              thẻ. Nó là áp lực cho đúng một việc — bấm Duyệt hay Từ chối — nên nó thuộc về chỗ
              việc đó xảy ra. Vẫn hiện khi người xem KHÔNG có quyền quyết định: họ cũng cần biết
              yêu cầu này sắp hết hạn để còn gọi người có quyền.
            */}
            {needsDecision ? (
              <XStack jc="flex-end">
                <RespondDeadline respondBy={request.respondBy} />
              </XStack>
            ) : null}

            {/* Chỉ yêu cầu CÒN chờ VÀ CHƯA quá hạn mới có nút quyết định. */}
            {decidable && canDecide ? (
              <YStack gap={space.xs}>
                <Button
                  label={t('actions.approve')}
                  size="sm"
                  icon="checkmark-circle-outline"
                  onPress={() => onApprove(request)}
                />
                <Button
                  label={t('actions.reject')}
                  variant="secondary"
                  size="sm"
                  icon="close-circle-outline"
                  onPress={() => onReject(request)}
                />
              </YStack>
            ) : needsDecision && pastDue ? (
              // Nói vì sao không còn nút, và việc cần làm tiếp — im lặng ở đây đọc như một lỗi tải.
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('deadline.pastDueHint')}
              </Text>
            ) : status === BOOKING_REQUEST_STATUS.AWAITING_HOLD ? (
              /*
               * Đã nhận chuyến, đang chờ khách thanh toán (ADR 0044), nhưng im lặng ở
               * đây đọc như thẻ bị mất nút. Nói thẳng lý do thay vì để trống khó hiểu.
               */
              <YStack gap={space.xs}>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {/*
                    Kèm ĐÚNG mốc mà chỗ sẽ tự nhả nếu tiền không về — thứ quyết định người trực
                    có nên gọi cho khách hay không. Mốc tuyệt đối, không phải đồng hồ chạy: một
                    danh sách mười thẻ với mười nhịp mỗi giây là chi phí không đổi lại được gì.
                  */}
                  {request.holdExpiresAt
                    ? `${t('awaitingHold.footerHint')} ${t('awaitingHold.deadline')} ${fmt.dateTime(request.holdExpiresAt)}`
                    : t('awaitingHold.footerHint')}
                </Text>
                {/*
                  Lối thoát HUỶ — chặng DUY NHẤT mà gian hàng đã hứa nhận nhưng chuyến chưa thành
                  đơn. Trước ADR 0045 chặng này không có nút nào: xe hỏng lúc mười giờ tối thì
                  đường duy nhất là gọi điện xin lỗi rồi ngồi chờ hết cửa sổ hai giờ, trong lúc
                  lịch xe vẫn bị giữ.

                  Cỡ `sm` và nền nhạt (`danger`) chứ không phải nút đỏ đặc: việc chính ở
                  chặng này là ĐỢI.
                */}
                {canDecide ? (
                  <Button
                    label={t('actions.cancel')}
                    variant="danger"
                    size="sm"
                    onPress={() => onCancel(request)}
                  />
                ) : null}
              </YStack>
            ) : null}
          </YStack>
        </YStack>
      </XStack>
    </Card>
  );
}

/**
 * Ba lối liên hệ, cùng bộ với web.
 *
 * Gọi điện LUÔN có mặt: khách gửi yêu cầu bằng SĐT, và với người chưa có tài khoản XePrime thì
 * đó là cách liên hệ duy nhất. "Nhắn tin" chỉ hiện khi `canMessageOnPlatform` — nhắn cho một
 * người không có tài khoản thì tin đi vào hư không.
 */
function ContactRow({ request }: { request: BookingRequestItem }) {
  const t = useTranslations('BookingRequests.actions');
  const phone = request.customerPhone;
  // Dùng `telHref`/`zaloHref` chứ không ghép tay `tel:${phone}`: ghép tay hỏng im lặng với dạng
  // `84…`/`+84…` mà `users.phone` đang lưu. `null` = không có số gọi được → ẩn nút.
  const tel = telHref(phone);
  const zalo = zaloHref(phone);
  const call = tel ? () => void Linking.openURL(tel) : null;

  return (
    <XStack gap={space.xs} rowGap={space.xs} flexWrap="wrap">
      {request.canMessageOnPlatform && call ? (
        <ContactButton
          label={t('message')}
          icon="chatbubble-outline"
          // Chat realtime chưa dựng ở app (ADR 0009): nút giữ chỗ để bố cục không đổi khi chat
          // lên, tạm mở luồng gọi.
          onPress={call}
        />
      ) : null}

      {call ? <ContactButton label={t('call')} icon="call-outline" onPress={call} /> : null}

      {/*
        Icon Ionicons, KHÔNG phải logo Zalo tự vẽ.

        Bộ icon của app không có Zalo, và vẽ tay một cái thì nó chỉ GẦN GIỐNG logo thật — sai
        thương hiệu ở mọi cỡ, mà lại là một hình không ai bảo trì. Nhãn "Zalo" nói đủ danh tính;
        icon chỉ cần phân biệt được với "Nhắn tin" ngay cạnh, nên dùng bong bóng KÉP.
      */}
      {zalo ? (
        <ContactButton
          label={t('zalo')}
          icon="chatbubbles-outline"
          onPress={() => void Linking.openURL(zalo)}
        />
      ) : null}
    </XStack>
  );
}

/**
 * Một nút liên hệ. Ba cái CHUNG một tông gold nhạt vì chúng là một CỤM — ba cách gọi tới cùng
 * một người.
 *
 * KHÔNG dùng `Button`: lề ngang cố định của nó làm "Nhắn tin" bị cắt ở một phần ba bề ngang màn
 * 360dp. Lề ở đây rút còn `space.xs`; vùng chạm vẫn giữ sàn bằng `minHeight`.
 */
function ContactButton({
  label,
  icon,
  onPress,
}: {
  label: string;
  icon: keyof typeof Ionicons.glyphMap;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      style={({ pressed }) => [styles.contactButton, { opacity: pressed ? 0.7 : 1 }]}
    >
      <XStack
        ai="center"
        jc="center"
        gap={space.xs}
        px={space.xs}
        br={radius.md}
        bw={1}
        bg={colors.primaryLight}
        bc={colors.primary}
        minHeight={sizing.touchTarget}
      >
        <Ionicons name={icon} size={iconSize.sm} color={colors.primaryActive} />
        <Text
          col={colors.primaryActive}
          fos={fontSize.label}
          fow={fontWeight.semibold}
          numberOfLines={1}
        >
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}

/**
 * Một khối chữ TỰ DO của người dùng: ghi chú của khách, lý do gian hàng từ chối.
 *
 * Có NỀN chứ không phải chữ trần dưới một nhãn viết hoa: đây là chữ do NGƯỜI viết xen giữa dữ
 * liệu có cấu trúc, và cái nền nói ra ranh giới đó mà không tốn thêm dòng nào. Màu mang NGHĨA —
 * đỏ nhạt cho lý do từ chối.
 */
function NotePanel({
  icon,
  title,
  tone,
  children,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  title: string;
  tone: 'muted' | 'danger';
  children: string;
}) {
  const danger = tone === 'danger';

  return (
    <XStack
      ai="flex-start"
      gap={space.xs}
      p={space.sm}
      br={radius.md}
      bg={danger ? colors.dangerSurface : colors.surfaceMuted}
    >
      <Ionicons name={icon} size={iconSize.sm} color={danger ? colors.danger : colors.textMuted} />
      <YStack f={1} gap={2}>
        <Text
          col={danger ? colors.danger : colors.textMuted}
          fos={fontSize.label}
          fow={fontWeight.semibold}
        >
          {title}
        </Text>
        {/*
          `numberOfLines` giữ nguyên 2 như bản cũ: thẻ trong danh sách phải cao đều nhau, và
          bản đầy đủ nằm ở màn chi tiết.
        */}
        <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={2}>
          {children}
        </Text>
      </YStack>
    </XStack>
  );
}

/**
 * Nhãn vùng — nhỏ, viết hoa, mờ. Cùng vai `zoneTitle` của web.
 *
 * `f={1}` + `numberOfLines`: nó hay đứng cạnh một chip hoặc link trong hàng `space-between`, không
 * co được thì nhãn dài (tiếng Anh dài hơn tiếng Việt) đẩy thứ bên phải tràn khỏi thẻ.
 */
function ZoneTitle({ children }: { children: string }) {
  return (
    <Text
      f={1}
      col={colors.textMuted}
      fos={fontSize.label}
      fow={fontWeight.semibold}
      numberOfLines={1}
    >
      {children.toUpperCase()}
    </Text>
  );
}

function Hint({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.label}>
      {children}
    </Text>
  );
}

function Timestamp({ children }: { children: string }) {
  return (
    <Text col={colors.placeholder} fos={fontSize.label}>
      {children}
    </Text>
  );
}

export const BookingRequestCard = memo(BookingRequestCardImpl);
