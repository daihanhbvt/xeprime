import { useCallback, useEffect, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Modal, Pressable, useWindowDimensions } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { toAppTz } from '@xeprime/domain';
import {
  handoverPhotoSlotsFor,
  HANDOVER_TYPE,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, market, radius, space } from '@/theme/tokens';
import { requestTripPhotoUrl, useTripHandoverEvidence } from '../hooks/use-trips';
import type { CustomerTripHandoverEvidence as Evidence } from '../api';

/** Ô ảnh 128 × 82 của bản vẽ (Figma `22036:79884`) — app chia đều 3 ô một hàng. */
const THUMB_RATIO = 128 / 82;
/** 3 ô một hàng, cách 8, xếp từ TRÁI — hàng thiếu không bị dàn hai đầu. */
const GRID_COLUMNS = 3;
const GRID_GAP = 8;
const TABS: readonly HandoverType[] = [HANDOVER_TYPE.PICKUP, HANDOVER_TYPE.RETURN];

/**
 * "Thông tin bàn giao" mà KHÁCH được xem — bố cục Figma `22036:80113` (cùng web): hai tab "Trước khi
 * giao xe" / "Sau khi nhận xe" (tab chưa có biên bản thì khoá), dòng dẫn nghiêng, rồi 5 ô CỐ ĐỊNH
 * trước · sau · trái · phải · Odo cho ô tô; xe máy chỉ trước · sau · Odo — góc không chụp hiện ô giữ chỗ.
 *
 * Bề mặt RIÊNG (`/trips/:id/handover-evidence`) — route của gian hàng trả ghi chú nội bộ, tên
 * người xác nhận, `fileId` và `rowVersion`, không thứ nào trong đó là của khách.
 *
 * Mảng rỗng là câu trả lời HỢP LỆ (gian hàng chưa xác nhận bàn giao nào) — không phải lỗi.
 */
export function TripHandoverEvidence({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const colors = useColors();
  const t = useTranslations('Trips.evidence');
  const query = useTripHandoverEvidence(tripId, enabled);
  const [picked, setPicked] = useState<HandoverType | null>(null);

  if (!enabled) return null;

  if (query.isPending) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <Skeleton width="45%" height={18} />
          <Skeleton width="100%" height={36} />
          <XStack gap={space.xs}>
            <Skeleton width="31%" height={56} />
            <Skeleton width="31%" height={56} />
            <Skeleton width="31%" height={56} />
          </XStack>
        </YStack>
      </Card>
    );
  }

  if (query.isError) {
    return (
      <Card tone="muted" lift="flat">
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('errorTitle')}
        </Text>
      </Card>
    );
  }

  const records = query.data ?? [];
  const byType = new Map(records.map((r) => [r.type as HandoverType, r]));
  // Mặc định: chiều MỚI NHẤT đã có biên bản (đã trả xe ⇒ "Sau khi nhận xe").
  const active =
    picked && byType.has(picked)
      ? picked
      : byType.has(HANDOVER_TYPE.RETURN)
        ? HANDOVER_TYPE.RETURN
        : HANDOVER_TYPE.PICKUP;
  const record = byType.get(active);

  return (
    <Card>
      <YStack gap={space.sm + space.xs}>
        <Text col={colors.text} fos={fontSize.h4} lh={24} fow={fontWeight.semibold}>
          {t('title')}
        </Text>

        {!record ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('empty')}
          </Text>
        ) : (
          <>
            {/* Tab nền gray-50 bo 12; tab đang chọn nền trắng viền border-strong. */}
            <XStack
              p={2}
              gap={2}
              br={radius.control}
              bw={1}
              bc={colors.border}
              bg={colors.background}
              accessibilityRole="tablist"
            >
              {TABS.map((type) => {
                const available = byType.has(type);
                const selected = active === type;
                return (
                  <Pressable
                    key={type}
                    style={{ flex: 1 }}
                    disabled={!available}
                    onPress={() => setPicked(type)}
                    accessibilityRole="tab"
                    accessibilityState={{ selected, disabled: !available }}
                  >
                    <YStack
                      h={36}
                      ai="center"
                      jc="center"
                      br={radius.control}
                      bw={1}
                      bc={selected ? colors.borderInput : 'transparent'}
                      bg={selected ? colors.surface : 'transparent'}
                    >
                      <Text
                        col={available ? colors.textMuted : colors.borderInput}
                        fos={fontSize.body}
                        lh={22}
                        fow={fontWeight.semibold}
                      >
                        {t(`tabs.${type}`)}
                      </Text>
                    </YStack>
                  </Pressable>
                );
              })}
            </XStack>
            <EvidenceBlock key={active} tripId={tripId} record={record} />
            <Text col={colors.placeholder} fos={fontSize.label}>
              {t('disclaimer')}
            </Text>
          </>
        )}
      </YStack>
    </Card>
  );
}

