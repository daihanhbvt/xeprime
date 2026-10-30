import { Ionicons } from '@expo/vector-icons';
import { useRef, useState, type RefObject } from 'react';
import { Pressable, View, type ScrollView } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_HOLD_STATUS,
  DEPOSIT_COLLECTION_MODE,
  HOLD_COUNTDOWN_URGENT_MINUTES,
  holdRemainingMs,
  isAwaitingPayment,
  type BookingHoldStatus,
  type PublicListingDetail,
} from '@xeprime/types';
import { payAtPickupAmount } from '@xeprime/domain';
import { images } from '@/assets';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CheckMark } from '@/components/ui/CheckMark';
import { Countdown } from '@/components/ui/Countdown';
import { InfoHint } from '@/components/ui/InfoHint';
import { RespondDeadline } from '@/features/booking-requests/components/RespondDeadline';
import { useListing } from '@/features/marketplace/hooks/use-marketplace-data';
import { useLegalLinkChunks } from '@/features/legal/use-legal-link-chunks';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useNow } from '@/hooks/use-now';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { mixHex } from '@/theme/color-mix';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, market, radius, sizing, space } from '@/theme/tokens';
import { usePickupChecklist } from '@/lib/pickup-checklist-memory';
import type { CustomerTripDetail } from '../api';
import { useFreeCancelNote } from '../use-free-cancel-note';
import {
  canStartHoldPayment,
  hasHoldStage,
  pickupChecklistItems,
  type PickupChecklistItem,
} from '../trip-flow';
import { FreeCancelCountdown } from './FreeCancelCountdown';
import { TripDriverCard } from './TripDriverCard';
import { TripFinanceCard } from './TripFinanceCard';
import { TripNotReceivedReport } from './TripNotReceivedReport';
import { TripOwnerActions } from './TripOutcomeViews';
import { TripHoldPanel } from './TripHoldPanel';
import {
  CardLead,
  CardTitle,
  TripCostsCard,
  TripPlanChangeCard,
  TripPriceEmptyCard,
  TripRequestProgress,
  TripRequestRenterCard,
  TripRequestStatusCard,
  TripRequestTripCard,
  TripRequirementsCard,
} from './TripRequestCards';

type Hold = NonNullable<CustomerTripDetail['hold']>;

/**
 * Ba màn chuyến của KHÁCH theo design v2 (web PR #207): chờ chủ xe phản hồi · đã được nhận, chờ giữ
 * chỗ · đã xác nhận, chờ ngày nhận xe. Web xếp hai cột (Figma chỉ có khung PC); điện thoại xếp MỘT
 * cột theo đúng thứ tự web: thẻ trạng thái → chuyến → tiến trình → người thuê → giấy tờ, rồi các
 * thẻ của cột phải.
 *
 * Mọi ranh giới nghiệp vụ do SERVER quyết — các màn này chỉ đọc. Nút huỷ mở `CancelTripSheet` của
 * màn cha (`onCancel`), cùng một tấm cho mọi chặng.
 */
interface FlowViewProps {
  trip: CustomerTripDetail;
  onCancel: () => void;
  /** `ScrollView` của màn cha — lối "Xem hướng dẫn nhận xe" cuộn tới checklist. */
  scrollRef?: RefObject<ScrollView | null>;
}

/**
 * Tin đăng của xe: điểm nhận xe, điều khoản thuê, hình thức cọc — chuyến không chép những thứ đó
 * lúc gửi. Tin đã ẩn/gỡ (404) thì các thẻ tự rơi về dữ liệu của chính chuyến.
 */
function useTripListing(trip: CustomerTripDetail): PublicListingDetail | null {
  return useListing(trip.vehicle.id).data ?? null;
}

/** Bảng kê TẠM TÍNH của chuyến — `tripEstimateBreakdown` web. */
function estimateCostsProps(trip: CustomerTripDetail) {
  const estimate = trip.estimate ?? null;
  return estimate
    ? {
        rows: estimate.rows,
        totalAmount: estimate.rentalTotal,
        depositAmount: estimate.depositAmount,
        fees: estimate.fees ?? null,
        estimateNote: estimate.estimateNote ?? null,
      }
    : null;
}

