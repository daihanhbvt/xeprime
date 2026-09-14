import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { chatDebug } from '@/lib/chat-debug';
import {
  ChatAttachmentRejectedError,
  IMAGE_SOURCE,
  pickImages,
  pickPdfFile,
  uploadAttachmentToR2,
  type PickedFile,
} from '@/lib/r2-image-upload';
import { chatApi } from '@/features/chat/api';
import {
  CHAT_ATTACHMENT_MAX_BYTES,
  CHAT_ATTACHMENT_MAX_COUNT,
  isPreviewableImage,
} from '@xeprime/types';
import { newClientMessageId } from '@xeprime/domain';
import type { IconName } from '@/components/ui/Chip';
import {
  colors,
  fieldFontSize,
  fontSize,
  fontWeight,
  iconSize,
  radius,
  sizing,
  space,
} from '@/theme/tokens';
import { FONT_FAMILY } from '@/theme/fonts';
import type { SendAttachment } from '../hooks/use-thread';
import type { PendingVehicleContext } from '../hooks/use-vehicle-context';

const MAX_ATTACHMENTS = CHAT_ATTACHMENT_MAX_COUNT;

/** Trần dung lượng ở dạng MB — suy TỪ hằng số byte, không gõ lại con số vào chuỗi dịch. */
const MAX_ATTACHMENT_MB = Math.floor(CHAT_ATTACHMENT_MAX_BYTES / 1024 / 1024);
const MAX_INPUT_HEIGHT = 110;

/**
 * Bề cao chung của ba khối trên hàng soạn tin — nút kẹp, ô nhập, nút gửi.
 *
 * 40 chứ không 48 (`sizing.touchTarget`): ba khối 48dp cộng đệm chiếm gần một phần tư màn 360dp
 * theo chiều dọc khi bàn phím đã mở. Vùng CHẠM vẫn đủ 48 — nút kẹp lấy bằng `hitSlop`, còn nút
 * gửi nằm ở góc dưới phải nên không có gì để bấm nhầm quanh nó.
 */
const SEND_SIZE = 40;
const TRAY_THUMB = 36;
const CONTEXT_THUMB = 36;

interface PendingAttachment {
  key: string;
  fileName: string;
  fileType: string;
  /** `uri` cục bộ để xem trước — chỉ có với ảnh; PDF hiện icon loại tệp. */
  previewUri: string | null;
  /** `null` khi đang tải; có giá trị khi đã lên R2 và sẵn sàng gắn vào tin. */
  uploaded: SendAttachment | null;
  failed: boolean;
}

/**
 * Ô soạn tin của app — cùng ba khối với `MessageComposer` của web, theo đúng thứ tự đó:
 * thẻ ngữ cảnh xe · khay đính kèm · hàng nhập.
 *
 * KHÔNG có `KeyboardAvoidingView` ở đây: màn thread đã bọc cả cây trong một cái (xem
 * `ChatThreadScreen`), và hai lớp tránh bàn phím lồng nhau thì phần đẩy cộng dồn — ô nhập bị hất
 * lên giữa màn hình. Quy tắc chung của app: khung chịu trách nhiệm bàn phím, không phải ô nhập.
 *
 * Tệp được tải lên NGAY khi chọn, không đợi bấm Gửi — y như web: người dùng gõ chú thích trong
 * lúc ảnh đang bay, và bấm Gửi khi đó chỉ ghép các URL đã có.
 */
