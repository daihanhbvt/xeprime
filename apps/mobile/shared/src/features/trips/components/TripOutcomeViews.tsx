import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import type { ReactNode } from 'react';
import { Linking } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  CANCELLATION_PARTY,
  CUSTOMER_CANCELLATION_REASON_VALUES,
  CUSTOMER_TRIP_STAGE,
  DEPOSIT_COLLECTION_MODE,
  SUPPORT_HOTLINE,
  isCancellationParty,
  isCancellationReasonCategory,
  type CustomerCancellationReason,
  type CustomerTripStage,
} from '@xeprime/types';
import { canShowHostChatOnTrip, dayjs, telHref } from '@xeprime/domain';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { images } from '@/assets';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { ChatWithShopButton } from '@/features/chat/components/ChatWithShopButton';
import { InsuranceCoverageList } from '@/features/insurance/components/InsuranceCoverageList';
import { useListing } from '@/features/marketplace/hooks/use-marketplace-data';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { ROUTES } from '@/navigation/routes';
import { mixColor } from '@/theme/color-mix';
import { themed, useColors } from '@/theme/ThemeProvider';
import { layout } from '@/theme/layout';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { CustomerTripDetail } from '../api';
import { closedNotice } from '../stage-notice';
import { TripDriverCard } from './TripDriverCard';
import { TripEstimateCard } from './TripEstimateCard';
import { TripFinanceCard } from './TripFinanceCard';
import { TripHandoverEvidence } from './TripHandoverEvidence';
import { TripHoldPanel } from './TripHoldPanel';
import { TripNotReceivedReport } from './TripNotReceivedReport';
import { TripReviewCard } from './TripReviewCard';
import {
  CardLead,
  CardTitle,
  TripPriceEmptyCard,
  TripRequestPill,
  TripRequestRenterCard,
  TripRequestTripCard,
  type TripRequestTone,
} from './TripRequestCards';

/*
 * Hai màn SAU ngày nhận xe của KHÁCH — bản native của web `TripActiveView` / `TripClosedView`.
 *
 * Thứ tự khối = thứ tự web xếp ở MỘT cột (`TripColumns`, `@container (max-width: 820px)` trong
 * `TripRequestLayout.module.css`): `lead` (thẻ trạng thái) → `priority` (việc chính) → `main`
 * (thông tin chuyến, tài xế, hành trình thực tế, bảo hiểm, người thuê) → `aside` (tiền, hỗ trợ).
 * Khe giữa các khối: `space-20` (`.columns { gap }`).
 *
 * Mọi con số và quyền đều do SERVER quyết (ADR 0024 · ADR 0045): số tiền là số đóng băng của đơn
 * hoặc báo giá lúc gửi; đơn `active` không huỷ được nên không có khối huỷ.
 */

/** `.columns { gap: var(--xp-space-20) }` ở một cột. */
const COLUMN_GAP = toPx(XP_TOKENS['space-20']);
/** `.status { gap: space-12 }` và `.statusHead { gap: space-12 }`. */
const SPACE_12 = toPx(XP_TOKENS['space-12']);
/** `.statusBadge` / `.statusIcon` ≤640px: 48×48, biểu tượng 30px. */
const STATUS_ART = 48;
const STATUS_ICON = 30;

type OutcomeVariant = 'active' | 'completed' | 'failed' | 'notice';

/**
 * Sắc thái thẻ trạng thái — `.statusActive/.statusCompleted/.statusFailed/.statusNotice` web:
 * - `active`: nền `info-bg`, viền info trộn 45% vào `bg-container` (đang diễn ra — xanh dương).
 * - `completed`: nền `success-subtle`, viền LIỀN `success-accent`.
 * - `failed`: nền `error-bg`, viền LIỀN `color-error`.
 * - `notice`: nền `warning-bg`, viền warning trộn 45% vào `bg-container` (không ai có lỗi).
 * `fg` = màu biểu tượng trong vòng tròn `.statusIcon`.
 */
const useOutcomeSkin = themed<Record<OutcomeVariant, { bg: string; border: string; fg: string }>>(
  (colors) => ({
    active: {
      bg: colors.infoSurface,
      border: mixColor(colors.info, colors.surface, 0.45),
      fg: colors.info,
    },
    completed: { bg: colors.successSubtle, border: colors.successAccent, fg: colors.success },
    failed: { bg: colors.dangerSurface, border: colors.danger, fg: colors.danger },
    notice: {
      bg: colors.warningSurface,
      border: mixColor(colors.warning, colors.surface, 0.45),
      fg: colors.warning,
    },
  }),
);

