import { memo, useCallback, useMemo, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  HANDOVER_EXTERIOR_SLOTS,
  HANDOVER_PHOTO_SLOT,
  PERMISSION,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import {
  requestHandoverPhotoUrl,
  useAttachHandoverPhoto,
  useHandoverPhotoUrls,
  useRemoveHandoverPhoto,
} from '../hooks/use-handovers';
import {
  HandoverUploadError,
  pickHandoverPhoto,
  PHOTO_SOURCE,
  type PhotoSource,
  type PickedPhoto,
} from '../photo-upload';
import type { Handover } from '../api';

/** Bốn góc ngoại thất + đồng hồ Odo — thứ tự cố định để hai bên nhìn CÙNG một góc. */
const SLOTS: readonly HandoverPhotoSlot[] = [
  ...HANDOVER_EXTERIOR_SLOTS,
  HANDOVER_PHOTO_SLOT.ODOMETER,
];

/** Ô 96×96: đủ để nhận ra góc chụp, và năm ô vẫn xuống hai hàng trên máy hẹp nhất. */
const CELL = 96;

/*
  Ảnh lấp KÍN ô — `<Image>` không nhận prop style của Tamagui, nên kích thước ở `StyleSheet`.

  `position: absolute` để ảnh nằm dưới lớp huy hiệu con mắt mà không đẩy nó đi đâu; ô cha đã
  `overflow: hidden` nên ảnh bị bo theo góc của ô.
*/
const styles = StyleSheet.create({
  thumbnail: {
    ...StyleSheet.absoluteFillObject,
    width: CELL,
    height: CELL,
  },
});

/**
 * Ghi lại NGUYÊN VĂN vì sao một ảnh không lên được.
 *
 * Câu hiện cho người dùng cố ý ngắn ("ảnh vẫn nằm ở hàng chờ, thử lại khi có sóng") vì họ không
 * sửa được gì bằng mã lỗi. Nhưng người phát triển thì cần đúng những thứ câu đó nuốt mất: bước
 * nào ngã, file bao nhiêu byte, kiểu MIME gì, server trả mã gì.
 *
 * `console.error` chứ không phải một dịch vụ log: app chưa cắm Sentry, và ở giai đoạn này thứ
 * cần là dòng log đọc được ngay trong Metro/logcat để dán vào issue.
 */
function reportUploadFailure(
  stage: string,
  slot: HandoverPhotoSlot,
  photo: PickedPhoto,
  error: unknown,
): void {
  /*
   * Dung lượng lấy từ LỖI, không từ tấm ảnh: số byte thật chỉ đọc được khi bước tải lên mở file
   * ra, và `HandoverUploadError` mang theo đúng con số đã ký vào URL. Ngã ngay ở bước mở file
   * thì chưa có số nào để nói — im lặng đúng hơn là in một con số bịa.
   */
  const detail =
    error instanceof HandoverUploadError
      ? { stage: error.stage, cause: describeError(error.cause), fileSize: error.meta.fileSize }
      : { stage, cause: describeError(error) };

  console.error('[handover-photo] tải ảnh thất bại', {
    ...detail,
    slot,
    fileName: photo.fileName,
    contentType: photo.contentType,
  });
}

function describeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

/**
 * Lưới ảnh hiện trạng.
 *
 * **KHÔNG có slot bắt buộc.** `HANDOVER_REQUIRED_SLOTS` bị xoá có chủ ý ở `@xeprime/types` —
 * một chuyến bình thường phải xong bằng đúng hai lần bấm. Tô viền "bắt buộc" ở đây là hứa suông
 * với người dùng, vì không tầng nào chặn.
 *
 * Ảnh gắn được cả SAU khi xác nhận: trạng thái gắn/gỡ ảnh rộng hơn trạng thái sửa đúng một bậc,
 * và quên chụp là chuyện thường ở quầy.
 *
 * Ba quyền tách bạch, và màn này tôn trọng cả ba: `handovers.manage` để chụp/gỡ,
 * `handovers.view_files` để MỞ LẠI ảnh (người lập biên bản không đương nhiên đọc được kho bằng
 * chứng), còn không có quyền nào thì lưới ẩn hẳn — không để lại năm ô xám chết.
 */
export function HandoverPhotoGrid({
  bookingId,
  type,
  handover,
  ensureHandover,
}: {
  bookingId: string;
  type: HandoverType;
  handover: Handover | null;
  /**
   * Tạo biên bản TRỄ, đúng lúc người dùng chọn tấm ảnh đầu tiên.
   *
   * Ảnh cần một biên bản để gắn vào (`requireActive` ở server), mà luồng nhanh chưa tạo cái nào
   * cho tới lúc bấm xác nhận. Mở vùng nâng cao ra ngó rồi đóng lại thì không để lại bản nháp
   * rỗng nào trong DB. Cùng cách web làm.
   */
  ensureHandover?: () => Promise<void>;
}) {
  const t = useTranslations('Bookings.handover.photos');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();

  const attach = useAttachHandoverPhoto(bookingId, type);
  const remove = useRemoveHandoverPhoto(bookingId, type);

  const [picking, setPicking] = useState<HandoverPhotoSlot | null>(null);
  const [busySlot, setBusySlot] = useState<HandoverPhotoSlot | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** Ô đang chờ xác nhận GỠ — `null` là không hỏi ai cả. */
  const [removingSlot, setRemovingSlot] = useState<HandoverPhotoSlot | null>(null);

  const canManage = permissions.has(PERMISSION.HANDOVER_MANAGE);
  const canViewFiles = permissions.has(PERMISSION.HANDOVER_FILE_VIEW);
  /*
   * `useMemo` bắt buộc: `taken` là dependency của `open`, và một `Map` dựng lại mỗi lần render
   * làm `useCallback` bên dưới đổi danh tính liên tục — tức là chính nó vô hiệu hoá memo hoá.
   */
  const taken = useMemo(
    () => new Map((handover?.photos ?? []).map((photo) => [photo.slot, photo])),
    [handover?.photos],
  );

  const capture = useCallback(
    async (slot: HandoverPhotoSlot, source: PhotoSource) => {
      setPicking(null);
      const photo = await pickHandoverPhoto(source);
      // Huỷ và từ chối quyền không phân biệt được ở API của picker — cả hai đều là "không có
      // ảnh", và cả hai đều KHÔNG phải lỗi cần báo.
      if (!photo) return;

      setBusySlot(slot);
      try {
        await ensureHandover?.();
      } catch (error) {
        setBusySlot(null);
        reportUploadFailure('ensure-handover', slot, photo, error);
        toast.showError(t('uploadFailed'));
        return;
      }

      attach.mutate(
        { slot, photo },
        {
          // Ảnh mất khi upload hỏng: nói thẳng ra để người dùng chụp lại, đừng im lặng.
          onError: (error) => {
            reportUploadFailure('attach', slot, photo, error);
            toast.showError(t('uploadFailed'));
          },
          onSettled: () => setBusySlot(null),
        },
      );
    },
    [attach, ensureHandover, t, toast],
  );

  /** Mở lại một ảnh — URL ký xin lại TỪNG cú bấm, không giữ trong state quá lần xem này. */
  const open = useCallback(
    async (slot: HandoverPhotoSlot) => {
      const photo = taken.get(slot);
      if (!photo?.fileId) return;

      setBusySlot(slot);
      try {
        const ticket = await requestHandoverPhotoUrl(bookingId, type, photo.fileId);
        setPreview(ticket.downloadUrl);
      } catch (error) {
        toast.showError(errorMessage(error));
      } finally {
        setBusySlot(null);
      }
    },
    [bookingId, errorMessage, taken, toast, type],
  );

  // Chuyển `open` (async) thành một handler void ổn định — `PhotoSlot` chỉ cần bấm-là-chạy.
  const openSlot = useCallback((slot: HandoverPhotoSlot) => void open(slot), [open]);

  const confirmRemove = useCallback((slot: HandoverPhotoSlot) => setRemovingSlot(slot), []);

  /*
   * Danh sách `fileId` phải ỔN ĐỊNH giữa các lần render: nó là dependency của `useQueries`, và
   * một mảng dựng lại mỗi nhịp sẽ dựng lại cả bộ query — tức là xin vé mới liên tục.
   */
  const fileIds = useMemo(
    () =>
      SLOTS.map((slot) => taken.get(slot)?.fileId).filter(
        (fileId): fileId is string => typeof fileId === 'string',
      ),
    [taken],
  );

  const photoUrls = useHandoverPhotoUrls(bookingId, type, fileIds, canViewFiles);

  // Không quyền nào trong hai quyền trên: lưới không có việc gì để làm ở đây.
  if (!canManage && !canViewFiles) return null;

  return (
    <YStack gap={space.sm}>
      <YStack gap={2}>
        <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
          {t('title')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {handover?.confirmedAt ? t('afterConfirm') : t('optional')}
        </Text>
      </YStack>

      <XStack gap={space.xs} flexWrap="wrap">
        {SLOTS.map((slot) => (
          <PhotoSlot
            key={slot}
            slot={slot}
            filled={taken.has(slot)}
            busy={busySlot === slot}
            canOpen={canViewFiles && Boolean(taken.get(slot)?.fileId)}
            thumbnailUrl={photoUrls[taken.get(slot)?.fileId ?? '']}
            canManage={canManage}
            onCapture={setPicking}
            onOpen={openSlot}
            onRemove={confirmRemove}
          />
        ))}
      </XStack>

      <BottomSheet
        open={picking !== null}
        onClose={() => setPicking(null)}
        title={t('title')}
        footer={
          <>
            <Button
              label={t('camera')}
              icon="camera-outline"
              onPress={() => picking && void capture(picking, PHOTO_SOURCE.CAMERA)}
            />
            <Button
              label={t('library')}
              variant="secondary"
              icon="images-outline"
              onPress={() => picking && void capture(picking, PHOTO_SOURCE.LIBRARY)}
            />
          </>
        }
      >
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('sourceHint')}
        </Text>
      </BottomSheet>

      <PhotoViewer
        url={preview}
        unavailableLabel={t('unavailable')}
        onClose={() => setPreview(null)}
      />

      {/* Ảnh hiện trạng là BẰNG CHỨNG — gỡ rồi thì phải ra chỗ xe chụp lại, nên hỏi trước. */}
      <AlertDialog
        open={removingSlot !== null}
        title={t('remove')}
        message={t('removeConfirm')}
        confirmLabel={t('remove')}
        cancelLabel={t('keep')}
        destructive
        loading={remove.isPending}
        onCancel={() => setRemovingSlot(null)}
        onConfirm={() => {
          if (!removingSlot) return;
          remove.mutate(removingSlot, {
            onError: (error) => toast.showError(errorMessage(error)),
            onSettled: () => setRemovingSlot(null),
          });
        }}
      />
    </YStack>
  );
}

/**
 * Một ô góc chụp.
 *
 * Ô ĐÃ CÓ ẢNH mở ảnh khi chạm — không xoá. Xoá là một nút riêng ở góc, và còn hỏi lại: ảnh hiện
 * trạng là bằng chứng, mất nó bằng một cú chạm nhầm là mất thứ không chụp lại được.
 *
 * MEMO vì lưới re-render mỗi khi `busySlot`/`preview` đổi (một cú bấm ở một ô); không có nó thì
 * cả năm ô dựng lại theo, dù bốn ô còn lại không đổi gì. Ba handler nhận thẳng `slot` và đến từ
 * props ỔN ĐỊNH của cha (`setPicking`/`openSlot`/`confirmRemove`, đều giữ nguyên danh tính giữa
 * các lần render) — memo chỉ có tác dụng khi props so sánh bằng nhau, và một closure dựng mới
 * mỗi render ở nơi gọi sẽ vô hiệu hoá nó ngay.
 */
const PhotoSlot = memo(function PhotoSlot({
  slot,
  filled,
  busy,
  canOpen,
  canManage,
  thumbnailUrl,
  onCapture,
  onOpen,
  onRemove,
}: {
  slot: HandoverPhotoSlot;
  filled: boolean;
  busy: boolean;
  canOpen: boolean;
  canManage: boolean;
  /** URL ký của chính tấm ảnh — vắng khi chưa xin được vé, hoặc không có quyền xem tệp. */
  thumbnailUrl: string | undefined;
  onCapture: (slot: HandoverPhotoSlot) => void;
  onOpen: (slot: HandoverPhotoSlot) => void;
  onRemove: (slot: HandoverPhotoSlot) => void;
}) {
  const t = useTranslations('Bookings.handover.photos');
  const domainLabel = useDomainLabel();
  const label = domainLabel('handoverPhotoSlot', slot);

  /*
   * URL ký sống 120 giây. Ảnh đã tải xong thì hết hạn không ảnh hưởng — nhưng một ô mount đúng
   * lúc vé vừa chết sẽ hỏng, và khi đó ô phải LÙI về hình biểu tượng chứ không đứng trống.
   */
  const [brokenUrl, setBrokenUrl] = useState<string | null>(null);
  const thumbnail = thumbnailUrl && thumbnailUrl !== brokenUrl ? thumbnailUrl : null;

  const press = filled
    ? canOpen
      ? () => onOpen(slot)
      : undefined
    : canManage
      ? () => onCapture(slot)
      : undefined;

  return (
    <YStack>
      <Pressable
        onPress={press}
        disabled={!press || busy}
        accessibilityRole="button"
        accessibilityLabel={filled && canOpen ? `${label} — ${t('view')}` : label}
        accessibilityState={{ checked: filled, disabled: !press || busy }}
      >
        <YStack
          w={CELL}
          h={CELL}
          br={radius.md}
          bw={1}
          /*
            Có ảnh rồi thì ô KHÔNG tô xanh nữa.

            Xanh lá là để nói "ô này xong rồi" — nhưng chính tấm ảnh đã nói điều đó, rõ hơn.
            Giữ thêm nền và viền xanh quanh ảnh chỉ làm lưới ồn và làm tấm ảnh trông như một
            nhãn trạng thái thay vì một tấm ảnh.
          */
          bg={filled && !thumbnail ? colors.successSurface : colors.surfaceMuted}
          bc={filled && !thumbnail ? colors.success : colors.border}
          ai="center"
          jc="center"
          gap={space.xs}
          /*
            `overflow: hidden` để ảnh bị BO theo góc của ô. Không có nó thì ảnh vuông vẽ đè ra
            ngoài bốn góc bo và cả lưới trông như bị lệch.
          */
          ov="hidden"
        >
          {busy ? (
            <ActivityIndicator size="small" color={colors.primaryActive} />
          ) : thumbnail ? (
            /*
              CHÍNH tấm ảnh, không phải một ô màu nói rằng có ảnh.

              Ô màu xanh + dấu tích chỉ trả lời "đã chụp chưa"; người dùng đứng cạnh xe cần trả
              lời câu khác: "tấm đó chụp có được không". Câu đó chỉ có tấm ảnh trả lời được, và
              phải trả lời mà không bắt họ mở từng ô ra xem.

              `contentFit="cover"` để ảnh lấp kín ô: `contain` chừa hai dải trống, và năm ô như
              vậy thì lưới trông thủng lỗ chỗ.
            */
            <>
              <Image
                source={{ uri: thumbnail }}
                style={styles.thumbnail}
                contentFit="cover"
                cachePolicy="memory-disk"
                onError={() => setBrokenUrl(thumbnail)}
              />
              {/*
                Con mắt nằm TRÊN ảnh, trong một đĩa tối mờ: ảnh chụp xe có vùng sáng vùng tối
                bất kỳ, nên một icon trần sẽ tàng hình trên đúng những tấm sáng.
              */}
              <XStack
                pos="absolute"
                bottom={4}
                right={4}
                w={24}
                h={24}
                br={12}
                ai="center"
                jc="center"
                bg={colors.overlay}
              >
                <Ionicons name="eye" size={iconSize.sm} color={colors.textInverse} />
              </XStack>
            </>
          ) : (
            <>
              {/*
                Chưa có ảnh để vẽ — hoặc ô còn trống, hoặc chưa xin được vé xem, hoặc không có
                quyền xem tệp. Ô đã có ảnh mà MỞ ĐƯỢC thì vẽ con MẮT chứ không phải dấu tích:
                dấu tích chỉ nói "xong rồi", nó không nói rằng chạm vào sẽ mở ảnh ra.
              */}
              <Ionicons
                name={filled ? (canOpen ? 'eye' : 'checkmark-circle') : 'camera-outline'}
                size={iconSize.lg}
                color={filled ? colors.success : colors.textMuted}
              />
              <Text
                col={filled && canOpen ? colors.success : colors.textMuted}
                fos={fontSize.label}
                fow={filled && canOpen ? fontWeight.semibold : fontWeight.regular}
                numberOfLines={1}
              >
                {filled && canOpen ? t('view') : label}
              </Text>
            </>
          )}
        </YStack>
      </Pressable>

      {filled && canOpen ? (
        <Text
          w={CELL}
          ta="center"
          col={colors.textMuted}
          fos={fontSize.label}
          numberOfLines={1}
          mt={2}
        >
          {label}
        </Text>
      ) : null}

      {filled && canManage ? (
        <XStack pos="absolute" top={-4} right={-4}>
          <IconButton
            icon="close-circle"
            label={t('remove')}
            onPress={() => onRemove(slot)}
            size={iconSize.md}
          />
        </XStack>
      ) : null}
    </YStack>
  );
});