export function ChatComposer({
  onSend,
  disabled,
  vehicleContext,
  onClearVehicleContext,
}: {
  onSend: (input: {
    text?: string;
    attachments?: SendAttachment[];
    vehicleId?: string;
  }) => Promise<void>;
  disabled?: boolean;
  /** Xe vừa mở chat từ tin đăng của nó — gắn vào câu ĐẦU TIÊN rồi thôi. */
  vehicleContext?: PendingVehicleContext | null;
  onClearVehicleContext?: () => void;
}) {
  const t = useTranslations('Chat');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  // Thiếu quyền thư viện ảnh cần một câu KHÁC câu lỗi chung — người dùng phải biết bật gì.
  const imageError = useImageErrorMessage(errorMessage);

  const [text, setText] = useState('');
  const [inputHeight, setInputHeight] = useState(0);
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);

  /*
   * Chốt chống gửi đôi bằng ref, không bằng state: `setBusy(true)` chỉ có hiệu lực ở lần render
   * sau, nên hai cú chạm nhanh vào nút gửi vẫn lọt qua một điều kiện đọc state. (Server cũng
   * idempotent theo `clientMessageId`, nhưng hai request thừa vẫn là hai request.)
   */
  const inFlight = useRef(false);

  const uploading = attachments.some((a) => a.uploaded === null && !a.failed);
  const ready = attachments.flatMap((a) => (a.uploaded ? [a.uploaded] : []));
  const canSend = !disabled && !busy && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = async () => {
    if (inFlight.current) return;
    const trimmed = text.trim();
    if (disabled || uploading || (!trimmed && ready.length === 0)) return;

    inFlight.current = true;
    setBusy(true);
    // Dọn ô nhập TRƯỚC khi await: tin đã nằm trong danh sách ở trạng thái `pending`, và giữ chữ
    // lại trong ô là mời người dùng gõ tiếp lên trên nội dung vừa gửi.
    setText('');
    setAttachments([]);

    try {
      await onSend({
        ...(trimmed ? { text: trimmed } : {}),
        ...(ready.length ? { attachments: ready } : {}),
        ...(vehicleContext ? { vehicleId: vehicleContext.id } : {}),
      });
      // Thẻ chỉ đi kèm câu ĐẦU TIÊN: những câu sau vẫn trong cùng chủ đề, lặp thẻ ở mỗi bong
      // bóng chỉ làm dòng hội thoại rối chứ không thêm thông tin.
      onClearVehicleContext?.();
    } catch (error) {
      // Tin đã chuyển sang `failed` kèm đủ nội dung để bấm gửi lại — chỉ cần nói ra.
      toast.showError(errorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const room = MAX_ATTACHMENTS - attachments.length;

  /*
   * Chạm trần thì NÓI RA, không khoá nút.
   *
   * Web khoá thẳng nút đính kèm ở trần (và vì thế câu `attachmentLimit` của nó gần như là chữ
   * chết). Ở đây nút vẫn bấm được và trả lời bằng chính câu đó: một biểu tượng xám 24dp trên
   * thanh soạn tin không giải thích được vì sao nó xám, còn trên web thì con trỏ hover và khay
   * tệp ngay bên cạnh đã nói hộ. Trần và câu chữ vẫn y nguyên — chỉ cách báo là khác.
   */
  const openPicker = () => {
    if (room <= 0) {
      toast.showError(t('attachmentLimit', { count: MAX_ATTACHMENTS }));
      return;
    }
    setPicking(true);
  };

  const addPhotos = async () => {
    setPicking(false);
    let picked;
    try {
      picked = await pickImages(IMAGE_SOURCE.LIBRARY, room);
    } catch (error) {
      // Huỷ trả mảng rỗng; chỉ TỪ CHỐI QUYỀN mới ném — và nó cần một câu khác hẳn.
      toast.showError(imageError(error));
      return;
    }

    /*
     * CẮT lại theo chỗ còn trống, y như `files.slice(0, room)` của web.
     *
     * `selectionLimit` là một ĐỀ NGHỊ gửi cho trình chọn của hệ điều hành, không phải bảo đảm:
     * intent chọn ảnh cũ của Android bỏ qua nó. Không cắt thì tệp thứ 7 đi thẳng vào khay và
     * server từ chối cả tin nhắn ở `@ArrayMaxSize`.
     */
    if (picked.length > room) toast.showError(t('attachmentLimit', { count: MAX_ATTACHMENTS }));
    for (const image of picked.slice(0, room)) startUpload(image);
  };

  const addFile = async () => {
    setPicking(false);
    const file = await pickPdfFile();
    if (file) startUpload(file);
  };

  const startUpload = (file: PickedFile) => {
    const key = newClientMessageId();
    const previewUri = isPreviewableImage(file.contentType) ? file.uri : null;
    const startedAt = Date.now();

    setAttachments((prev) => [
      ...prev,
      {
        key,
        fileName: file.fileName,
        fileType: file.contentType,
        previewUri,
        uploaded: null,
        failed: false,
      },
    ]);

    void uploadAttachmentToR2(file, (meta) => chatApi.presignAttachment(meta))
      .then((uploaded) => {
        chatDebug.attachmentUploadOk(uploaded.fileSize, Date.now() - startedAt);
        setAttachments((prev) => prev.map((a) => (a.key === key ? { ...a, uploaded } : a)));
      })
      .catch((error: unknown) => {
        chatDebug.attachmentUploadFailed(error, Date.now() - startedAt);
        /*
         * Tệp SAI ĐỊNH DẠNG hay QUÁ NẶNG thì gỡ hẳn khỏi khay: chọn lại cũng ra đúng tệp đó, nên
         * để nó nằm lại ở trạng thái "lỗi" chỉ mời người dùng bấm thử lại một việc không bao giờ
         * chạy. Lỗi MẠNG thì giữ dòng lại — bấm gỡ hoặc chọn lại đều là quyết định của họ.
         */
        const rejected = error instanceof ChatAttachmentRejectedError;
        setAttachments((prev) =>
          rejected
            ? prev.filter((a) => a.key !== key)
            : prev.map((a) => (a.key === key ? { ...a, failed: true } : a)),
        );
        toast.showError(
          rejected
            ? error.rejection === 'type'
              ? t('attachmentType')
              : t('attachmentTooLarge')
            : errorMessage(error),
        );
      });
  };

  const removeAttachment = (key: string) =>
    setAttachments((prev) => prev.filter((a) => a.key !== key));

  return (
    /* Nền, nét kẻ trên và lề đều do khung `footer` của `Screen` lo — xem chú thích ở hàng dưới. */
    <YStack>
      {vehicleContext ? (
        <XStack ai="center" gap={space.sm} pb={space.sm}>
          {vehicleContext.imageUrl ? (
            <Image
              source={{ uri: vehicleContext.imageUrl }}
              style={styles.contextThumb}
              contentFit="cover"
            />
          ) : null}
          <YStack f={1}>
            <Text col={colors.textMuted} fos={fieldFontSize.message}>
              {t('aboutVehicle')}
            </Text>
            <Text col={colors.text} fos={fieldFontSize.value} numberOfLines={1}>
              {vehicleContext.name}
            </Text>
          </YStack>
          <Pressable
            onPress={onClearVehicleContext}
            accessibilityRole="button"
            accessibilityLabel={t('clearVehicleContext')}
            hitSlop={space.sm}
          >
            <Ionicons name="close" size={iconSize.sm} color={colors.textMuted} />
          </Pressable>
        </XStack>
      ) : null}

      {attachments.length > 0 ? (
        <XStack gap={space.sm} pb={space.sm} flexWrap="wrap">
          {attachments.map((a) => (
            <XStack
              key={a.key}
              ai="center"
              gap={space.xs}
              px={space.sm}
              py={space.xs}
              br={radius.sm}
              bg={colors.surfaceMuted}
              bw={a.failed ? 1 : 0}
              bc={colors.danger}
              maxWidth="100%"
            >
              {a.previewUri ? (
                <Image
                  source={{ uri: a.previewUri }}
                  style={styles.trayThumb}
                  contentFit="cover"
                />
              ) : (
                <Ionicons name="document-outline" size={iconSize.sm} color={colors.textMuted} />
              )}

              <YStack flexShrink={1}>
                <Text col={colors.text} fos={fieldFontSize.message} numberOfLines={1}>
                  {a.fileName}
                </Text>
                {a.failed ? (
                  <Text col={colors.danger} fos={fieldFontSize.message}>
                    {t('uploadFailed')}
                  </Text>
                ) : a.uploaded ? null : (
                  <Text col={colors.textMuted} fos={fieldFontSize.message}>
                    {t('uploading')}
                  </Text>
                )}
              </YStack>

              <Pressable
                onPress={() => removeAttachment(a.key)}
                accessibilityRole="button"
                accessibilityLabel={t('removeAttachment', { name: a.fileName })}
                hitSlop={space.sm}
              >
                <Ionicons name="close" size={iconSize.sm} color={colors.textMuted} />
              </Pressable>
            </XStack>
          ))}
        </XStack>
      ) : null}

      {/*
        KHÔNG đệm gì thêm: khung `footer` của `Screen` đã cho 16dp mỗi chiều, và đệm dọc của nó
        là biên an toàn cho sai số `KeyboardAvoidingView` trên Android edge-to-edge — bỏ đi là
        bàn phím Samsung che mất hai phần ba ô nhập.

        Chỗ THỪA thật nằm ở lớp đệm TRÙNG mà bản trước cộng thêm ở đây: 8dp mỗi bên chồng lên
        16dp của khung, ăn 16dp bề ngang của chính ô nhập cho không việc gì.
      */}
      <XStack ai="flex-end" gap={space.xs}>
        <Pressable
          onPress={openPicker}
          disabled={disabled}
          accessibilityRole="button"
          accessibilityLabel={t('attach')}
          accessibilityState={{ disabled: Boolean(disabled) }}
          hitSlop={space.md}
          style={({ pressed }) => [styles.attachButton, pressed && styles.attachPressed]}
        >
          <Ionicons
            name="add-circle-outline"
            size={iconSize.lg}
            color={disabled ? colors.textDisabled : colors.primaryActive}
          />
        </Pressable>

        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={t('inputPlaceholder')}
          placeholderTextColor={colors.placeholder}
          accessibilityLabel={t('inputPlaceholder')}
          multiline
          editable={!disabled}
          // Ô cao dần theo nội dung nhưng có TRẦN: không có trần thì một tin dài đẩy hết khung
          // tin nhắn ra khỏi màn và người dùng gõ trong lúc không thấy hội thoại nữa.
          onContentSizeChange={(e) =>
            setInputHeight(Math.min(MAX_INPUT_HEIGHT, e.nativeEvent.contentSize.height))
          }
          style={[styles.input, inputHeight > 0 ? { height: inputHeight } : null]}
        />

        <Pressable
          onPress={() => void submit()}
          disabled={!canSend}
          accessibilityRole="button"
          accessibilityLabel={t('send')}
          accessibilityState={{ disabled: !canSend }}
          style={({ pressed }) => [
            styles.sendButton,
            !canSend && styles.sendButtonDisabled,
            canSend && pressed && styles.sendButtonPressed,
          ]}
        >
          {/*
            `send` (đặc) chứ không `send-outline`: trên nền gold một glyph rỗng chỉ còn vài nét
            mảnh. Lệch 1px sang phải cho cân — mũi tên giấy có trọng tâm nằm lệch trái.
          */}
          <Ionicons
            name="send"
            size={iconSize.sm}
            color={canSend ? colors.onPrimary : colors.textDisabled}
            style={styles.sendGlyph}
          />
        </Pressable>
      </XStack>

      {/*
        Web có MỘT nút mở hộp thoại tệp của hệ điều hành với `accept` gồm cả ảnh lẫn PDF. Native
        không có hộp thoại chung đó: ảnh phải qua trình chọn ảnh để NÉN trước khi gửi (một tấm
        12MP vượt trần 10MB), còn PDF qua trình chọn tài liệu. Hai mục ở đây phủ đúng bộ MIME mà
        `CHAT_ATTACHMENT_MIME_TYPES` cho phép, không hơn không kém.
      */}
      <BottomSheet open={picking} onClose={() => setPicking(false)} title={t('attach')}>
        <YStack>
          <PickerOption
            icon="images-outline"
            label={t('attachPhoto')}
            hint={t('attachPhotoHint', { count: MAX_ATTACHMENTS })}
            onPress={() => void addPhotos()}
          />
          <PickerOption
            icon="document-outline"
            label={t('attachFile')}
            hint={t('attachFileHint', { size: MAX_ATTACHMENT_MB })}
            onPress={() => void addFile()}
          />
        </YStack>
      </BottomSheet>
    </YStack>
  );
}

/**
 * Một lựa chọn trong tấm trượt đính kèm.
 *
 * Không dùng `Button` nữa: hai nút xếp chồng đọc ra như một biểu mẫu phải điền, trong khi đây
 * là một trình CHỌN — người dùng cần biết mỗi đường dẫn tới đâu và bị giới hạn gì trước khi
 * chạm. Dòng gợi ý nói ra đúng luật mà `validateChatAttachment` sẽ áp, nên một tệp bị từ chối
 * không còn là bất ngờ sau khi đã chờ tải lên.
 */
function PickerOption({
  icon,
  label,
  hint,
  onPress,
}: {
  icon: IconName;
  label: string;
  hint: string;
  onPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityHint={hint}
      style={({ pressed }) => [styles.option, pressed && styles.optionPressed]}
    >
      <XStack ai="center" gap={space.md}>
        {/* Ô tròn gold: cùng ngôn ngữ hình với nút gửi, nên hai thứ đọc ra là cùng một bộ. */}
        <YStack style={styles.optionIcon}>
          <Ionicons name={icon} size={iconSize.md} color={colors.primaryActive} />
        </YStack>

        <YStack f={1} gap={1}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {label}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.label} numberOfLines={2}>
            {hint}
          </Text>
        </YStack>

        <Ionicons name="chevron-forward" size={iconSize.sm} color={colors.textMuted} />
      </XStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  contextThumb: {
    borderRadius: radius.sm,
    height: CONTEXT_THUMB,
    width: CONTEXT_THUMB,
  },
  attachButton: {
    alignItems: 'center',
    borderRadius: radius.pill,
    height: SEND_SIZE,
    justifyContent: 'center',
    width: SEND_SIZE,
  },
  attachPressed: {
    backgroundColor: colors.primaryLight,
  },
  option: {
    borderRadius: radius.md,
    paddingHorizontal: space.sm,
    paddingVertical: space.sm,
  },
  optionIcon: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    height: sizing.touchTarget,
    justifyContent: 'center',
    width: sizing.touchTarget,
  },
  optionPressed: {
    backgroundColor: colors.surfaceMuted,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    /*
     * PHẢI khai tường minh: `TextInput` của React Native KHÔNG thừa kế font từ Tamagui, và cũng
     * không có khái niệm font kế thừa như CSS. Bỏ trống thì ô nhập chạy font HỆ ĐIỀU HÀNH (Roboto
     * trên Android, SF trên iOS) trong khi mọi chữ khác quanh nó là Be Vietnam Pro — hai họ chữ
     * cạnh nhau trong cùng một thanh, và đó chính là thứ trông "sai sai" mà không chỉ ra được.
     */
    fontFamily: FONT_FAMILY.body,
    // Bo TRÒN hẳn: ô chữ nhật bo nhẹ nằm cạnh hai nút tròn trông như ba thứ của ba bộ khác nhau.
    borderRadius: radius.pill,
    borderColor: colors.border,
    borderWidth: 1,
    color: colors.text,
    flex: 1,
    fontSize: fieldFontSize.value,
    maxHeight: MAX_INPUT_HEIGHT,
    minHeight: SEND_SIZE,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: SEND_SIZE,
    justifyContent: 'center',
    width: SEND_SIZE,
  },
  /**
   * Không gửi được thì ĐỔI MÀU, không phải giảm alpha.
   *
   * `opacity: 0.45` trên nền gold ra một mảng gold nhạt — mắt vẫn đọc là "nút gold", chỉ hơi
   * mờ, nên người dùng cứ bấm. Nền xám + glyph xám nói thẳng là chưa bấm được.
   */
  sendButtonDisabled: {
    backgroundColor: colors.surfaceMuted,
  },
  sendButtonPressed: {
    backgroundColor: colors.primaryActive,
  },
  sendGlyph: {
    marginLeft: 1,
  },
  trayThumb: {
    borderRadius: radius.sm,
    height: TRAY_THUMB,
    width: TRAY_THUMB,
  },
});
