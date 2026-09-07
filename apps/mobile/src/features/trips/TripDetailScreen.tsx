import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  canCustomerCancelTrip,
  CUSTOMER_TRIP_STAGE,
  CUSTOMER_TRIP_STAGE_META,
  isCustomerTripClosed,
  SERVICE_TYPE,
  type CustomerTripStage,
} from '@xeprime/types';
import { dayjs, LIST_SEPARATOR } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { Stars } from '@/components/ui/Stars';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { getErrorCode } from '@/lib/api-client';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { CancelTripSheet } from './components/CancelTripSheet';
import { ReviewSheet } from './components/ReviewSheet';
import { TripFinanceCard } from './components/TripFinanceCard';
import { TripHandoverEvidence } from './components/TripHandoverEvidence';
import { TripTimeline } from './components/TripTimeline';
import { useCancelTrip, useTrip } from './hooks/use-trips';
import type { CustomerTripDetail } from './api';

/**
 * Chi tiết một chuyến của khách (BKG-15, 16).
 *
 * `GET /trips/:id` nhận CẢ id yêu cầu lẫn id đơn, nên một màn phục vụ hai giai đoạn của cùng
 * một chuyến — không cần đoán loại id trước khi điều hướng.
 *
 * Đường GHI duy nhất của khách ở đây là **huỷ chuyến**. Phát sinh, hoàn cọc, đổi lịch đều thuộc
 * luồng chủ xe; mở thêm đường ghi cho khách là dựng một máy trạng thái thứ hai chạy song song.
 */
export function TripDetailScreen({ tripId }: { tripId: string }) {
  const t = useTranslations('Trips');
  const router = useRouter();
  const query = useTrip(tripId);

  if (query.isPending) {
    return (
      <>
        <AppHeader
          title={t('detail.heading')}
          onBack={() => goBackOr(router, ROUTES.booking.list())}
        />
        <Screen
          edges={['left', 'right', 'bottom']}
          refreshing={query.isRefetching}
          onRefresh={() => void query.refetch()}
        >
          <TripDetailSkeleton />
        </Screen>
      </>
    );
  }

  if (query.isError) {
    /*
     * "Không tìm thấy" là một KẾT CỤC, không phải một lỗi để thử lại.
     *
     * Backend trả 404 cho cả "không tồn tại" lẫn "không phải chuyến của bạn" — cố ý, để không xác
     * nhận sự tồn tại chuyến của người khác. Nên ở đây cũng chỉ MỘT câu, và lối thoát là quay về
     * danh sách chứ không phải bấm "Thử lại" mãi. Nhánh theo MÃ lỗi có cấu trúc, không theo câu
     * tiếng Việt của backend (ADR 0012).
     */
    const missing = getErrorCode(query.error) === API_ERROR_CODE.NOT_FOUND;

    return (
      <>
        <AppHeader
          title={t('detail.heading')}
          onBack={() => goBackOr(router, ROUTES.booking.list())}
        />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {missing ? (
            <ScreenMessage
              icon="calendar-outline"
              title={t('detail.notFoundTitle')}
              description={t('detail.notFoundBody')}
              actionLabel={t('detail.backToTrips')}
              onAction={() => router.replace(ROUTES.booking.list())}
            />
          ) : (
            <ScreenError
              error={query.error}
              title={t('detail.errorTitle')}
              onRetry={() => void query.refetch()}
            />
          )}
        </Screen>
      </>
    );
  }

  return <TripDetailBody trip={query.data} />;
}