/**
 * Thẻ trạng thái của chuyến đang thuê / đã khép — `TripRequestStatusCard` web với các biến thể
 * `active · completed · failed · notice` (Figma `21621:68041` · `21621:67556`).
 *
 * Vùng thẻ (`.card.status` ≤640px): đệm `space-md`, khe `space-12`, bo `radius-card` (16), viền 1px.
 * Đầu thẻ (`.statusHead`): minh hoạ 48×48 — ẢNH Figma (`status-success` / `status-cancelled`) cho
 * hoàn tất/hỏng, hoặc vòng tròn nền `bg-container` chứa biểu tượng 30px cho đang thuê / không ai có
 * lỗi — rồi nhãn chặng + tiêu đề h3 semibold. Câu dẫn (`.cardLead`): body `text-tertiary`.
 */
function OutcomeStatusCard({
  variant,
  tag,
  tone,
  title,
  body,
  image,
  icon,
  children,
}: {
  variant: OutcomeVariant;
  tag: string;
  tone: TripRequestTone;
  title: string;
  body: string;
  image?: (typeof images)['tripStatusSuccess'];
  icon?: keyof typeof Ionicons.glyphMap;
  children?: ReactNode;
}) {
  const colors = useColors();
  const skin = useOutcomeSkin()[variant];
  return (
    <YStack gap={SPACE_12} p={layout.cardPad} br={radius.card} bw={1} bc={skin.border} bg={skin.bg}>
      <XStack ai="center" gap={SPACE_12}>
        {image != null ? (
          <Image
            source={image}
            style={{ width: STATUS_ART, height: STATUS_ART }}
            contentFit="cover"
            accessible={false}
          />
        ) : (
          <YStack
            w={STATUS_ART}
            h={STATUS_ART}
            br={radius.pill}
            bg={colors.surface}
            ai="center"
            jc="center"
            accessible={false}
          >
            {icon ? <Ionicons name={icon} size={STATUS_ICON} color={skin.fg} /> : null}
          </YStack>
        )}
        {/* `.statusCopy`: nhãn chặng + tiêu đề, khe `space-sm`. */}
        <YStack f={1} minWidth={0} gap={space.sm} ai="flex-start">
          {/* `.status .pill`: nhãn chặng 12px/Medium. */}
          <TripRequestPill tone={tone} size="label">
            {tag}
          </TripRequestPill>
          <Text
            col={colors.text}
            fos={fontSize.bodyLg}
            fow={fontWeight.semibold}
            accessibilityRole="header"
          >
            {title}
          </Text>
        </YStack>
      </XStack>
      <CardLead>{body}</CardLead>
      {children}
    </YStack>
  );
}

/**
 * Lối liên hệ cạnh tên chủ xe trong thẻ "Thông tin chuyến đi" — `TripOwnerActions` web: nút tròn
 * nhắn tin (kênh chat trong sàn, mở theo `canShowHostChatOnTrip`) + nút gọi chỉ khi server mở
 * `canContact` (ADR 0028 điều 9 · ADR 0056). Không mở gì thì không vẽ gì.
 */
export function TripOwnerActions({ trip }: { trip: CustomerTripDetail }) {
  const t = useTranslations('Trips.confirmed');
  const canChat = canShowHostChatOnTrip({
    shopKind: trip.shop.shopKind,
    hasBooking: Boolean(trip.code),
  });
  const phone = trip.shop.phone;
  const tel = trip.canContact ? telHref(phone) : null;
  if (!canChat && !tel) return null;
  return (
    <>
      {canChat ? (
        <ChatWithShopButton
          vehicleId={trip.vehicle.id}
          iconOnly
          compact
          iconTone="plain"
          label={t('chatOwner')}
        />
      ) : null}
      {tel && phone ? (
        <IconButton
          icon="call-outline"
          tone="plain"
          compact
          size={18}
          label={t('callOwner', { phone })}
          onPress={() => void Linking.openURL(tel)}
        />
      ) : null}
    </>
  );
}