function EvidenceBlock({ tripId, record }: { tripId: string; record: Evidence }) {
  const colors = useColors();
  const t = useTranslations('Trips.evidence');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [preview, setPreview] = useState<string | null>(null);
  const [gridWidth, setGridWidth] = useState(0);
  const tileWidth = gridWidth > 0 ? (gridWidth - GRID_GAP * (GRID_COLUMNS - 1)) / GRID_COLUMNS : '31%';
  const bySlot = new Map<string, (typeof record.photos)[number]>(
    record.photos.map((p) => [p.slot, p]),
  );
  // Năm góc cố định trước, ảnh chụp thêm (slot lạ) sau — không làm mất tấm nào.
  // Bộ góc theo LOẠI XE: ô tô 5 góc, xe máy 3 góc (trước · sau · Odo).
  const baseSlots = handoverPhotoSlotsFor(record.vehicleType);
  const extraSlots = record.photos
    .map((p) => p.slot)
    .filter((slot) => !(baseSlots as readonly string[]).includes(slot));
  const slots: string[] = [...baseSlots, ...extraSlots];

  /*
   * Mốc GHI NHẬN chỉ hiện khi nó khác mốc THỰC TẾ — so ở mức PHÚT, đúng độ chính xác đang
   * hiển thị; so chuỗi ISO sẽ đẻ ra hai dòng in y hệt nhau khi xác nhận ngay tại quầy.
   */
  const recordedApart =
    record.confirmedAt != null &&
    record.occurredAt != null &&
    !toAppTz(record.confirmedAt).isSame(toAppTz(record.occurredAt), 'minute');

  return (
    <YStack gap={space.sm + space.xs}>
      <Text col={colors.textMuted} fos={fontSize.body} lh={22} fontStyle="italic">
        {t(`leads.${record.type}`)}
      </Text>

      <XStack
        flexWrap="wrap"
        rowGap={space.sm}
        columnGap={GRID_GAP}
        onLayout={(e) => setGridWidth(e.nativeEvent.layout.width)}
      >
        {slots.map((slot) => {
          const photo = bySlot.get(slot);
          return (
            <YStack key={slot} w={tileWidth} gap={space.xs} ai="center">
              {photo ? (
                <EvidencePhoto
                  tripId={tripId}
                  type={record.type as HandoverType}
                  slot={slot}
                  addedLate={photo.addedAfterConfirmation}
                  onOpen={setPreview}
                />
              ) : (
                // Góc chủ xe không chụp — ô giữ chỗ, không biến mất khỏi hàng.
                <YStack
                  w="100%"
                  aspectRatio={THUMB_RATIO}
                  br={radius.control}
                  bg={colors.background}
                  ai="center"
                  jc="center"
                  accessibilityLabel={t('slotMissing')}
                >
                  <Ionicons name="image-outline" size={iconSize.lg} color={colors.borderInput} />
                </YStack>
              )}
              <Text
                col={colors.textMuted}
                fos={fontSize.body}
                lh={20}
                fow={fontWeight.medium}
                ta="center"
              >
                {domainLabel('handoverPhotoSlot', slot as HandoverPhotoSlot)}
              </Text>
              {photo?.addedAfterConfirmation ? (
                <Text col={colors.warning} fos={fontSize.label} ta="center">
                  {t('addedLate')}
                </Text>
              ) : null}
            </YStack>
          );
        })}
      </XStack>

      <Line label={t('occurredAt')} value={fmt.dateTime(record.occurredAt)} />
      {recordedApart ? (
        <Line label={t('recordedAt')} value={fmt.dateTime(record.confirmedAt)} />
      ) : null}
      {/* `odometerKm: null` = CHƯA GHI NHẬN, tuyệt đối không phải 0 km. */}
      <Line
        label={t('odometer')}
        value={record.odometerKm == null ? t('odometerMissing') : fmt.km(record.odometerKm)}
        muted={record.odometerKm == null}
      />
      {record.condition ? (
        <Line label={t('condition')} value={domainLabel('handoverCondition', record.condition)} />
      ) : null}

      <PhotoViewer url={preview} onClose={() => setPreview(null)} />
    </YStack>
  );
}

/**
 * Một ảnh hiện trạng — ô hiện ẢNH THU NHỎ thật như bản vẽ (Figma `22036:79884`), chạm để phóng to.
 *
 * URL ký sống vài phút: ô xin một vé lúc gắn để vẽ thu nhỏ (expo-image giữ ảnh trong cache, nên vé
 * hết hạn sau đó không làm ô trắng lại), còn lúc CHẠM thì xin vé MỚI cho trình xem — không dùng lại
 * vé cũ có thể đã hết hạn.
 */
