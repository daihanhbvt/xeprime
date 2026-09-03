import { useCallback, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { ActivityIndicator, Image, Modal, Pressable, useWindowDimensions } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { toAppTz } from '@xeprime/domain';
import type { HandoverType } from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { Skeleton } from '@/components/ui/Skeleton';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { requestTripPhotoUrl, useTripHandoverEvidence } from '../hooks/use-trips';
import type { CustomerTripHandoverEvidence as Evidence } from '../api';

const THUMB = 84;

/**
 * Biên bản giao/nhận xe mà KHÁCH được xem.
 *
 * Bề mặt RIÊNG (`/trips/:id/handover-evidence`) — route của gian hàng trả ghi chú nội bộ, tên
 * người xác nhận, `fileId` và `rowVersion`, không thứ nào trong đó là của khách.
 *
 * Mảng rỗng là câu trả lời HỢP LỆ (chưa được duyệt, hoặc gian hàng chưa xác nhận bàn giao nào)
 * — giao diện không được biến nó thành thông báo hỏng.
 */
export function TripHandoverEvidence({ tripId, enabled }: { tripId: string; enabled: boolean }) {
  const t = useTranslations('Trips.evidence');
  const query = useTripHandoverEvidence(tripId, enabled);

  if (!enabled) return null;

  if (query.isPending) {
    return (
      <Card>
        <YStack gap={space.sm}>
          <Skeleton width="45%" height={18} />
          <Skeleton width="90%" height={13} />
          <XStack gap={space.xs}>
            <Skeleton width={THUMB} height={THUMB} />
            <Skeleton width={THUMB} height={THUMB} />
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

  return (
    <Card>
      <YStack gap={space.md}>
        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
            {t('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('lead')}
          </Text>
        </YStack>

        {records.length === 0 ? (
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('empty')}
          </Text>
        ) : (
          <>
            {records.map((record) => (
              <EvidenceBlock key={record.type} tripId={tripId} record={record} />
            ))}
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
  const t = useTranslations('Trips.evidence');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const [preview, setPreview] = useState<string | null>(null);

  /*
   * Mốc GHI NHẬN chỉ hiện khi nó khác mốc THỰC TẾ — so ở mức PHÚT, đúng độ chính xác đang
   * hiển thị. So bằng chuỗi ISO sẽ đẻ ra hai dòng in y hệt nhau khi nhân viên bấm xác nhận
   * ngay tại quầy (lệch vài giây), tức là thêm nhiễu chứ không thêm thông tin.
   */
  const recordedApart =
    record.confirmedAt != null &&
    record.occurredAt != null &&
    !toAppTz(record.confirmedAt).isSame(toAppTz(record.occurredAt), 'minute');

  return (
    <YStack gap={space.xs}>
      <XStack ai="center" jc="space-between" gap={space.xs}>
        <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {domainLabel('handoverType', record.type)}
        </Text>
        {/*
          Giờ bàn giao THẬT đứng ngay cạnh tên chặng — đây là dữ kiện chính của cả khối, không
          phải một dòng phụ. Trước đây khối này chỉ hiện giờ BẤM XÁC NHẬN, tức là con số duy
          nhất khách đọc được lại không phải con số họ cần.
        */}
        <Text col={colors.textMuted} fos={fontSize.label}>
          {fmt.dateTime(record.occurredAt)}
        </Text>
      </XStack>

      {recordedApart ? (
        <Line label={t('recordedAt')} value={fmt.dateTime(record.confirmedAt)} />
      ) : null}

      {/*
        `odometerKm: null` = CHƯA GHI NHẬN, tuyệt đối không phải 0 km. Server có cờ riêng
        (`odometerMissing`) đúng vì phân biệt này — hiện "0 km" là bịa một số đo.
      */}
      <Line
        label={t('odometer')}
        value={record.odometerKm == null ? t('odometerMissing') : fmt.km(record.odometerKm)}
        muted={record.odometerKm == null}
      />

      {record.condition ? (
        <Line label={t('condition')} value={domainLabel('handoverCondition', record.condition)} />
      ) : null}

      {record.photos.length === 0 ? (
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('noPhotos')}
        </Text>
      ) : (
        <XStack gap={space.xs} flexWrap="wrap">
          {record.photos.map((photo) => (
            <EvidencePhoto
              key={photo.slot}
              tripId={tripId}
              type={record.type as HandoverType}
              slot={photo.slot}
              uploadedAt={photo.uploadedAt}
              addedLate={photo.addedAfterConfirmation}
              onOpen={setPreview}
            />
          ))}
        </XStack>
      )}

      <PhotoViewer url={preview} onClose={() => setPreview(null)} />
    </YStack>
  );
}

/**
 * Một ảnh hiện trạng.
 *
 * URL ký xin lại ở TỪNG cú bấm và không đi vào state lâu hơn lần xem đang diễn ra — nó sống vài
 * phút, nên giữ lại là chuẩn bị sẵn một ảnh hỏng cho lần bấm sau.
 */
function EvidencePhoto({
  tripId,
  type,
  slot,
  uploadedAt,
  addedLate,
  onOpen,
}: {
  tripId: string;
  type: HandoverType;
  slot: string;
  uploadedAt: string;
  addedLate: boolean;
  onOpen: (url: string) => void;
}) {
  const t = useTranslations('Trips.evidence');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const [loading, setLoading] = useState(false);

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

  return (
    <Pressable
      onPress={() => void open()}
      disabled={loading}
      accessibilityRole="button"
      accessibilityLabel={t('photoAlt', { slot: domainLabel('handoverPhotoSlot', slot) })}
      accessibilityHint={
        addedLate ? t('addedLateHint') : t('uploadedAt', { time: fmt.dateTime(uploadedAt) })
      }
    >
      <YStack
        w={THUMB}
        h={THUMB}
        br={radius.md}
        bg={colors.surfaceMuted}
        bw={1}
        bc={addedLate ? colors.warning : colors.border}
        ai="center"
        jc="center"
        gap={2}
      >
        {loading ? (
          <ActivityIndicator size="small" color={colors.primaryActive} />
        ) : (
          <>
            <Ionicons name="image-outline" size={iconSize.lg} color={colors.textMuted} />
            <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
              {domainLabel('handoverPhotoSlot', slot)}
            </Text>
            {/*
              Ảnh bổ sung SAU mốc xác nhận không phải ảnh chụp tại thời điểm bàn giao. Viền cảnh
              báo + nhãn nói rõ, vì đây là bằng chứng khách có thể phải dựa vào để đối chiếu.
            */}
            {addedLate ? <Ionicons name="time-outline" size={12} color={colors.warning} /> : null}
          </>
        )}
      </YStack>
    </Pressable>
  );
}

/** Xem ảnh toàn màn. URL ký sống ngắn nên không có bước tải về, chỉ xem. */
function PhotoViewer({ url, onClose }: { url: string | null; onClose: () => void }) {
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
            resizeMode="contain"
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
  return (
    <XStack ai="center" jc="space-between" gap={space.sm}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      <Text col={muted ? colors.textMuted : colors.text} fos={fontSize.bodySm}>
        {value}
      </Text>
    </XStack>
  );
}