/**
 * "Hành trình thực tế" + biên bản bàn giao — `TripActualJourney` web. Mốc chỉ có sau bàn giao; biên
 * bản chỉ gọi API khi đã có mốc (mốc do chính lần xác nhận bàn giao ghi, cùng transaction).
 *
 * Vùng `.facts`: cặp nhãn/giá trị, nhãn body-sm `text-tertiary`, giá trị body medium `color-text`,
 * khe trong cặp `space-2`, giữa các cặp `space-md` (lưới tự xuống một cột ở khổ hẹp).
 */
function TripActualJourney({ trip }: { trip: CustomerTripDetail }) {
  const colors = useColors();
  const t = useTranslations('Trips.detail');
  const fmt = useAppFormat();
  const hasActual = Boolean(trip.actualPickupAt || trip.actualReturnAt);
  const facts = [
    trip.actualPickupAt
      ? { key: 'pickup', label: t('actualPickup'), at: trip.actualPickupAt }
      : null,
    trip.actualReturnAt
      ? { key: 'return', label: t('actualReturn'), at: trip.actualReturnAt }
      : null,
  ].filter((fact) => fact !== null);

  return (
    <>
      {hasActual ? (
        <Card radius={radius.card}>
          <YStack gap={space.md}>
            <CardTitle icon="speedometer-outline">{t('actualBlock')}</CardTitle>
            {facts.map((fact) => (
              <YStack key={fact.key} gap={2}>
                <Text col={colors.placeholder} fos={fontSize.bodySm}>
                  {fact.label}
                </Text>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.medium}>
                  {fmt.dateTime(fact.at)}
                </Text>
              </YStack>
            ))}
          </YStack>
        </Card>
      ) : null}
      <TripHandoverEvidence tripId={trip.id} enabled={hasActual} />
    </>
  );
}

/**
 * "Cần hỗ trợ?" — `TripSupportCard` web (Figma `21621:67556`, cột phải cuối): KHÔNG khung thẻ
 * (`.policy`: đệm `space-sm`, khe `space-md`). Tiêu đề body semibold · câu body `text-tertiary` ·
 * nút `CtaButton variant="neutral" size="form" block` "Liên hệ hỗ trợ XePrime" (icon tin nhắn) ·
 * dòng hotline nghiêng căn giữa `text-tertiary`, số `text-secondary` medium bấm để gọi.
 * Lối nhắn chủ xe nằm ở hàng chủ xe của thẻ "Thông tin chuyến đi", không lặp ở đây.
 */
function TripSupportCard() {
  const colors = useColors();
  const t = useTranslations('Trips.closed.support');
  const navigateOnce = useNavigateOnce();
  return (
    <YStack gap={space.md} p={space.sm}>
      <YStack gap={space.sm}>
        <Text
          col={colors.text}
          fos={fontSize.body}
          fow={fontWeight.semibold}
          accessibilityRole="header"
        >
          {t('title')}
        </Text>
        <Text col={colors.placeholder} fos={fontSize.body}>
          {t('body')}
        </Text>
      </YStack>
      <Button
        variant="neutral"
        icon="chatbubble-outline"
        label={t('contactXePrime')}
        onPress={() => navigateOnce(ROUTES.support.home())}
      />
      <Text col={colors.placeholder} fos={fontSize.body} fontStyle="italic" ta="center">
        {t.rich('hotline', {
          phone: SUPPORT_HOTLINE.display,
          tel: (chunks) => (
            <Text
              col={colors.textMuted}
              fow={fontWeight.medium}
              accessibilityRole="link"
              onPress={() => void Linking.openURL(`tel:${SUPPORT_HOTLINE.tel}`)}
            >
              {chunks}
            </Text>
          ),
        })}
      </Text>
    </YStack>
  );
}

/** Khoản giữ chỗ — `section.card` bọc `TripHoldPanel` như web. */
function HoldCard({ trip }: { trip: CustomerTripDetail }) {
  if (!trip.hold) return null;
  return (
    <TripHoldPanel
      hold={trip.hold}
      tripId={trip.id}
      tripTotalAmount={trip.estimate?.fees?.customerTotalAmount ?? null}
      payAtHandoverAmount={trip.estimate?.fees?.payAtPickupAmount ?? null}
    />
  );
}

