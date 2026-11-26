import { memo, useCallback, useMemo, useState } from 'react';
import { CardTitle } from '@/components/ui/CardTitle';
import { Ionicons } from '@/components/icons/Ionicons';
import { Image } from 'expo-image';
import { ActivityIndicator, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  HANDOVER_PHOTO_SLOT,
  handoverExteriorSlotsFor,
  handoverPhotoSlotsFor,
  PERMISSION,
  type HandoverPhotoSlot,
  type HandoverType,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { ActionSheetButtons } from '@/components/ui/ActionSheetButtons';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { PhotoViewer } from '@/components/ui/PhotoViewer';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
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
import { HandoverSlotSample } from './HandoverSlotSample';
import { getErrorMessage } from '@/lib/get-error-message';

/** Ô 96×96: đủ để nhận ra góc chụp, và năm ô vẫn xuống hai hàng trên máy hẹp nhất. */
const CELL = 96;
/** Hình mẫu góc chụp trong ô trống (tỉ lệ 120×72 của web). */
/** Hình ô trống vuông 66 - đúng khung "Empty State" của Figma (cao bằng ô 66). */
const SAMPLE_WIDTH = 66;

/*
  Ảnh lấp KÍN ô — `<Image>` không nhận prop style của Tamagui, nên kích thước ở `StyleSheet`.

  `position: absolute` để ảnh nằm dưới lớp huy hiệu con mắt mà không đẩy nó đi đâu; ô cha đã
  `overflow: hidden` nên ảnh bị bo theo góc của ô.
*/
const styles = StyleSheet.create({
  thumbnail: StyleSheet.absoluteFillObject,
});

/**
 * Dạng `row` (web `.slotRow`, khổ ≤767): lưới `auto-fill minmax(120px, 1fr)` khe `space-md`, ô tỉ
 * lệ 188/120, nhãn 14 màu chữ DƯỚI ô.
 */
const ROW_MIN_CELL = 96;
// Figma "Frame 815" (16/11/2026): lưới 3 cột, ô 103 × 88, cách 12.
const ROW_GAP = 12;
const ROW_RATIO = 88 / 103;

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
  vehicleType,
  handover,
  ensureHandover,
  variant = 'grid',
  disabled = false,
  highlightSlots,
}: {
  bookingId: string;
  /**
   * Góc vừa bị cảnh báo "chưa đủ ảnh" (web `highlightSlots`, 25/11/2026) — ô CÒN TRỐNG trong tập này
   * viền đỏ cho tới khi chụp.
   */
  highlightSlots?: ReadonlySet<string> | undefined;
  /**
   * `grid` (mặc định - màn bổ sung biên bản): hai nhóm có tiêu đề, ngoại thất và đồng hồ KM.
   * `row` (chi tiết đơn - web `variant="row"`): mọi góc của loại xe chung một lưới, nhãn dưới ảnh.
   */
  variant?: 'grid' | 'row';
  /**
   * Chỉ xem - không chụp, không gỡ (web `disabled={!editable}`: đơn đã khép, hoặc tab "sau khi
   * nhận xe" khi chưa giao xe). Quyền vẫn do server chặn lớp cuối.
   */
  disabled?: boolean;
  type: HandoverType;
  /**
   * Loại xe của đơn — quyết bộ góc chụp (`handoverPhotoSlotsFor`): ô tô 5 góc, xe máy 3 góc
   * (trước · sau · Odo). Thứ tự cố định để hai bên nhìn CÙNG một góc.
   */
  vehicleType: string;
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
  const colors = useColors();
  const t = useTranslations('Bookings.handover.photos');
  // Ổn định theo loại xe - là dependency của `fileIds` bên dưới.
  const SLOTS = useMemo(() => handoverPhotoSlotsFor(vehicleType), [vehicleType]);
  const toast = useAppToast();
  const permissions = usePermissions();

  const attach = useAttachHandoverPhoto(bookingId, type);
  const remove = useRemoveHandoverPhoto(bookingId, type);

  const [picking, setPicking] = useState<HandoverPhotoSlot | null>(null);
  const [busySlot, setBusySlot] = useState<HandoverPhotoSlot | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  /** Ô đang chờ xác nhận GỠ — `null` là không hỏi ai cả. */
  const [removingSlot, setRemovingSlot] = useState<HandoverPhotoSlot | null>(null);
  /** Ô ĐÃ CÓ ẢNH đang mở tấm "Xem / Gỡ / Đổi ảnh" (người dùng 20/11/2026). */
  const [managingSlot, setManagingSlot] = useState<HandoverPhotoSlot | null>(null);
  const domainLabel = useDomainLabel();

  const canManagePermission = permissions.has(PERMISSION.HANDOVER_MANAGE);
  const canManage = canManagePermission && !disabled;
  const [rowWidth, setRowWidth] = useState(0);
  // Biến thể lưới: luôn 3 cột đều (Figma Frame 815) cho cả giao/nhận xe, ô tô lẫn xe máy.
  const rowColumns =
    variant === 'grid'
      ? 3
      : Math.max(1, Math.floor((rowWidth + ROW_GAP) / (ROW_MIN_CELL + ROW_GAP)));
  /*
   * Làm tròn XUỐNG: bề rộng lẻ (vd. 97,33pt × 3 + 2 khe = đúng bằng hàng) bị Android làm tròn
   * điểm ảnh lên, tổng vượt hàng ~1px và ô cuối rớt dòng - hàng 3 ô thành 2 ô dù còn trống gần
   * đủ một ô (người dùng báo 19/11/2026). Hụt dưới 1pt mỗi ô thì mắt không thấy.
   */
  const rowCellWidth =
    rowWidth > 0 ? Math.floor((rowWidth - ROW_GAP * (rowColumns - 1)) / rowColumns) : 0;
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
        // Web nói câu nguyên văn của server ở ô ảnh hỏng (getErrorMessage).
        toast.showError(getErrorMessage(error));
        return;
      }

      attach.mutate(
        { slot, photo },
        {
          // Ảnh mất khi upload hỏng: nói thẳng ra để người dùng chụp lại, đừng im lặng.
          onError: (error) => {
            reportUploadFailure('attach', slot, photo, error);
            // Web nói câu nguyên văn của server ở ô ảnh hỏng (getErrorMessage).
            toast.showError(getErrorMessage(error));
          },
          onSettled: () => setBusySlot(null),
        },
      );
    },
    [attach, ensureHandover, toast],
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
        toast.showError(getErrorMessage(error));
      } finally {
        setBusySlot(null);
      }
    },
    [bookingId, taken, toast, type],
  );

  // Chuyển `open` (async) thành một handler void ổn định — `PhotoSlot` chỉ cần bấm-là-chạy.
  const openSlot = useCallback((slot: HandoverPhotoSlot) => void open(slot), [open]);

  const manageSlot = useCallback((slot: HandoverPhotoSlot) => setManagingSlot(slot), []);

  /*
   * Danh sách `fileId` phải ỔN ĐỊNH giữa các lần render: nó là dependency của `useQueries`, và
   * một mảng dựng lại mỗi nhịp sẽ dựng lại cả bộ query — tức là xin vé mới liên tục.
   */
  const fileIds = useMemo(
    () =>
      SLOTS.map((slot) => taken.get(slot)?.fileId).filter(
        (fileId): fileId is string => typeof fileId === 'string',
      ),
    [SLOTS, taken],
  );

  const photoUrls = useHandoverPhotoUrls(bookingId, type, fileIds, canViewFiles);

  /*
   * Thiếu cả quyền chụp lẫn quyền xem tệp: vẫn dựng lưới KHOÁ như web (`disabled`) - người dùng
   * còn biết góc nào đã chụp. Ô không mở được, không chụp được.
   */

  const renderSlot = (slot: HandoverPhotoSlot) => (
    <PhotoSlot
      key={slot}
      slot={slot}
      filled={taken.has(slot)}
      flagged={!taken.has(slot) && busySlot !== slot && Boolean(highlightSlots?.has(slot))}
      busy={busySlot === slot}
      canOpen={canViewFiles && Boolean(taken.get(slot)?.fileId)}
      thumbnailUrl={photoUrls[taken.get(slot)?.fileId ?? '']}
      canManage={canManage}
      onCapture={setPicking}
      onOpen={openSlot}
      onManage={manageSlot}
      width={rowCellWidth}
      height={rowCellWidth * ROW_RATIO}
      labelBelow
    />
  );

  return (
    <YStack gap={space.sm}>
      {variant === 'row' ? (
        <XStack
          flexWrap="wrap"
          gap={ROW_GAP}
          onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
        >
          {rowWidth > 0 ? handoverPhotoSlotsFor(vehicleType).map(renderSlot) : null}
        </XStack>
      ) : (
        <YStack gap={space.sm}>
          <CardTitle icon="camera-outline">{t('title')}</CardTitle>

      {/*
        Hai phần như web (`HandoverPhotoGrid` biến thể lưới): góc ngoại thất theo loại xe, rồi
        "Ảnh đồng hồ KM" đứng riêng - Odo là ảnh bằng chứng KM, không phải một góc thân xe.
      */}
          <XStack
            flexWrap="wrap"
            gap={ROW_GAP}
            onLayout={(event) => setRowWidth(event.nativeEvent.layout.width)}
          >
            {rowWidth > 0 ? handoverExteriorSlotsFor(vehicleType).map(renderSlot) : null}
          </XStack>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} mt={space.xs}>
            {t('odometerTitle')}
          </Text>
          <XStack flexWrap="wrap" gap={ROW_GAP}>
            {rowWidth > 0 ? renderSlot(HANDOVER_PHOTO_SLOT.ODOMETER) : null}
          </XStack>
        </YStack>
      )}

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

      {/*
        Ô đã có ảnh: chạm mở tấm thao tác - xem ảnh, gỡ ảnh, ĐỔI ảnh (server THAY ảnh cũ của cùng
        góc khi tải lên lại, nên đổi ảnh = chụp/chọn ảnh mới cho đúng ô đó).
      */}
      <BottomSheet
        open={managingSlot !== null}
        onClose={() => setManagingSlot(null)}
        title={managingSlot ? domainLabel('handoverPhotoSlot', managingSlot) : ''}
        chrome="v2"
        headerDivider
      >
        <ActionSheetButtons
          actions={
            managingSlot
              ? [
                  ...(canViewFiles && taken.get(managingSlot)?.fileId
                    ? [
                        {
                          key: 'view',
                          label: t('view'),
                          onPress: () => {
                            setManagingSlot(null);
                            openSlot(managingSlot);
                          },
                        },
                      ]
                    : []),
                  {
                    key: 'remove',
                    label: t('remove'),
                    danger: true,
                    onPress: () => {
                      setManagingSlot(null);
                      setRemovingSlot(managingSlot);
                    },
                  },
                  {
                    key: 'replace',
                    label: t('replace'),
                    primary: true,
                    onPress: () => {
                      setManagingSlot(null);
                      setPicking(managingSlot);
                    },
                  },
                ]
              : []
          }
        />
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
            onError: (error) => toast.showError(getErrorMessage(error)),
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
 * Ô ĐÃ CÓ ẢNH: người lập biên bản chạm mở tấm "Xem / Gỡ / Đổi ảnh" (20/11/2026); gỡ vẫn hỏi lại
 * vì ảnh hiện trạng là bằng chứng. Người chỉ xem thì chạm mở ảnh.
 *
 * MEMO vì lưới re-render mỗi khi `busySlot`/`preview` đổi (một cú bấm ở một ô); không có nó thì
 * cả năm ô dựng lại theo, dù bốn ô còn lại không đổi gì. Ba handler nhận thẳng `slot` và đến từ
 * props ỔN ĐỊNH của cha (`setPicking`/`openSlot`/`manageSlot`, đều giữ nguyên danh tính giữa
 * các lần render) — memo chỉ có tác dụng khi props so sánh bằng nhau, và một closure dựng mới
 * mỗi render ở nơi gọi sẽ vô hiệu hoá nó ngay.
 */
