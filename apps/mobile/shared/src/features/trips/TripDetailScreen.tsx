import { useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { Linking, Pressable } from 'react-native';
import { useRouter, type Href } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  API_ERROR_CODE,
  canCustomerCancelTrip,
  canHostDecideTrip,
  CUSTOMER_TRIP_STAGE,
  isCancellationParty,
  isCancellationReasonCategory,
  CANCELLATION_PARTY,
  CUSTOMER_CANCELLATION_REASON_VALUES,
  CUSTOMER_TRIP_STAGE_META,
  customerTripTimeline,
  DEPOSIT_COLLECTION_MODE,
  isCustomerTripClosed,
  SERVICE_TYPE,
  STOREFRONT_KIND,
  TRIP_ROLE,
  isAwaitingPayment,
  type BookingHoldStatus,
  type CustomerCancellationReason,
  type CustomerTripStage,
} from '@xeprime/types';
import { dayjs, LIST_SEPARATOR, canShowHostChatOnTrip } from '@xeprime/domain';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Avatar } from '@/components/ui/Avatar';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DataRow } from '@/components/ui/DataRow';
import { Stars } from '@/components/ui/Stars';
import { VerifiedName } from '@/components/ui/VerifiedName';
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
import { usePullRefresh } from '@/hooks/use-pull-refresh';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { CancelTripSheet } from './components/CancelTripSheet';
import { ReviewSheet } from './components/ReviewSheet';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { TripEstimateCard } from './components/TripEstimateCard';
import { TripFinanceCard } from './components/TripFinanceCard';
import {
  TripGatewayNotice,
  useTripGateway,
} from '@/features/payment-gateway/components/TripGatewayPay';
import { TripHoldPanel } from './components/TripHoldPanel';
import { TripHandoverEvidence } from './components/TripHandoverEvidence';
import { ApproveSuccessSheet } from '@/features/booking-requests/components/ApproveSuccessSheet';
import type { BookingRequestDecisionTarget } from '@/features/booking-requests/api';
import { TripHostDecisions } from './components/TripHostDecisions';
import { TripTimeline } from './components/TripTimeline';
import { closedNotice, stageNotice } from './stage-notice';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
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
export function TripDetailScreen({
  tripId,
  listHref = ROUTES.booking.list(),
}: {
  tripId: string;
  /**
   * Danh sách chứa chuyến này — nút lui rơi về đây khi không còn gì để lui. Web
   * `TripDetailView.backHref`: `/trips` ở khu khách, `/manage/account/trips` ở khu quản lý.
   */
  listHref?: Href;
}) {
  const t = useTranslations('Trips');
  const router = useRouter();
  const query = useTrip(tripId);
  // Vòng quay chỉ khi KHÁCH kéo — `isRefetching` bật cả ở nhịp poll hold và lượt quay về tiền cảnh.
  const pull = usePullRefresh(query.refetch);

  if (query.isPending) {
    return (
      <>
        <AppHeader title={t('detail.heading')} onBack={() => goBackOr(router, listHref)} />
        <Screen
          edges={['left', 'right', 'bottom']}
          refreshing={pull.refreshing}
          onRefresh={pull.onRefresh}
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
        <AppHeader title={t('detail.heading')} onBack={() => goBackOr(router, listHref)} />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          {missing ? (
            <ScreenMessage
              icon="calendar-outline"
              title={t('detail.notFoundTitle')}
              description={t('detail.notFoundBody')}
              actionLabel={t('detail.backToTrips')}
              onAction={() => router.replace(listHref)}
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

  return (
    <TripDetailBody
      trip={query.data}
      listHref={listHref}
      refreshing={pull.refreshing}
      onRefresh={pull.onRefresh}
    />
  );
}

function TripDetailBody({
  trip,
  listHref,
  refreshing,
  onRefresh,
}: {
  trip: CustomerTripDetail;
  listHref: Href;
  /** Vuốt xuống ⇒ đọc lại chuyến (chặng, tiền giữ chỗ, quyết định của chủ xe). */
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations('Trips');
  const router = useRouter();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();

  const [cancelling, setCancelling] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [editingReview, setEditingReview] = useState(false);
  /**
   * Bản ghi server trả về sau lượt duyệt — state ở ĐÂY, không ở `TripHostDecisions`.
   *
   * Cụm quyết định bị gác bằng `canHostDecideTrip(stage)`, mà chính lượt duyệt làm `stage` đổi:
   * nhánh không thu giữ chỗ đi thẳng sang `ready`, cổng trả `false`, cụm unmount. Nếu tấm kết
   * quả sống trong đó thì nó chớp lên rồi biến mất ngay khi truy vấn refetch — mang theo nút
   * "Xem chi tiết đơn", tức lối DUY NHẤT sang đơn vừa tạo.
   *
   * Ở màn cha thì nó sống độc lập với chặng, và tự đóng khi người dùng bấm.
   */
  const [approved, setApproved] = useState<BookingRequestDecisionTarget | null>(null);
  const cancelTrip = useCancelTrip(trip.id);
  /**
   * Lượt MoMo/VNPAY đã mở trước đó — thông báo đứng NGOÀI panel giữ chỗ (web: `TripGatewayReturn`).
   * Nút trả đã chuyển sang màn thanh toán riêng (`TripPaymentScreen`, 13/10/2026).
   */
  const gateway = useTripGateway(trip.id);

  const stage = trip.stage as CustomerTripStage;
  const meta = CUSTOMER_TRIP_STAGE_META[stage];
  const closed = isCustomerTripClosed(stage);
  /*
    `GET /trips/:id` phục vụ cả hai đầu của một chuyến. Vai quyết định bảng tạm tính hiện tới
    đâu: khách dừng ở "Tổng bạn trả", chủ xe thấy thêm số THỰC NHẬN (ADR 0029 điều 1).
  */
  const isHost = trip.role === TRIP_ROLE.HOST;

  function confirmCancel(reasonCategory: CustomerCancellationReason) {
    cancelTrip.mutate(reasonCategory, {
      onSuccess: () => {
        setCancelling(false);
        toast.showSuccess(t('cancel.title'));
      },
      onError: (error) => toast.showError(errorMessage(error)),
    });
  }

  return (
    <>
      {/*
        Chặng của chuyến đi CÙNG tiêu đề màn (`AppHeader.badge`), không dẫn một thẻ riêng ở đầu
        thân màn — cùng lý do và cùng hình với màn Chi tiết yêu cầu thuê.

        Đồng thời bỏ được một câu in HAI LẦN: `subtitleOf(t, stage)` vốn vừa là dòng phụ của thanh
        đầu màn, vừa là dòng chữ ngay dưới viên nhãn trong thẻ — hai bản của cùng một câu cách nhau
        chừng 100px.
      */}
      <AppHeader
        title={trip.code ? t('detail.headingWithCode', { code: trip.code }) : t('detail.heading')}
        subtitle={subtitleOf(t, stage)}
        onBack={() => goBackOr(router, listHref)}
        badge={
          <StatusBadge
            label={domainLabel('customerTripStage', stage, meta.label)}
            color={meta.color}
            size="sm"
          />
        }
      />
      <Screen edges={['left', 'right', 'bottom']} refreshing={refreshing} onRefresh={onRefresh}>
        <YStack gap={layout.section}>
          {/*
            Thẻ còn đúng việc của nó: vẽ chuyến đang ở chặng nào trên cả hành trình.

            Hỏi `visible` ở ĐÂY chứ không để `TripTimeline` tự trả `null`: chặng đầu (chờ chủ xe
            xác nhận) không có dải nào để vẽ, và một cái thẻ rỗng thì vẫn chiếm chỗ — người dùng
            nhìn thấy đúng một hộp trắng trống ngay dưới thanh đầu màn (bắt trên máy 24/09/2026).
            Chặng đó đã có `StageNotice` ngay dưới nói rõ đang chờ gì.
          */}
          {customerTripTimeline(stage).visible ? (
            <Card>
              <TripTimeline stage={stage} />
            </Card>
          ) : null}

          {/*
            Chuyến ĐÃ KHÉP của khách: thẻ trạng thái kết cục của web `TripClosedView` (Figma
            `21621:68041` · `21621:67556`) — cùng câu chữ `Trips.closed.status`. Chủ xe giữ khối cũ.
          */}
          {!isHost && closedNotice(stage) ? (
            <ClosedStageNotice trip={trip} stage={stage} />
          ) : (
            <StageNotice stage={stage} rejectReason={trip.rejectReason} />
          )}

          {/*
            Chuyến ĐANG DIỄN RA — thẻ trạng thái của web `TripActiveView` (cùng khuôn với thẻ kết cục
            ở trên): nhãn chặng, "Hành trình đang diễn ra", lời dặn và giờ trả xe dự kiến — câu trả
            lời cho việc duy nhất khách mở màn này lúc đang thuê. Chủ xe giữ khối nổi bật cũ.
          */}
          {stage === CUSTOMER_TRIP_STAGE.ACTIVE ? (
            isHost ? (
              trip.returnAt ? (
                <Card tone="accent">
                  <YStack gap={space.xs}>
                    <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
                      {t('detail.activeTitle')}
                    </Text>
                    <XStack ai="center" gap={space.xs} flexWrap="wrap">
                      <Ionicons
                        name="time-outline"
                        size={iconSize.sm}
                        color={colors.primaryActive}
                      />
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
              ) : null
            ) : (
              <ActiveStageNotice trip={trip} stage={stage} />
            )
          ) : null}

          <VehicleBlock trip={trip} />
          <ShopBlock trip={trip} highlightShop={!isHost} />

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

          {/*
            THỨ TỰ KHỐI = thứ tự web xếp ở khổ một cột (≤1024px): cột CHÍNH (tóm tắt → giữ chỗ →
            mốc thực tế → bằng chứng bàn giao → ghi chú → đánh giá) rồi cột PHỤ (thu cọc trực tiếp
            → tiền → quyết định của chủ xe → hỗ trợ/huỷ của khách).

            Khoản GIỮ CHỖ đứng ngay sau tóm tắt: khi chuyến đang chờ tiền thì đây là việc DUY
            NHẤT khách cần làm, và nó không được nằm dưới một bảng số liệu mà họ chưa có lý do để
            đọc.
          */}
          <TripGatewayNotice
            gateway={gateway}
            holdAwaitingPayment={
              trip.hold ? isAwaitingPayment(trip.hold.status as BookingHoldStatus) : false
            }
          />

          {trip.hold ? (
            <TripHoldPanel
              hold={trip.hold}
              tripId={trip.id}
              tripTotalAmount={trip.estimate?.fees?.customerTotalAmount ?? null}
              payAtHandoverAmount={trip.estimate?.fees?.payAtPickupAmount ?? null}
            />
          ) : null}

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

          {/*
            Bằng chứng bàn giao đứng NGAY SAU mốc thực tế — hai khối trả lời cùng một câu hỏi
            ("chuyến đã diễn ra thế nào"). Chỉ gọi API khi chuyến ĐÃ có mốc bàn giao thật, đúng
            điều kiện web: `actualPickupAt`/`actualReturnAt` do chính lần xác nhận bàn giao ghi
            (cùng transaction), nên "chưa có mốc nào" đồng nghĩa "chưa có biên bản nào".
          */}
          <TripHandoverEvidence
            tripId={trip.id}
            enabled={Boolean(trip.actualPickupAt || trip.actualReturnAt)}
          />

          {/*
            Chuyến ĐÃ KHÉP của khách: thẻ "Thông tin người thuê" của web `TripClosedView` — liên hệ
            khách để lại cho CHÍNH chuyến này + lời nhắn cho chủ xe. Các chặng khác giữ khối ghi chú.
          */}
          {!isHost && (closed || stage === CUSTOMER_TRIP_STAGE.ACTIVE) ? (
            <RenterBlock trip={trip} />
          ) : /* Ghi chú khách gửi kèm yêu cầu — web có khối này, và nó là chữ của chính họ. */
          trip.customerNote ? (
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
                <XStack ai="center" gap={space.sm} flexWrap="wrap">
                  <Stars value={trip.review.rating} size={iconSize.sm} />
                  {trip.review.editedAt ? (
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t('review.edited')}
                    </Text>
                  ) : null}
                </XStack>
                {trip.review.comment ? (
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {trip.review.comment}
                  </Text>
                ) : null}
                {trip.review.canEdit ? (
                  <YStack gap={space.xs} ai="flex-start">
                    <Button
                      label={t('review.edit')}
                      icon="create-outline"
                      variant="ghost"
                      onPress={() => setEditingReview(true)}
                    />
                    <Text col={colors.textMuted} fos={fontSize.bodySm}>
                      {t('review.editHint')}
                    </Text>
                  </YStack>
                ) : null}
              </YStack>
            </Card>
          ) : null}

          {/*
            Đơn KHÔNG đi qua khoản giữ chỗ của XePrime (tuyến gói tắt công tắc thu cọc — Phase 6).
            Khách phải được nói thẳng giới hạn bảo vệ TRƯỚC khi họ chuyển tiền cho ai đó ngoài nền
            tảng (ADR 0028 điều 9), chứ không phát hiện ra lúc có tranh chấp.
          */}
          {trip.depositCollectionMode === DEPOSIT_COLLECTION_MODE.DIRECT ? (
            <Callout tone="info" title={t('detail.directDeposit.title')}>
              {t('detail.directDeposit.body')}
            </Callout>
          ) : null}

          {/*
            Ba nguồn tiền, loại trừ nhau theo đúng thứ tự web đặt:
              · có đơn      → số ĐÃ ĐÓNG BĂNG (ADR 0024);
              · chưa có đơn → bảng kê TẠM TÍNH, đúng những dòng khách đã đọc lúc đặt;
              · không báo giá được (xe thiếu giá, dài hạn chưa chốt gói) → nói thẳng là chưa có.
            Không bao giờ có hai khối cùng lúc, nên không ai phải chọn giữa hai con số.
          */}
          {trip.finance ? (
            <TripFinanceCard finance={trip.finance} closed={closed} />
          ) : trip.estimate ? (
            /* Đã trả khoản giữ chỗ ⇒ con số đã ĐÓNG BĂNG, không còn là tạm tính (ADR 0039). */
            <TripEstimateCard
              estimate={trip.estimate}
              isHost={isHost}
              settled={trip.hold?.paidAt != null}
            />
          ) : (
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

          {/*
            Cụm quyết định của CHỦ XE — component riêng vì nó cầm ba mutation và bốn tấm trượt, và
            người đi thuê thì không có gì để quyết định ở đây. Thiếu nó, một chủ xe mở chuyến đã
            nhận tiền giữ chỗ của khách không có đường nào duyệt hay từ chối ngay tại chỗ.

            Cổng đọc CHẶNG, không đọc `respondBy`. Từ ADR 0044, `respondBy` vẫn còn nguyên SAU khi
            chủ xe đã nhận chuyến — hỏi nó là bày nút "Duyệt" cho một chuyến đã duyệt rồi, và cú
            chạm đó chỉ trả về một lỗi khó hiểu.
          */}
          {isHost && canHostDecideTrip(stage) ? (
            <TripHostDecisions trip={trip} onApproved={setApproved} />
          ) : null}

          {/*
            Cụm hỗ trợ + huỷ là của KHÁCH — đúng như web (`isHost ? null : …`). Chủ xe nhìn vào đó
            sẽ thấy lối liên hệ với chính mình, và `POST /trips/:id/cancel` khoá theo
            `customerUserId` nên nút Huỷ ở phía chủ xe luôn nhận 404. Chủ xe huỷ ở chi tiết đơn thuê.
          */}
          {isHost ? null : (
            <TripActions
              trip={trip}
              stage={stage}
              onCancel={() => setCancelling(true)}
              onReview={() => setReviewing(true)}
            />
          )}
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
      {trip.review?.canEdit ? (
        <ReviewSheet
          open={editingReview}
          onClose={() => setEditingReview(false)}
          trip={trip}
          mode="edit"
        />
      ) : null}

      {/*
        Tấm kết quả duyệt đứng NGOÀI cổng `canHostDecideTrip` — xem docblock của `approved`.
        Dựng có điều kiện để một màn của KHÁCH không mang theo nó.
      */}
      {approved ? (
        <ApproveSuccessSheet request={approved} onClose={() => setApproved(null)} />
      ) : null}
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
 * CẢ THẺ mở trang gian hàng thay cho liên kết "Xem gian hàng →" của web — cùng đích, nhưng
 * đích chạm là cả khối chứ không phải một dòng chữ 12px. Mũi tên ở mép phải giữ lại lời hứa
 * "bấm được" mà một liên kết gạch chân trên web nói bằng màu.
 */
function ShopBlock({
  trip,
  highlightShop,
}: {
  trip: CustomerTripDetail;
  /**
   * Phía KHÁCH: ảnh thật (`shop.avatarUrl`) + nhãn "Gian hàng"/"Chủ xe", và GIAN HÀNG nổi hơn chủ xe
   * cá nhân (dấu xác minh, tên vàng) — cùng cách kể với thẻ chuyến ở danh sách (`TripHost`) và thẻ
   * chủ xe của web `TripRequestTripCard`. Chủ xe xem chuyến của chính mình thì giữ khối cũ.
   */
  highlightShop: boolean;
}) {
  const t = useTranslations('Trips.detail');
  const tCard = useTranslations('Listings.card');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { shop } = trip;

  /*
   * Chủ xe cá nhân tuyến hoa hồng KHÔNG có mặt tiền kiểu doanh nghiệp (ADR 0028/0040) — mời khách
   * "Xem gian hàng" một người không bán qua gian hàng là nói sai. Cùng phép suy
   * `resolveStorefrontKind` với trang gian hàng công khai; cả hai nhãn cùng trỏ một địa chỉ vì
   * trang đó tự vẽ đúng mặt tiền theo tuyến (ADR 0038 điều 1).
   */
  const isShop = shop.shopKind === STOREFRONT_KIND.SHOP;
  const openLabel = isShop ? t('viewShop') : t('viewOwner');
  const verifiedLabel = highlightShop && isShop ? tCard('shopVerified') : undefined;

  return (
    <Card
      onPress={() => navigateOnce(ROUTES.explore.shopDetail(shop.slug))}
      accessibilityLabel={openLabel}
    >
      <XStack ai="center" gap={space.sm}>
        <Avatar
          name={shop.name}
          url={highlightShop ? (shop.avatarUrl ?? null) : null}
          size={40}
          verifiedLabel={verifiedLabel}
        />
        <YStack f={1} gap={2}>
          {highlightShop ? (
            <Text
              col={isShop ? colors.text : colors.placeholder}
              fos={fontSize.label}
              fow={isShop ? fontWeight.semibold : fontWeight.regular}
            >
              {tCard(isShop ? 'shop' : 'owner')}
            </Text>
          ) : null}
          {highlightShop ? (
            <VerifiedName
              name={shop.name}
              verifiedLabel={verifiedLabel}
              color={isShop ? colors.primaryActive : colors.text}
              weight={isShop ? fontWeight.bold : fontWeight.semibold}
              markSize={15}
              decorativeMark
            />
          ) : (
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} numberOfLines={1}>
              {shop.name}
            </Text>
          )}
          {/* `?? 0`: dữ liệu cũ chưa qua đợt tính rating vẫn có thể thiếu cột này ở DB. */}
          {(shop.ratingCount ?? 0) > 0 ? (
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
        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.placeholder} />
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
  const tDetail = useTranslations('Trips.detail');
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
        {/*
          NHÃN đứng trước giá trị — cùng hàng nhãn/giá trị với các mốc giờ ngay trên, đúng như web
          xếp nó vào bảng lịch trình. Thiếu nhãn thì "Giao tận nơi" đứng trần giữa hai mốc giờ và
          người đọc phải tự suy nó đang trả lời câu hỏi nào.
        */}
        <Text col={colors.textMuted} fos={fontSize.label}>
          {tDetail('pickupMethodLabel')}
        </Text>
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
 * Hành động của khách — nơi gọi CHỈ dựng khối này khi `!isHost`, đúng như web.
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
  const tSupport = useTranslations('Trips.closed.support');
  const navigateOnce = useNavigateOnce();
  const phone = trip.shop.phone;

  const canCancel = canCustomerCancelTrip(stage);

  /*
   * Chuyến ĐÃ KHÉP và ĐANG THUÊ — khối "Cần hỗ trợ?" của web `TripClosedView` / `TripActiveView`:
   * nhắn chủ xe/gian hàng (kênh chat trong sàn mở cho mọi khách đã gửi yêu cầu, không theo
   * `canContact`), gọi khi đã mở liên hệ, đánh giá khi còn được, và lối sang trung tâm hỗ trợ XePrime
   * (nơi có hotline). Đơn đang thuê không huỷ được (ADR 0045 điều 1) nên khối này không có nút huỷ.
   */
  if (isCustomerTripClosed(stage) || stage === CUSTOMER_TRIP_STAGE.ACTIVE) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
            {tSupport('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {tSupport('body')}
          </Text>
          {trip.canReview ? (
            <Button label={t('review')} icon="star-outline" onPress={onReview} />
          ) : null}
          {canShowHostChatOnTrip({ shopKind: trip.shop.shopKind, hasBooking: Boolean(trip.code) }) ? (
            <ChatWithShopButton vehicleId={trip.vehicle.id} label={tSupport('chatOwner')} />
          ) : null}
          {trip.canContact && phone ? (
            <Button
              label={t('call')}
              variant="secondary"
              icon="call-outline"
              onPress={() => void Linking.openURL(`tel:${phone}`)}
            />
          ) : null}
          <Button
            label={tSupport('contactXePrime')}
            variant="secondary"
            icon="headset-outline"
            onPress={() => navigateOnce(ROUTES.support.home())}
          />
        </YStack>
      </Card>
    );
  }

  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        {/*
          Kênh liên hệ chỉ mở SAU khi chủ xe duyệt — server quyết bằng `canContact`.

          Trên tuyến hoa hồng, một yêu cầu gửi rồi tự huỷ không được phép trở thành cách lấy số
          của gian hàng rồi chốt ngoài sàn (ADR 0028 điều 9). Chưa duyệt thì NÓI RA lý do chứ
          không giấu nút đi: một khối biến mất không giải thích gì trông như lỗi. Cùng cách web
          dựng khối này.
        */}
        {/* Nhắn tin theo `canShowHostChatOnTrip` (gian hàng: mọi chặng); gọi điện vẫn theo `canContact`. */}
        {canShowHostChatOnTrip({ shopKind: trip.shop.shopKind, hasBooking: Boolean(trip.code) }) && !trip.canContact ? (
          <ChatWithShopButton vehicleId={trip.vehicle.id} label={t('contactShop')} />
        ) : null}
        {trip.canContact ? (
          <>
            <ChatWithShopButton vehicleId={trip.vehicle.id} label={t('contactShop')} />
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
          </>
        ) : (
          <Callout>{t('contactLocked')}</Callout>
        )}
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

/**
 * Thẻ trạng thái của chuyến ĐÃ KHÉP phía khách — bản native của `TripRequestStatusCard` trong
 * `TripClosedView` (web): biểu tượng + nhãn chặng + tiêu đề + lời giải thích, và "Lý do: …" của
 * chuyến bị từ chối (chữ của chủ xe, không dịch). Chuyến hoàn thành không còn gì để đánh giá thì bỏ
 * lời mời đánh giá.
 */
function ClosedStageNotice({
  trip,
  stage,
}: {
  trip: CustomerTripDetail;
  stage: CustomerTripStage;
}) {
  const t = useTranslations('Trips.closed.status');
  const tTrips = useTranslations('Trips');
  const domainLabel = useDomainLabel();
  const notice = closedNotice(stage);
  // Ai đã huỷ (web `TripClosedView`) — không rõ thì giữ tiêu đề chung.
  const cancelledBy =
    stage === CUSTOMER_TRIP_STAGE.CANCELLED && isCancellationParty(trip.cancelledBy)
      ? trip.cancelledBy
      : null;
  // Lý do huỷ từ sổ huỷ (web `TripClosedView`): khách tự huỷ ⇒ đúng chữ khách đã chọn.
  const recordedReason = trip.cancelReason?.category;
  const reasonCategory =
    cancelledBy && isCancellationReasonCategory(recordedReason) ? recordedReason : null;
  const reasonLabel = !reasonCategory
    ? null
    : cancelledBy === CANCELLATION_PARTY.CUSTOMER &&
        (CUSTOMER_CANCELLATION_REASON_VALUES as readonly string[]).includes(reasonCategory)
      ? tTrips(`cancel.reasons.${reasonCategory as CustomerCancellationReason}`)
      : domainLabel('cancellationReasonCategory', reasonCategory);
  if (!notice) return null;

  const skin =
    notice.tone === 'success'
      ? { bg: colors.successSurface, fg: colors.success, icon: 'checkmark-circle' as const }
      : notice.tone === 'danger'
        ? { bg: colors.dangerSurface, fg: colors.danger, icon: 'close-circle' as const }
        : { bg: colors.warningSurface, fg: colors.warning, icon: 'alert-circle' as const };
  const body =
    notice.bodyKey === 'completedBody' && !trip.canReview && !trip.review
      ? t('completedBodyNoReview')
      : t(notice.bodyKey);
  const meta = CUSTOMER_TRIP_STAGE_META[stage];

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
      <Ionicons name={skin.icon} size={iconSize.lg} color={skin.fg} />
      <YStack f={1} gap={space.xs} ai="flex-start">
        <StatusBadge
          label={domainLabel('customerTripStage', stage, meta.label)}
          color={meta.color}
          size="sm"
        />
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
          {cancelledBy ? tTrips(`cancelledBy.${cancelledBy}`) : t(notice.titleKey)}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {body}
        </Text>
        {stage === CUSTOMER_TRIP_STAGE.REJECTED && trip.rejectReason ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t.rich('reason', {
              reason: trip.rejectReason,
              b: (chunks) => (
                <Text col={colors.text} fow={fontWeight.semibold}>
                  {chunks}
                </Text>
              ),
            })}
          </Text>
        ) : null}
        {reasonLabel ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t.rich('reason', {
              reason: reasonLabel,
              b: (chunks) => (
                <Text col={colors.text} fow={fontWeight.semibold}>
                  {chunks}
                </Text>
              ),
            })}
          </Text>
        ) : null}
      </YStack>
    </XStack>
  );
}

/**
 * Thẻ trạng thái của chuyến ĐANG THUÊ phía khách — bản native của thẻ trạng thái trong web
 * `TripActiveView`: biểu tượng xe + nhãn chặng + "Hành trình đang diễn ra" + lời dặn, và hàng giờ trả
 * xe dự kiến nền trắng. Sắc xanh dương "đang diễn ra" (khác xanh lá "đã xong").
 */
function ActiveStageNotice({
  trip,
  stage,
}: {
  trip: CustomerTripDetail;
  stage: CustomerTripStage;
}) {
  const t = useTranslations('Trips.detail');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const meta = CUSTOMER_TRIP_STAGE_META[stage];

  return (
    <XStack
      ai="flex-start"
      gap={space.sm}
      bg={colors.infoSurface}
      bw={1}
      bc={colors.info}
      p={space.md}
      br={radius.md}
    >
      <Ionicons name="car-sport" size={iconSize.lg} color={colors.info} />
      <YStack f={1} gap={space.xs} ai="flex-start">
        <StatusBadge
          label={domainLabel('customerTripStage', stage, meta.label)}
          color={meta.color}
          size="sm"
        />
        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
          {t('activeTitle')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('activeNote')}
        </Text>
        {trip.returnAt ? (
          <XStack
            alignSelf="stretch"
            ai="center"
            gap={space.xs}
            flexWrap="wrap"
            bg={colors.surface}
            br={radius.sm}
            px={space.sm}
            py={space.xs}
          >
            <Ionicons name="time-outline" size={iconSize.sm} color={colors.info} />
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('activeReturn')}
            </Text>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.bold}>
              {fmt.rentalPoint(dayjs(trip.returnAt))}
            </Text>
          </XStack>
        ) : null}
      </YStack>
    </XStack>
  );
}

/**
 * "Thông tin người thuê" chỉ-đọc — bản native của `TripRequestRenterCard` (web): liên hệ khách để
 * lại cho CHÍNH chuyến này (`contact`, có thể là người nhà được thuê hộ), email tài khoản, và lời
 * nhắn cho chủ xe ("—" khi trống, như web).
 */
function RenterBlock({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('BookingRequests.flow.reviewPage.renter');
  const tView = useTranslations('Trips.requestView');
  const me = useCurrentUser().data ?? null;
  const contact = trip.contact ?? null;
  return (
    <Card>
      <YStack gap={space.sm}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {t('title')}
        </Text>
        <DataRow label={t('name')} value={contact?.name ?? me?.displayName ?? '—'} />
        <DataRow label={t('phone')} value={contact?.phone ?? me?.phone ?? '—'} />
        {me?.email ? <DataRow label={t('email')} value={me.email} /> : null}
        <YStack gap={space.xs}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {tView('noteLabel')}
          </Text>
          <Text col={colors.text} fos={fontSize.bodySm}>
            {trip.customerNote?.trim() || '—'}
          </Text>
        </YStack>
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

  /* Bảng chặng → khối giải thích là hàm THUẦN (`stage-notice.ts`) để test được từng chặng. */
  const notice = stageNotice(stage);

  if (!notice) return null;

  /*
   * Lý do TỪ CHỐI do chủ xe tự gõ — giữ nguyên chữ của họ, không có bản dịch nào cho câu đó.
   * Đây là chỗ DUY NHẤT nội dung không đến từ bó message, nên nó nằm ngoài bảng tra.
   */
  const body = notice.bodyKey === 'rejectedBody' && rejectReason ? rejectReason : t(notice.bodyKey);

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
          {t(notice.titleKey)}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {body}
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
/**
 * Chặng → KHOÁ message của câu phụ đề.
 *
 * Bảng tra LITERAL chứ không `switch` có nhánh mặc định. Bản trước dùng `switch`, và nhánh mặc
 * định nuốt đúng hai chặng của ADR 0039: chuyến đang chờ tiền giữ chỗ và chuyến ĐÃ TRẢ tiền chờ
 * chủ xe duyệt đều hiện "Chuyến đi đã kết thúc sớm" — một câu sai hoàn toàn, nói với người vừa
 * chuyển tiền rằng chuyến của họ đã hỏng.
 *
 * `satisfies Record<CustomerTripStage, …>` khiến chặng mới là lỗi BIÊN DỊCH, không phải một câu
 * sai lặng lẽ; `as const` giữ kiểu literal để `t()` vẫn kiểm được khoá.
 */
const SUBTITLE_KEY = {
  [CUSTOMER_TRIP_STAGE.PENDING_APPROVAL]: 'subtitle.pending_approval',
  [CUSTOMER_TRIP_STAGE.AWAITING_HOLD]: 'subtitle.awaiting_hold',
  [CUSTOMER_TRIP_STAGE.PENDING_APPROVAL_PAID]: 'subtitle.pending_approval_paid',
  [CUSTOMER_TRIP_STAGE.READY]: 'subtitle.ready',
  [CUSTOMER_TRIP_STAGE.ACTIVE]: 'subtitle.active',
  [CUSTOMER_TRIP_STAGE.COMPLETED]: 'subtitle.completed',
  [CUSTOMER_TRIP_STAGE.SLOT_TAKEN]: 'subtitle.slot_taken',
  /*
    `expired` có câu RIÊNG, không dùng chung `subtitle.terminal` với `cancelled`/`rejected`.
    Chặng này vừa tách khỏi `rejected` (07/10/2026) đúng vì gộp lại là nói sai với khách: không
    ai từ chối họ, chỉ là hết hạn trả lời. Dồn về "đã kết thúc sớm" là lặp lại chính lỗi đó.
  */
  [CUSTOMER_TRIP_STAGE.EXPIRED]: 'subtitle.expired',
  [CUSTOMER_TRIP_STAGE.CANCELLED]: 'subtitle.terminal',
  [CUSTOMER_TRIP_STAGE.REJECTED]: 'subtitle.terminal',
  [CUSTOMER_TRIP_STAGE.NO_SHOW]: 'subtitle.terminal',
} as const satisfies Record<CustomerTripStage, string>;

function subtitleOf(
  t: ReturnType<typeof useTranslations<'Trips'>>,
  stage: CustomerTripStage,
): string {
  return t(SUBTITLE_KEY[stage]);
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