/** Ba nguồn tiền loại trừ nhau: đơn (đóng băng) → báo giá lúc gửi → chưa có giá. */
function TripMoney({
  trip,
  closed,
  completed,
}: {
  trip: CustomerTripDetail;
  closed: boolean;
  completed: boolean;
}) {
  if (trip.finance) {
    return (
      <TripFinanceCard
        finance={trip.finance}
        closed={closed}
        {...(closed ? { settlement: { hold: trip.hold ?? null, tripId: trip.id, completed } } : {})}
      />
    );
  }
  if (trip.estimate) {
    return (
      <TripEstimateCard
        estimate={trip.estimate}
        isHost={false}
        settled={trip.hold?.paidAt != null}
      />
    );
  }
  return <TripPriceEmptyCard />;
}

/** Nhóm `main` chung của hai màn — thông tin chuyến → tài xế → hành trình → bảo hiểm → người thuê. */
function TripMainGroup({ trip }: { trip: CustomerTripDetail }) {
  const listing = useListing(trip.vehicle.id).data ?? null;
  return (
    <>
      <TripRequestTripCard
        trip={trip}
        listing={listing}
        ownerAction={<TripOwnerActions trip={trip} />}
      />
      {/* Người lái của chuyến có tài xế (ADR 0067). Chuyến khác: khối im lặng. */}
      <TripDriverCard trip={trip} />
      <TripActualJourney trip={trip} />
      {/* Bảo hiểm theo từng sản phẩm khách đã trả (ADR 0064) — rỗng thì không vẽ gì. */}
      {(trip.insuranceCoverage ?? []).length > 0 ? (
        <Card radius={radius.card}>
          <InsuranceCoverageList coverage={trip.insuranceCoverage ?? []} />
        </Card>
      ) : null}
      <TripRequestRenterCard trip={trip} />
    </>
  );
}

interface OutcomeViewProps {
  trip: CustomerTripDetail;
}

/**
 * Chuyến của KHÁCH đang thuê (chặng `active`) — `TripActiveView` web. Thẻ trạng thái xanh dương
 * "Hành trình đang diễn ra" + giờ trả xe dự kiến; KHÔNG có nút huỷ (ADR 0045 điều 1 — kết thúc
 * sớm là bàn giao trả xe rồi quyết toán).
 */
export function TripActiveView({ trip }: OutcomeViewProps) {
  const colors = useColors();
  const t = useTranslations('Trips.detail');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();

  return (
    <YStack gap={COLUMN_GAP}>
      {/* lead */}
      <OutcomeStatusCard
        variant="active"
        icon="car-sport"
        tag={domainLabel('customerTripStage', trip.stage)}
        tone="info"
        title={t('activeTitle')}
        body={t('activeNote')}
      >
        {/*
          `.returnAt`: hàng giờ trả xe nền `bg-container`, bo `radius-control`, đệm `sm md`, khe
          `space-sm`; đồng hồ `color-info`; chữ body `text-secondary`, giá trị semibold `color-text`.
        */}
        {trip.returnAt ? (
          <XStack
            ai="flex-start"
            gap={space.sm}
            px={space.md}
            py={space.sm}
            br={radius.control}
            bg={colors.surface}
          >
            <Ionicons
              name="time-outline"
              size={iconSize.sm}
              color={colors.info}
              style={{ marginTop: 3 }}
            />
            <Text f={1} col={colors.textMuted} fos={fontSize.body}>
              {t('activeReturn')}{' '}
              <Text col={colors.text} fow={fontWeight.semibold}>
                {fmt.rentalPoint(dayjs(trip.returnAt))}
              </Text>
            </Text>
          </XStack>
        ) : null}
      </OutcomeStatusCard>

      {/* priority */}
      <TripNotReceivedReport trip={trip} />
      <HoldCard trip={trip} />
      {trip.depositCollectionMode === DEPOSIT_COLLECTION_MODE.DIRECT ? (
        <Callout tone="info" title={t('directDeposit.title')}>
          {t('directDeposit.body')}
        </Callout>
      ) : null}
      {/* Server chỉ bật `canReview` cho chuyến hoàn thành — ở đây khối thường im lặng. */}
      <TripReviewCard trip={trip} />

      {/* main */}
      <TripMainGroup trip={trip} />

      {/* aside */}
      <TripMoney trip={trip} closed={false} completed={false} />
      <TripSupportCard />
    </YStack>
  );
}

/**
 * Chi tiết một chuyến ĐÃ KHÉP của khách — `TripClosedView` web: hoàn thành (Figma `21621:68041`
 * chưa đánh giá · `21621:68560` đã đánh giá) và các kết cục hỏng (đã huỷ `21621:67556`; bị từ
 * chối, quá hạn phản hồi, xe đã có khách khác, không nhận xe cùng khuôn). Đã khép thì không còn
 * dải tiến trình.
 */