function TripDetailBody({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips');
  const router = useRouter();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const [cancelling, setCancelling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const cancelTrip = useCancelTrip(trip.id);

  const stage = trip.stage as CustomerTripStage;
  const meta = CUSTOMER_TRIP_STAGE_META[stage];
  const closed = isCustomerTripClosed(stage);

  function confirmCancel() {
    cancelTrip.mutate(undefined, {
      onSuccess: () => {
        setCancelling(false);
        toast.showSuccess(t('cancel.title'));
      },
      onError: (error) => toast.showError(errorMessage(error)),
    });
  }

  return (
    <>
      <AppHeader
        title={trip.code ? t('detail.headingWithCode', { code: trip.code }) : t('detail.heading')}
        subtitle={subtitleOf(t, stage)}
        onBack={() => goBackOr(router, ROUTES.booking.list())}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={layout.section}>
          <Card>
            <YStack gap={space.md}>
              <XStack ai="center" jc="space-between" gap={space.sm}>
                <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
                  {subtitleOf(t, stage)}
                </Text>
                <StatusBadge
                  label={domainLabel('customerTripStage', stage, meta.label)}
                  color={meta.color}
                />
              </XStack>
              <TripTimeline stage={stage} />
            </YStack>
          </Card>

          <StageNotice stage={stage} rejectReason={trip.rejectReason} />

          {/*
            Khối nổi bật của chuyến ĐANG DIỄN RA — web dựng đúng khối này (`.highlight`) và nó là
            câu trả lời cho việc duy nhất khách mở màn này lúc đang thuê: mấy giờ phải trả xe.
          */}
          {stage === CUSTOMER_TRIP_STAGE.ACTIVE && trip.returnAt ? (
            <Card tone="accent">
              <YStack gap={space.xs}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                  {t('detail.activeTitle')}
                </Text>
                <XStack ai="center" gap={space.xs} flexWrap="wrap">
                  <Ionicons name="time-outline" size={iconSize.sm} color={colors.primaryActive} />
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t('detail.activeReturn')}
                  </Text>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
                    {fmt.rentalPoint(dayjs(trip.returnAt))}
                  </Text>
                </XStack>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('detail.activeNote')}
                </Text>
              </YStack>
            </Card>
          ) : null}

          <VehicleBlock trip={trip} />
          <ShopBlock trip={trip} />

          <Card>
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                {t('detail.scheduleBlock')}
              </Text>
              <DataRow
                label={t('detail.service')}
                value={
                  domainLabel('serviceType', trip.serviceType) +
                  (trip.routeType ? ` · ${domainLabel('routeType', trip.routeType)}` : '')
                }
              />
              {trip.longTermPackageMonths ? (
                <DataRow
                  label={t('detail.package')}
                  value={fmt.packageLabel(trip.longTermPackageMonths) ?? ''}
                />
              ) : null}
              {/*
                Có lịch thì in đủ BA dòng như web — nhận, trả và THỜI LƯỢNG. Thiếu thời lượng thì
                khách phải tự trừ hai mốc, mà đó chính là con số đơn giá nhân lên.

                Dài hạn CHƯA duyệt không có lịch nào: khách mới nêu nguyện vọng, gian hàng chốt khi
                duyệt và server tính ngày trả bằng THÁNG LỊCH (ADR 0011). Đổ `dayjs(null)` vào đây
                sẽ in "Invalid Date", tệ hơn nữa là khiến khách tưởng lịch đã chốt.
              */}
              {trip.pickupAt && trip.returnAt ? (
                <>
                  <DataRow
                    label={t('detail.pickupAt')}
                    value={fmt.rentalPoint(dayjs(trip.pickupAt))}
                  />
                  <DataRow
                    label={t('detail.returnAt')}
                    value={fmt.rentalPoint(dayjs(trip.returnAt))}
                  />
                  <DataRow
                    label={t('detail.duration')}
                    value={fmt.rentalDuration(dayjs(trip.pickupAt), dayjs(trip.returnAt))}
                  />
                </>
              ) : (
                <DataRow label={t('detail.pickupWish')} value={fmt.pickupWish(trip)} />
              )}

              <PickupMethod trip={trip} />
            </YStack>
          </Card>

          {trip.actualPickupAt || trip.actualReturnAt ? (
            <Card>
              <YStack gap={space.sm}>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                  {t('detail.actualBlock')}
                </Text>
                {trip.actualPickupAt ? (
                  <DataRow
                    label={t('detail.actualPickup')}
                    value={fmt.dateTime(trip.actualPickupAt)}
                  />
                ) : null}
                {trip.actualReturnAt ? (
                  <DataRow
                    label={t('detail.actualReturn')}
                    value={fmt.dateTime(trip.actualReturnAt)}
                  />
                ) : null}
              </YStack>
            </Card>
          ) : null}

          {trip.finance ? (
            <TripFinanceCard finance={trip.finance} closed={closed} />
          ) : (
            /*
              Chưa có đơn thì chưa có giá chốt. Dựng một bảng "dự kiến" ở đây là hứa hẹn thay chủ
              xe — con số có thể khác hẳn sau khi họ xác nhận. Vẫn giữ TIÊU ĐỀ khối như web, nếu
              không thì một dòng chữ xám trôi giữa trang chẳng thuộc về đâu.
            */
            <Card>
              <YStack gap={space.xs}>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                  {t('detail.priceBlock')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('detail.priceEmpty')}
                </Text>
              </YStack>
            </Card>
          )}

          {/* Chỉ hỏi bằng chứng bàn giao khi chuyến ĐÃ đi tới đó — chờ duyệt thì chắc chắn rỗng. */}
          <TripHandoverEvidence
            tripId={trip.id}
            enabled={stage === CUSTOMER_TRIP_STAGE.ACTIVE || closed}
          />

          {/* Ghi chú khách gửi kèm yêu cầu — web có khối này, và nó là chữ của chính họ. */}
          {trip.customerNote ? (
            <Card>
              <YStack gap={space.xs}>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                  {t('detail.noteBlock')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {trip.customerNote}
                </Text>
              </YStack>
            </Card>
          ) : null}

          {trip.review ? (
            <Card>
              <YStack gap={space.xs}>
                <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
                  {t('detail.reviewBlock')}
                </Text>
                <Stars value={trip.review.rating} size={iconSize.sm} />
                {trip.review.comment ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {trip.review.comment}
                  </Text>
                ) : null}
              </YStack>
            </Card>
          ) : null}

          <TripActions
            trip={trip}
            stage={stage}
            onCancel={() => setCancelling(true)}
            onReview={() => setReviewing(true)}
          />
        </YStack>
      </Screen>

      <CancelTripSheet
        open={cancelling}
        onClose={() => setCancelling(false)}
        trip={trip}
        onConfirm={confirmCancel}
        loading={cancelTrip.isPending}
      />
      <ReviewSheet open={reviewing} onClose={() => setReviewing(false)} trip={trip} />
    </>
  );
}