/** Thông báo thu cọc trực tiếp — giới hạn bảo vệ nói trước khi chuyển tiền ngoài sàn (ADR 0028 điều 9). */
function DirectDepositNotice({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.detail.directDeposit');
  return trip.depositCollectionMode === DEPOSIT_COLLECTION_MODE.DIRECT ? (
    <Callout tone="info" title={t('title')}>
      {t('body')}
    </Callout>
  ) : null;
}

/**
 * Chờ chủ xe phản hồi — Figma `19727:60694`.
 *
 * Yêu cầu chờ duyệt KHÔNG giữ lịch, KHÔNG thu tiền (ADR 0044 điều 1). Nhắn tin KHÔNG theo
 * `canContact` (cờ đó gác SĐT/biển số — ADR 0056); kênh chat trong sàn mở cho mọi khách đã gửi yêu
 * cầu (`ChatService.canCustomerOpenChat`).
 */
export function TripPendingApprovalView({ trip }: FlowViewProps) {
  const colors = useColors();
  const t = useTranslations('Trips.pending');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const listing = useTripListing(trip);
  const costs = estimateCostsProps(trip);
  const holdStage = hasHoldStage(costs);

  return (
    <YStack gap={space.md}>
      <TripRequestStatusCard
        image={images.tripRequestSent}
        tag={dl('customerTripStage', trip.stage)}
        tone="warning"
        title={t('status.title')}
        body={
          // Hạn ĐỘNG theo khoảng cách tới giờ nhận (ADR 0066) — đọc mốc server đã lưu.
          trip.respondBy
            ? t('status.body', { time: fmt.dateTime(trip.respondBy) })
            : t('status.bodyNoDeadline')
        }
      >
        {/* Hạn phản hồi là mốc của SERVER (`respond_by`); đồng hồ chỉ đếm xuống tới nó. */}
        {trip.respondBy ? <RespondDeadline respondBy={trip.respondBy} /> : null}
        {/* Thiếu câu này, "đã được tiếp nhận" đọc như "đã đặt được xe". */}
        {/* = web `.guidance`: hộp nền vàng nhạt, chữ cam cảnh báo. */}
        <Text
          px={space.md}
          py={space.sm}
          br={radius.control}
          bg={colors.primarySubtle}
          col={colors.warning}
          fos={fontSize.body}
        >
          {holdStage ? t('status.guidanceHold') : t('status.guidance')}
        </Text>
      </TripRequestStatusCard>

      <TripRequestTripCard trip={trip} listing={listing} ownerAction={<TripOwnerActions trip={trip} />} />
      <TripRequestProgress current="response" hasHoldStage={holdStage} />
      <TripRequestRenterCard trip={trip} />
      <TripRequirementsCard trip={trip} listing={listing} />

      {/* Không báo giá được ⇒ nói thẳng là chưa có số; giá chính thức có lúc chủ xe xác nhận. */}
      {costs ? (
        <TripCostsCard
          {...costs}
          listing={listing}
          isDelivery={trip.deliveryRequested}
          holdTag={{ tone: 'primary', label: t('costs.holdTag') }}
        />
      ) : (
        <TripPriceEmptyCard />
      )}

      <TripPlanChangeCard trip={trip} body={t('policyBody')} />
    </YStack>
  );
}

/**
 * Đã được chủ xe nhận, chờ khách trả tiền giữ chỗ — Figma `19737:23904`.
 *
 * `awaiting_hold` = ĐÃ được nhận, đã chiếm lịch, chờ khách trả (ADR 0044). Đơn thuê ra đời DUY NHẤT
 * khi đối soát xác nhận đủ tiền — nút chỉ DẪN sang màn thanh toán. Khoản đã khép (hết hạn, huỷ, có
 * hoàn) mà chặng chưa kịp đổi ⇒ khối kết cục của `TripHoldPanel`, không phải một nút trả tiền chết.
 */
export function TripAwaitingHoldView({ trip }: FlowViewProps) {
  const t = useTranslations('Trips.awaitingHold');
  const dl = useDomainLabel();
  const fmt = useAppFormat();
  const listing = useTripListing(trip);
  const costs = estimateCostsProps(trip);

  const hold = trip.hold ?? null;
  const awaitingHold = hold && isAwaitingPayment(hold.status as BookingHoldStatus) ? hold : null;
  const fees = trip.estimate?.fees ?? null;

  /*
   * Hai chặng của lượt huỷ: CHƯA trả đủ (hoàn đủ phần đã chuyển) và SAU khi trả (huỷ miễn phí tới
   * mốc nào — hoặc không có — và huỷ muộn thì mất gì). ADR 0032 điều 5 · ADR 0064; như web.
   */
  const freeCancelNote = useFreeCancelNote();
  const policyBody = awaitingHold
    ? t('policy.afterPaid', { note: freeCancelNote(awaitingHold) })
    : t('policy.bodyClosed');

  return (
    <YStack gap={space.md}>
      <TripRequestStatusCard
        tag={dl('customerTripStage', trip.stage)}
        tone="success"
        title={t('status.title')}
        body={
          awaitingHold
            ? t('status.body', {
                owner: trip.shop.name,
                time: fmt.dateTime(awaitingHold.expiresAt),
              })
            : t('status.bodyClosed', { owner: trip.shop.name })
        }
      />

      {/* Việc chính (`priority` web) đứng ngay dưới thẻ trạng thái: khoản giữ chỗ cần thực hiện. */}
      {awaitingHold ? (
        <HoldPaymentCard
          tripId={trip.id}
          hold={awaitingHold}
          payAtPickup={payAtPickupAmount(fees)}
        />
      ) : hold ? (
        <TripHoldPanel
          hold={hold}
          tripId={trip.id}
          tripTotalAmount={fees?.customerTotalAmount ?? null}
          payAtHandoverAmount={fees?.payAtPickupAmount ?? null}
        />
      ) : null}

      <TripRequestTripCard trip={trip} listing={listing} ownerAction={<TripOwnerActions trip={trip} />} />
      {/*
        Chặng này CHẮC CHẮN có khoản giữ chỗ (không thu thì đơn ra đời ngay lúc duyệt — ADR 0044 điều
        4). Bảng kê thiếu `holdAmount` không được xoá mất chính mốc khách đang đứng.
      */}
      <TripRequestProgress current="hold" hasHoldStage={hasHoldStage(costs) || hold != null} />
      <TripRequestRenterCard trip={trip} />
      <TripRequirementsCard trip={trip} listing={listing} />

      {/* Số ở đây là số ĐÃ CHỐT lúc chủ xe nhận chuyến (snapshot trên khoản giữ chỗ — ADR 0024). */}
      {costs ? (
        <TripCostsCard
          {...costs}
          listing={listing}
          isDelivery={trip.deliveryRequested}
          frozen
          holdTag={awaitingHold ? { tone: 'info', label: t('costs.holdTag') } : null}
        />
      ) : (
        <TripPriceEmptyCard />
      )}

      <TripPlanChangeCard trip={trip} body={policyBody} />
    </YStack>
  );
}

/**
 * "Khoản giữ chỗ cần thực hiện" — Figma `19759:19943`: phải trả bao nhiêu (còn thiếu bao nhiêu nếu
 * đã chuyển một phần), trước khi nào, trả ở đâu.
 *
 * ⚠️ "Tiền giữ chỗ" KHÁC "cọc thế chấp khi nhận xe" (ADR 0044 điều 9) — dấu "i" nói rõ khác biệt.
 *
 * Ô xác nhận chính sách là cổng CỦA GIAO DIỆN trước khi rời sang màn thanh toán; nó không ghi gì
 * lên server. Mỗi lần mở màn là một lần xác nhận mới — không lưu.
 */
export function HoldPaymentCard({
  tripId,
  hold,
  payAtPickup,
}: {
  tripId: string;
  hold: Hold;
  /** B − D — `null` khi chuyến không kèm bảng kê. */
  payAtPickup: string | null;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.awaitingHold.pay');
  const tHold = useTranslations('Trips.hold');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const legalChunks = useLegalLinkChunks();
  const [acknowledged, setAcknowledged] = useState(false);

  /*
   * Cùng nhịp với đồng hồ ngay dưới số tiền, để nút khoá đúng lúc đồng hồ báo hết hạn. Hết giờ thì
   * KHÔNG mời trả nữa: tiền về sau `expires_at` không tạo đơn (ADR 0044 điều 7).
   */
  const now = useNow();
  const expired = holdRemainingMs(hold.expiresAt, new Date(now)) <= 0;
  const underpaid = hold.status === BOOKING_HOLD_STATUS.UNDERPAID;
  // Còn thiếu = số phải chuyển − số đã nhận (server kẹp sàn 0) — đúng số nút sẽ mời trả.
  const amount = fmt.money(hold.remainingAmount);
  const canPay = canStartHoldPayment(acknowledged, expired);

  return (
    <Card borderColor={mixHex(colors.primary, colors.surface, 0.55)}>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.xs}>
          {/* Tiêu đề co giãn (`minWidth 0`) để dấu (i) không bị đẩy tràn khỏi thẻ trên máy hẹp. */}
          <YStack f={1} minWidth={0}>
            <CardTitle icon="wallet-outline">{t('title')}</CardTitle>
          </YStack>
          <InfoHint content={tHold('vsDepositHint')} label={tHold('vsDepositHintLabel')} />
        </XStack>

        <Text col={colors.primaryHover} fos={fontSize.h3} fow={fontWeight.semibold}>
          {amount}
        </Text>
        <Countdown
          deadline={hold.expiresAt}
          urgentMs={HOLD_COUNTDOWN_URGENT_MINUTES * 60_000}
          labels={{
            remaining: tHold('countdownRemaining'),
            expired: tHold('countdownExpired'),
          }}
        />
        <FreeCancelCountdown hold={hold} />

        {underpaid ? (
          <Callout tone="warning">
            {tHold('partialIntro', { paid: fmt.money(hold.paidAmount) })}
          </Callout>
        ) : null}

        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {expired
            ? tHold('expired')
            : [
                payAtPickup ? t('body', { amount: fmt.money(payAtPickup) }) : t('bodyNoRest'),
                tHold('expires'),
              ].join(' ')}
        </Text>

        {/*
          Liên kết trong câu mở văn bản trong app (WebView) — lui về vẫn còn dấu tích vừa đánh, nên
          không cần "mở tab mới" như web.
        */}
        <Pressable
          onPress={() => setAcknowledged((value) => !value)}
          disabled={expired}
          accessibilityRole="checkbox"
          accessibilityState={{ checked: acknowledged, disabled: expired }}
        >
          <XStack ai="flex-start" gap={space.sm} minHeight={sizing.touchTarget} py={space.xs}>
            <YStack pt={2}>
              <CheckMark checked={acknowledged} />
            </YStack>
            <Text f={1} col={expired ? colors.textDisabled : colors.text} fos={fontSize.bodySm}>
              {t.rich('acknowledge', { policy: legalChunks.cancellation })}
            </Text>
          </XStack>
        </Pressable>

        {/*
          MỘT nút, không phải mã QR thứ hai — màn thanh toán là nơi duy nhất có đủ kênh trả và là nơi
          cổng quay về.
        */}
        <Button
          variant="gradient"
          // Nhãn NGẮN, không icon — "Thanh toán giữ chỗ · 260.000 đ" bị cắt mất số tiền trên Android hẹp.
          label={t('submitShort', { amount })}
          accessibilityLabel={t('submit', { amount })}
          disabled={!canPay}
          onPress={() => navigateOnce(ROUTES.booking.payment(tripId))}
        />
      </YStack>
    </Card>
  );
}

/**
 * Đã xác nhận, chờ ngày nhận xe (chặng `ready`) — Figma `19879:72913`.
 *
 * Đơn đã ra đời trong transaction đối soát (ADR 0044 điều 2); số tiền là số đóng băng của đơn (ADR
 * 0024). Bảng kê chỉ hiện khi server nói nó còn khớp số trên đơn (`finance.breakdown`) và chưa có
 * phát sinh; lệch thì thẻ tiền đầy đủ `TripFinanceCard`. Liên hệ mở theo `canContact` (ADR 0056).
 */
export function TripConfirmedView({ trip, scrollRef }: FlowViewProps) {
  const colors = useColors();
  const t = useTranslations('Trips.confirmed');
  const checklistRef = useRef<View>(null);
  function scrollToChecklist() {
    const scroll = scrollRef?.current;
    // Fabric: `measureLayout` cần một HOST ref (không nhận số node); toạ độ đo trên cây layout nên là
    // toạ độ NỘI DUNG, không phụ thuộc vị trí đang cuộn.
    const inner = scroll?.getNativeScrollRef();
    if (!scroll || !inner || !checklistRef.current) return;
    try {
      checklistRef.current.measureLayout(inner, (_x, y) =>
        scroll.scrollTo({ y: Math.max(0, y - space.md), animated: true }),
      );
    } catch {
      // Không đo được thì thôi cuộn — lối dẫn là tiện ích, không được nổ thành lỗi trước mặt khách.
    }
  }
  const fmt = useAppFormat();
  const listing = useTripListing(trip);
  const now = useNow();

  const hold = trip.hold ?? null;
  const finance = trip.finance ?? null;
  const frozen = finance && finance.surcharges.length === 0 ? (finance.breakdown ?? null) : null;

  /*
   * Lời nhắc huỷ theo MỐC ĐÃ LƯU của server (`freeCancelUntil`, ADR 0032 điều 5) — không tính lại từ
   * giờ nhận xe. Chuyến không đi qua khoản giữ chỗ thì không có mốc nào để hứa.
   */
  // `freeCancelUntil` rỗng cho tới khi tiền về đủ (ADR 0072) — chưa có mốc thì không hứa mốc nào.
  const policyBody = hold?.freeCancelUntil
    ? new Date(hold.freeCancelUntil).getTime() > now
      ? t('policy.bodyFree', { time: fmt.dateTime(hold.freeCancelUntil) })
      : t('policy.bodyAfter', { time: fmt.dateTime(hold.freeCancelUntil) })
    : t('policy.bodyNoHold');

  // Lối liên hệ cạnh tên chủ xe — `TripOwnerActions` web: nhắn theo tuyến, gọi theo `canContact`.
  const ownerAction = <TripOwnerActions trip={trip} />;

  return (
    <YStack gap={space.md}>
      <TripRequestStatusCard
        variant="confirmed"
        tag={t('status.tag')}
        tone="success"
        title={t('status.title')}
        body={t('status.body', { vehicle: trip.vehicle.name, owner: trip.shop.name })}
      >
        {/* "Xem hướng dẫn nhận xe" — web là liên kết neo `#checklist`; app cuộn tới thẻ đó. */}
        <Text
          alignSelf="flex-start"
          col={colors.primary}
          fos={fontSize.body}
          fow={fontWeight.semibold}
          accessibilityRole="link"
          onPress={scrollToChecklist}
        >
          {t('status.guide')}
        </Text>
      </TripRequestStatusCard>

      {/* Việc chính (`priority` web): "Chưa nhận được xe" (ADR 0066) · khoản hoàn khi chuyển THỪA · lời nhắc thu cọc trực tiếp. */}
      <TripNotReceivedReport trip={trip} />
      {hold?.refund ? <TripHoldPanel hold={hold} tripId={trip.id} /> : null}
      <DirectDepositNotice trip={trip} />

      <TripRequestTripCard trip={trip} listing={listing} ownerAction={ownerAction} />

      {/* Người sẽ đến đón — chuyến có tài xế (ADR 0067). Chuyến khác: khối im lặng. */}
      <TripDriverCard trip={trip} />

      <View ref={checklistRef} collapsable={false}>
        <PickupChecklist trip={trip} listing={listing} />
      </View>
      <TripRequestRenterCard trip={trip} />

      {finance && frozen ? (
        <TripCostsCard
          listing={listing}
          isDelivery={trip.deliveryRequested}
          frozen
          rows={frozen.rows}
          totalAmount={finance.rentalTotal}
          depositAmount={frozen.depositAmount}
          fees={frozen.fees ?? null}
          // Số của một đơn là số THU — không bao giờ "tạm tính" (ADR 0024).
          estimateNote={null}
          holdTag={hold?.paidAt ? { tone: 'success', label: t('costs.holdTag') } : null}
        />
      ) : finance ? (
        <TripFinanceCard finance={finance} closed={false} />
      ) : (
        <TripPriceEmptyCard />
      )}

      <TripPlanChangeCard trip={trip} body={policyBody} />
    </YStack>
  );
}

/**
 * "Checklist nhận xe" — Figma `19759:40566`. LỜI DẶN cho ngày nhận xe, không phải ô khách tự đánh
 * dấu: các mục chỉ hoàn tất ở biên bản bàn giao, nên chúng hiện chưa đánh dấu và không bấm được.
 * Luật mục nào xuất hiện ở `pickupChecklistItems` (thuần, có test).
 */
function PickupChecklist({
  trip,
  listing,
}: {
  trip: CustomerTripDetail;
  listing: PublicListingDetail | null;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.confirmed.checklist');
  const fmt = useAppFormat();
  const dl = useDomainLabel();
  const { checked, toggle } = usePickupChecklist(trip.id);
  const terms = listing?.rentalTerms?.find((term) => term.serviceType === trip.serviceType) ?? null;

  const items = pickupChecklistItems({
    serviceType: trip.serviceType,
    fuelType: trip.vehicle.fuelType,
    documents: terms?.requiredDocuments ?? [],
    depositRequired: trip.finance?.depositRequired ?? null,
    collateral: listing?.collateral ?? null,
  });

  const textOf = (item: PickupChecklistItem): { title: string; body: string } => {
    switch (item.key) {
      case 'licence':
        return { title: t('licence.title'), body: t('licence.body') };
      case 'identity': {
        const documents = item.documents
          .map((doc) => dl('customerDocumentType', doc, doc))
          .join(', ');
        return {
          title: t('identity.title'),
          body: documents ? t('identity.bodyDocuments', { documents }) : t('identity.body'),
        };
      }
      case 'inspect':
        return { title: t('inspect.title'), body: t('inspect.body', { energy: item.energy }) };
      case 'sign':
        return { title: t('sign.title'), body: t('sign.body') };
      case 'deposit':
        return {
          title: t('deposit.title', { amount: fmt.money(item.amount) }),
          body: t('deposit.body'),
        };
      case 'asset':
        return {
          title: t('asset.title'),
          body: t('asset.body', {
            assets: item.assets.map((asset) => dl('collateralAssetType', asset)).join(', '),
          }),
        };
    }
  };

  return (
    <Card>
      <YStack gap={space.sm}>
        <CardTitle icon="checkbox-outline">{t('title')}</CardTitle>
        <CardLead>{t('lead')}</CardLead>
        <YStack gap={space.sm}>
          {items.map((item) => {
            const text = textOf(item);
            const on = checked.includes(item.key);
            return (
              // Tick được như web: ghi nhớ CÁ NHÂN trên máy theo chuyến, không gửi server.
              <Pressable
                key={item.key}
                onPress={() => toggle(item.key)}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: on }}
                accessibilityLabel={text.title}
                hitSlop={space.xs}
              >
              <XStack ai="flex-start" gap={space.sm}>
                <YStack
                  mt={2}
                  w={18}
                  h={18}
                  br={radius.sm}
                  bw={1}
                  ai="center"
                  jc="center"
                  bc={on ? colors.primary : colors.borderInput}
                  bg={on ? colors.primary : colors.surface}
                >
                  {on ? <Ionicons name="checkmark" size={14} color={market.onDark} /> : null}
                </YStack>
                <YStack f={1} gap={2}>
                  <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                    {text.title}
                  </Text>
                  <Text col={colors.textMuted} fos={fontSize.label}>
                    {text.body}
                  </Text>
                </YStack>
              </XStack>
              </Pressable>
            );
          })}
        </YStack>
      </YStack>
    </Card>
  );
}