export function TripClosedView({ trip }: OutcomeViewProps) {
  const colors = useColors();
  const t = useTranslations('Trips.closed');
  const tTrips = useTranslations('Trips');
  const domainLabel = useDomainLabel();

  const stage = trip.stage as CustomerTripStage;
  const notice = closedNotice(stage);
  if (!notice) return null;
  const completed = stage === CUSTOMER_TRIP_STAGE.COMPLETED;
  /*
   * Kết cục → biến thể + minh hoạ (web `STATUS`/`IMAGE`/`BADGE`): hoàn tất ⇒ ảnh tích xanh; hỏng do
   * một BÊN ⇒ ảnh X đỏ; không ai có lỗi ⇒ biểu tượng chấm than vàng (tô đỏ là đổ lỗi oan).
   */
  const variant: OutcomeVariant =
    notice.tone === 'success' ? 'completed' : notice.tone === 'danger' ? 'failed' : 'notice';
  const image =
    variant === 'completed'
      ? images.tripStatusSuccess
      : variant === 'failed'
        ? images.tripStatusCancelled
        : undefined;

  // Ai đã huỷ — server suy từ sổ huỷ (ADR 0045); không có thì giữ tiêu đề chung.
  const cancelledBy =
    stage === CUSTOMER_TRIP_STAGE.CANCELLED && isCancellationParty(trip.cancelledBy)
      ? trip.cancelledBy
      : null;
  const recordedReason = trip.cancelReason?.category;
  const reasonCategory =
    cancelledBy && isCancellationReasonCategory(recordedReason) ? recordedReason : null;
  // Khách tự huỷ ⇒ đúng chữ khách đã chọn trong tấm huỷ; phía khác ⇒ nhãn chung của nhóm lý do.
  const reasonLabel = !reasonCategory
    ? null
    : cancelledBy === CANCELLATION_PARTY.CUSTOMER &&
        (CUSTOMER_CANCELLATION_REASON_VALUES as readonly string[]).includes(reasonCategory)
      ? tTrips(`cancel.reasons.${reasonCategory as CustomerCancellationReason}`)
      : domainLabel('cancellationReasonCategory', reasonCategory);

  /* `.reason`: body `text-tertiary`; giá trị `<b>` semibold `text-secondary`. */
  const reasonLine = (reason: string) => (
    <Text col={colors.placeholder} fos={fontSize.body}>
      {t.rich('status.reason', {
        reason,
        b: (chunks) => (
          <Text col={colors.textMuted} fow={fontWeight.semibold}>
            {chunks}
          </Text>
        ),
      })}
    </Text>
  );

  return (
    <YStack gap={COLUMN_GAP}>
      {/* lead */}
      <OutcomeStatusCard
        variant={variant}
        {...(image != null ? { image } : { icon: 'alert-circle' as const })}
        tag={
          stage === CUSTOMER_TRIP_STAGE.CANCELLED
            ? t('status.cancelledTag')
            : domainLabel('customerTripStage', stage)
        }
        tone={notice.tone}
        title={cancelledBy ? tTrips(`cancelledBy.${cancelledBy}`) : t(`status.${notice.titleKey}`)}
        body={
          completed && !trip.canReview && !trip.review
            ? t('status.completedBodyNoReview')
            : t(`status.${notice.bodyKey}`)
        }
      >
        {/* Lý do do chủ xe tự gõ — giữ nguyên chữ của họ, không dịch. */}
        {stage === CUSTOMER_TRIP_STAGE.REJECTED && trip.rejectReason
          ? reasonLine(trip.rejectReason)
          : null}
        {reasonLabel ? reasonLine(reasonLabel) : null}
      </OutcomeStatusCard>

      {/* priority */}
      {completed ? <TripReviewCard trip={trip} /> : null}
      <TripNotReceivedReport trip={trip} />
      {/* Có đơn ⇒ khoản giữ chỗ/hoàn đã GỘP vào hoá đơn bên dưới; thẻ riêng chỉ cho chuyến chưa có đơn. */}
      {trip.finance ? null : <HoldCard trip={trip} />}

      {/* main */}
      <TripMainGroup trip={trip} />

      {/* aside */}
      <TripMoney trip={trip} closed completed={completed} />
      <TripSupportCard />
    </YStack>
  );
}