/** Ảnh xe 16:9 — cùng tỉ lệ với mọi chỗ khác trong app, và đủ để nhận ra chiếc xe. */
const VEHICLE_PHOTO_RATIO = 16 / 9;

/** Không phụ thuộc prop/state — dựng MỘT lần ở module scope, không phải mỗi lần render. */
const VEHICLE_PHOTO_STYLE = { width: '100%', aspectRatio: VEHICLE_PHOTO_RATIO } as const;

/**
 * Khối "Thông tin phương tiện" — **ảnh · tên (bấm được, sang trang xe) · thông số · biển số**,
 * cùng bộ với khối đầu tiên bên web: đó là thứ khách đối chiếu khi ra tới điểm nhận.
 *
 * Biển số chỉ có SAU khi chủ xe nhận chuyến — server quyết, không phải giao diện.
 */
function VehicleBlock({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.detail');
  const navigateOnce = useNavigateOnce();
  const { vehicle } = trip;

  /*
   * `transmission`/`fuelType` in NGUYÊN giá trị server trả, y như web. Chúng không đi qua bảng
   * danh mục ở đây vì web cũng không — hai client phải nói cùng một chuỗi cho cùng một chiếc xe.
   */
  const specs =
    [
      vehicle.seatCount ? t('seatCount', { count: vehicle.seatCount }) : null,
      vehicle.transmission,
      vehicle.fuelType,
    ]
      .filter(Boolean)
      .join(LIST_SEPARATOR) || t('specsEmpty');

  return (
    <Card padded={false}>
      {vehicle.imageUrl ? (
        <Image
          source={{ uri: vehicle.imageUrl }}
          style={VEHICLE_PHOTO_STYLE}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={150}
        />
      ) : null}

      <YStack p={space.md} gap={space.xs}>
        <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('vehicleBlock')}
        </Text>

        <Pressable
          onPress={() => navigateOnce(ROUTES.explore.listingDetail(vehicle.id))}
          accessibilityRole="link"
          accessibilityLabel={vehicle.name}
        >
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
            {vehicle.name}
          </Text>
        </Pressable>

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {specs}
        </Text>

        {vehicle.plateNumber ? (
          <XStack
            alignSelf="flex-start"
            bg={colors.surfaceMuted}
            br={radius.sm}
            px={space.sm}
            py={2}
          >
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
              {vehicle.plateNumber}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

/**
 * Thẻ gian hàng — avatar · tên · điểm đánh giá · lối sang trang gian hàng.
 *
 * Web có nguyên khối này (`.shop`) và app thiếu sạch: khách không biết mình đang thuê của ai,
 * cũng không có đường sang xem gian hàng đó.
 *
 * Chỉ hiện SAO khi có đánh giá thật; `ratingAvg` là 0 lúc chưa ai đánh giá, và vẽ năm sao rỗng
 * cạnh "0.0" đọc ra như một gian hàng bị chấm điểm kém.
 *
 * KHÔNG có nút "Xem gian hàng" như web: trang gian hàng (MKT-05) chưa dựng ở app, nên nút đó
 * không có chỗ nào để tới. Khoá `detail.viewShop` giữ nguyên, gắn vào đây ngay khi trang có mặt.
 */
function ShopBlock({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.detail');
  const fmt = useAppFormat();
  const { shop } = trip;

  return (
    <Card>
      <XStack ai="center" gap={space.sm}>
        <Avatar name={shop.name} size={40} />
        <YStack f={1} gap={2}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
            {shop.name}
          </Text>
          {shop.ratingCount > 0 ? (
            <XStack ai="center" gap={space.xs}>
              <Stars value={shop.ratingAvg} />
              <Text col={colors.textMuted} fos={fontSize.label}>
                {t('ratingSummary', { avg: fmt.rating(shop.ratingAvg), count: shop.ratingCount })}
              </Text>
            </XStack>
          ) : (
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('noRating')}
            </Text>
          )}
        </YStack>
      </XStack>
    </Card>
  );
}

/**
 * MỘT dòng "nhận xe kiểu gì", đúng như `.pickupMethod` của web — không phải mấy `DataRow` rời.
 *
 * Chuyến CÓ TÀI XẾ thì xe đến đón, nên hiện HÀNH TRÌNH (điểm đón + điểm đến) thay cho hình thức
 * nhận xe: nhãn phải là câu trả lời cho "tôi lấy xe ở đâu", không phải tên một trường.
 */
function PickupMethod({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.pickup');
  const withDriver = trip.serviceType === SERVICE_TYPE.WITH_DRIVER;

  const lines = withDriver
    ? [
        trip.pickupAddress ? t('pickupPoint', { address: trip.pickupAddress }) : null,
        trip.destination ? t('destination', { address: trip.destination }) : null,
      ]
    : [trip.deliveryRequested ? trip.deliveryAddress : null];

  return (
    <XStack ai="flex-start" gap={space.xs} pt={space.xs}>
      <Ionicons name="location-outline" size={iconSize.sm} color={colors.textMuted} />
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {withDriver ? t('driverPickup') : trip.deliveryRequested ? t('delivery') : t('agency')}
        </Text>
        {lines.filter(Boolean).map((line) => (
          <Text key={line} col={colors.textMuted} fos={fontSize.label}>
            {line}
          </Text>
        ))}
      </YStack>
    </XStack>
  );
}

/**
 * Hành động của khách.
 *
 * `canReview` do SERVER quyết (đơn phải `completed` và chưa có đánh giá) — client không tự suy
 * từ chặng, vì "hoàn thành" ở phía khách và "được đánh giá" ở phía server không phải một điều.
 * `canCustomerCancelTrip` là hằng dùng chung với backend: hai bên không được nói hai luật khác nhau.
 */
function TripActions({
  trip,
  stage,
  onCancel,
  onReview,
}: {
  trip: CustomerTripDetail;
  stage: CustomerTripStage;
  onCancel: () => void;
  onReview: () => void;
}) {
  const t = useTranslations('Trips.actions');
  const tStates = useTranslations('Common.states');
  const toast = useAppToast();
  const phone = trip.shop.phone;

  const canCancel = canCustomerCancelTrip(stage);

  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        {/*
          Nhắn tin cho gian hàng: nút DỰNG SẴN đúng chỗ web đặt nó, nhưng chat realtime
          (ADR 0009) chưa có ở app nên bấm vào chỉ báo "đang phát triển".

          Vẫn hiện chứ không ẩn: đây là việc khách hay cần nhất ngay sau khi gửi yêu cầu, và một
          nút nói thật rằng nó chưa có vẫn tốt hơn một khoảng trống không giải thích gì.
        */}
        <Button
          label={t('contactShop')}
          icon="chatbubble-ellipses-outline"
          onPress={() => toast.showInfo(tStates('featureComingSoon'))}
        />
        {phone ? (
          <Button
            label={t('call')}
            variant="secondary"
            icon="call-outline"
            onPress={() => void Linking.openURL(`tel:${phone}`)}
          />
        ) : null}
        {trip.canReview ? (
          <Button label={t('review')} icon="star-outline" onPress={onReview} />
        ) : null}
        {canCancel ? (
          <Button
            label={t('cancel')}
            variant="danger"
            icon="close-circle-outline"
            onPress={onCancel}
          />
        ) : null}
      </YStack>
    </Card>
  );
}

/** Khối giải thích cho các kết cục — chặng bình thường không có gì để nói thêm. */
function StageNotice({
  stage,
  rejectReason,
}: {
  stage: CustomerTripStage;
  rejectReason?: string | null;
}) {
  const t = useTranslations('Trips.notice');

  /*
   * Tông màu lấy ĐÚNG theo `TerminalNotice` của web: chờ duyệt là `warning` (không phải `info`),
   * bị từ chối và vắng mặt là `error`, huỷ là `info`. Chờ duyệt màu cam vì nó là một VIỆC CHƯA
   * XONG mà khách cần để mắt — xe chưa được giữ chỗ; tô xanh làm nó đọc như một thông báo đã ổn.
   */
  const notice =
    stage === CUSTOMER_TRIP_STAGE.PENDING_APPROVAL
      ? { tone: 'warning' as const, title: t('pendingTitle'), body: t('pendingBody') }
      : stage === CUSTOMER_TRIP_STAGE.REJECTED
        ? {
            tone: 'danger' as const,
            title: t('rejectedTitle'),
            body: rejectReason || t('rejectedBody'),
          }
        : stage === CUSTOMER_TRIP_STAGE.CANCELLED
          ? { tone: 'info' as const, title: t('cancelledTitle'), body: t('cancelledBody') }
          : stage === CUSTOMER_TRIP_STAGE.NO_SHOW
            ? { tone: 'danger' as const, title: t('noShowTitle'), body: t('noShowBody') }
            : null;

  if (!notice) return null;

  const skin =
    notice.tone === 'danger'
      ? { bg: colors.dangerSurface, fg: colors.danger, icon: 'close-circle' as const }
      : notice.tone === 'warning'
        ? { bg: colors.warningSurface, fg: colors.warning, icon: 'alert-circle' as const }
        : { bg: colors.infoSurface, fg: colors.info, icon: 'information-circle' as const };

  /*
   * Hình dạng của `<Alert showIcon>` bên web: biểu tượng bên trái, viền cùng tông, tiêu đề đậm
   * rồi mới tới mô tả — thiếu biểu tượng và viền thì nó đọc ra như một khối chữ bị tô nền.
   */
  return (
    <XStack
      ai="flex-start"
      gap={space.sm}
      bg={skin.bg}
      bw={1}
      bc={skin.fg}
      p={space.md}
      br={radius.md}
    >
      <Ionicons name={skin.icon} size={iconSize.md} color={skin.fg} />
      <YStack f={1} gap={2}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
          {notice.title}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {notice.body}
        </Text>
      </YStack>
    </XStack>
  );
}

/**
 * Câu phụ đề dưới tiêu đề — bốn kết cục hỏng dùng chung một câu.
 *
 * Liệt kê tường minh thay vì ghép chuỗi `subtitle.${stage}`: khoá ghép động lọt qua typecheck
 * của `use-intl`, nên thêm một chặng mới mà quên khoá sẽ thành một ô trống lúc chạy.
 */
function subtitleOf(
  t: ReturnType<typeof useTranslations<'Trips'>>,
  stage: CustomerTripStage,
): string {
  switch (stage) {
    case CUSTOMER_TRIP_STAGE.PENDING_APPROVAL:
      return t('subtitle.pending_approval');
    case CUSTOMER_TRIP_STAGE.READY:
      return t('subtitle.ready');
    case CUSTOMER_TRIP_STAGE.ACTIVE:
      return t('subtitle.active');
    case CUSTOMER_TRIP_STAGE.COMPLETED:
      return t('subtitle.completed');
    default:
      return t('subtitle.terminal');
  }
}

function TripDetailSkeleton() {
  return (
    <YStack gap={layout.section}>
      <Skeleton height={110} />
      <YStack gap={space.sm}>
        <Skeleton width="40%" height={20} />
        <SkeletonText lines={4} />
      </YStack>
      <Skeleton height={160} />
    </YStack>
  );
}