function EvidencePhoto({
  tripId,
  type,
  slot,
  addedLate,
  onOpen,
}: {
  tripId: string;
  type: HandoverType;
  slot: string;
  addedLate: boolean;
  onOpen: (url: string) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Trips.evidence');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const [loading, setLoading] = useState(false);
  const [thumb, setThumb] = useState<string | null>(null);
  const [thumbFailed, setThumbFailed] = useState(false);

  useEffect(() => {
    let alive = true;
    requestTripPhotoUrl(tripId, type, slot)
      .then((ticket) => alive && setThumb(ticket.downloadUrl))
      .catch(() => alive && setThumbFailed(true));
    return () => {
      alive = false;
    };
  }, [slot, tripId, type]);

  const open = useCallback(async () => {
    setLoading(true);
    try {
      const ticket = await requestTripPhotoUrl(tripId, type, slot);
      onOpen(ticket.downloadUrl);
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      setLoading(false);
    }
  }, [errorMessage, onOpen, slot, toast, tripId, type]);

  const label = domainLabel('handoverPhotoSlot', slot as HandoverPhotoSlot);

  return (
    <Pressable
      onPress={() => void open()}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={t('photoAlt', { slot: label })}
      accessibilityHint={addedLate ? t('addedLateHint') : undefined}
      style={{ width: '100%' }}
    >
      {/*
        Ảnh bổ sung SAU mốc xác nhận không phải ảnh chụp tại thời điểm bàn giao — viền cảnh báo +
        nhãn dưới ô nói rõ, vì đây là bằng chứng khách có thể phải dựa vào để đối chiếu.
      */}
      <YStack
        w="100%"
        aspectRatio={THUMB_RATIO}
        br={radius.control}
        ov="hidden"
        bg={colors.background}
        bw={addedLate ? 1 : 0}
        bc={colors.warning}
        ai="center"
        jc="center"
      >
        {thumb && !thumbFailed ? (
          <Image
            source={{ uri: thumb }}
            style={{ width: '100%', height: '100%' }}
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={150}
            accessible={false}
            onError={() => setThumbFailed(true)}
          />
        ) : thumbFailed ? (
          <Ionicons name="image-outline" size={iconSize.lg} color={colors.textMuted} />
        ) : (
          <ActivityIndicator size="small" color={colors.accentText} />
        )}
        {loading ? (
          <YStack
            pos="absolute"
            top={0}
            left={0}
            right={0}
            bottom={0}
            ai="center"
            jc="center"
            bg={colors.overlay}
          >
            <ActivityIndicator size="small" color={market.onDark} />
          </YStack>
        ) : thumb && !thumbFailed ? (
          // Con mắt ở góc: báo ô này chạm được để xem ảnh lớn.
          <YStack
            pos="absolute"
            right={6}
            bottom={6}
            w={24}
            h={24}
            br={radius.pill}
            ai="center"
            jc="center"
            bg={colors.overlay}
          >
            <Ionicons name="eye-outline" size={14} color={market.onDark} />
          </YStack>
        ) : null}
      </YStack>
    </Pressable>
  );
}

/** Xem ảnh toàn màn. URL ký sống ngắn nên không có bước tải về, chỉ xem. */
function PhotoViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
  const colors = useColors();
  const t = useTranslations('Common.actions');
  const { width, height } = useWindowDimensions();
  const [failed, setFailed] = useState(false);
  const tEvidence = useTranslations('Trips.evidence');

  return (
    <Modal visible={url != null} transparent animationType="fade" onRequestClose={onClose}>
      <YStack f={1} bg="rgba(0,0,0,0.92)" ai="center" jc="center">
        <XStack pos="absolute" top={40} right={space.sm} zi={1}>
          <IconButton icon="close" label={t('close')} onPress={onClose} tone="surface" />
        </XStack>
        {url && !failed ? (
          <Image
            /*
             * `key={url}` để mỗi URL là một `<Image>` MỚI.
             *
             * `failed` là state của component này và nó KHÔNG tự reset khi `url` đổi; không có
             * key thì một URL ký hết hạn đặt cờ đó lên, rồi mọi ảnh mở sau đều hiện "không mở
             * được" — dù chúng hoàn toàn bình thường.
             */
            key={url}
            source={{ uri: url }}
            style={{ width, height: height * 0.8 }}
            contentFit="contain"
            cachePolicy="memory-disk"
            onError={() => setFailed(true)}
            onLoad={() => setFailed(false)}
          />
        ) : (
          <Text col={colors.textInverse} fos={fontSize.body}>
            {tEvidence('photoUnavailable')}
          </Text>
        )}
      </YStack>
    </Modal>
  );
}

function Line({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  const colors = useColors();
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text col={colors.textMuted} fos={fontSize.bodySm} flexShrink={0}>
        {label}
      </Text>
      {/*
        `f={1}` + canh phải, không để chữ tự co: giá trị "chưa ghi nhận" dài hơn hẳn một số đo
        (`Chưa ghi nhận chỉ số Odo` cạnh nhãn `Số Odo`) và ở màn hẹp nó bị cắt mất ký tự cuối.
        Dạng vắng số đo dùng cỡ nhỏ hơn — nó là chú thích, không phải dữ kiện.
      */}
      <Text
        f={1}
        ta="right"
        col={muted ? colors.textMuted : colors.text}
        fos={muted ? fontSize.label : fontSize.bodySm}
      >
        {value}
      </Text>
    </XStack>
  );
}