/** Nút nổi góc ô ảnh bàn giao. */
const FLOAT_BTN = 28;

const PhotoSlot = memo(function PhotoSlot({
  slot,
  filled,
  flagged = false,
  busy,
  canOpen,
  canManage,
  thumbnailUrl,
  onCapture,
  onOpen,
  onManage,
  width = CELL,
  height = CELL,
  labelBelow = false,
}: {
  slot: HandoverPhotoSlot;
  filled: boolean;
  /** Ô trống vừa bị cảnh báo thiếu ảnh — viền đỏ (web `.flagged`). */
  flagged?: boolean;
  busy: boolean;
  canOpen: boolean;
  canManage: boolean;
  /** URL ký của chính tấm ảnh — vắng khi chưa xin được vé, hoặc không có quyền xem tệp. */
  thumbnailUrl: string | undefined;
  onCapture: (slot: HandoverPhotoSlot) => void;
  onOpen: (slot: HandoverPhotoSlot) => void;
  /** Ô đã có ảnh + có quyền lập biên bản: mở tấm "Xem / Gỡ / Đổi ảnh". */
  onManage: (slot: HandoverPhotoSlot) => void;
  width?: number;
  height?: number;
  /** Dạng `row` của web: nhãn 14 màu chữ nằm DƯỚI ô, ô viền `border-strong` nền `bg-muted`. */
  labelBelow?: boolean;
}) {
  const colors = useColors();
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
    ? canManage
      ? () => onManage(slot)
      : canOpen
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
        accessibilityLabel={filled && canOpen ? `${label} - ${t('view')}` : label}
        accessibilityState={{ checked: filled, disabled: !press || busy }}
      >
        <YStack
          w={width}
          h={height}
          br={radius.md}
          bw={1}
          /*
            Có ảnh rồi thì ô KHÔNG tô xanh nữa.

            Xanh lá là để nói "ô này xong rồi" — nhưng chính tấm ảnh đã nói điều đó, rõ hơn.
            Giữ thêm nền và viền xanh quanh ảnh chỉ làm lưới ồn và làm tấm ảnh trông như một
            nhãn trạng thái thay vì một tấm ảnh.
          */
          bg={filled && !thumbnail ? colors.successSurface : colors.background}
          // Ô trống KHÔNG viền, chỉ nền xám nhạt - Figma `24158:103039` (người dùng 20/11/2026).
          bc={flagged ? colors.danger : filled && !thumbnail ? colors.success : 'transparent'}
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
                w={FLOAT_BTN}
                h={FLOAT_BTN}
                br={FLOAT_BTN / 2}
                ai="center"
                jc="center"
                bg={colors.primary}
                bw={2}
                bc={colors.surface}
              >
                <Ionicons name={canManage ? 'create' : 'eye'} size={14} color={colors.onPrimary} />
              </XStack>
            </>
          ) : (
            <>
              {/*
                Chưa có ảnh để vẽ — hoặc ô còn trống, hoặc chưa xin được vé xem, hoặc không có
                quyền xem tệp. Ô đã có ảnh mà MỞ ĐƯỢC thì vẽ con MẮT chứ không phải dấu tích:
                dấu tích chỉ nói "xong rồi", nó không nói rằng chạm vào sẽ mở ảnh ra.
              */}
              {filled ? (
                <Ionicons
                  name={canOpen ? 'eye' : 'checkmark-circle'}
                  size={iconSize.lg}
                  color={colors.success}
                />
              ) : (
                // Ô trống: hình Figma "Empty State" (khung ảnh + dấu "+") chung mọi góc (20/11/2026).
                <HandoverSlotSample slot={slot} width={SAMPLE_WIDTH} />
              )}
              {/* Nút nổi góc ô: mắt = xem. Ô trống không cần máy ảnh - hình đã có dấu "+" (20/11/2026). */}
              {filled && (canOpen || canManage) ? (
                <XStack
                  pos="absolute"
                  bottom={6}
                  right={6}
                  w={FLOAT_BTN}
                  h={FLOAT_BTN}
                  br={FLOAT_BTN / 2}
                  ai="center"
                  jc="center"
                  bg={colors.primary}
                  bw={2}
                  bc={colors.surface}
                >
                  <Ionicons name={canManage ? 'create' : 'eye'} size={14} color={colors.onPrimary} />
                </XStack>
              ) : null}
              {labelBelow && !(filled && canOpen) ? null : (
                <Text
                  col={filled && canOpen ? colors.success : colors.textMuted}
                  fos={fontSize.label}
                  fow={filled && canOpen ? fontWeight.semibold : fontWeight.regular}
                  numberOfLines={1}
                >
                  {filled && canOpen ? t('view') : label}
                </Text>
              )}
            </>
          )}
        </YStack>
      </Pressable>

      {labelBelow ? (
        <Text w={width} ta="center" col={colors.text} fos={fontSize.body} numberOfLines={1} mt={2}>
          {label}
        </Text>
      ) : filled && canOpen ? (
        <Text
          w={width}
          ta="center"
          col={colors.textMuted}
          fos={fontSize.label}
          numberOfLines={1}
          mt={2}
        >
          {label}
        </Text>
      ) : null}

    </YStack>
  );
});
