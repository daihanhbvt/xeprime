import { Ionicons } from '@expo/vector-icons';
import { useRef, useState } from 'react';
import { Pressable, StyleSheet, TextInput } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useImageErrorMessage } from '@/lib/image-permission-message';
import { IMAGE_SOURCE, pickImages, uploadImageToR2 } from '@/lib/r2-image-upload';
import { chatApi } from '@xeprime/api-client';
import { CHAT_ATTACHMENT_MAX_COUNT } from '@xeprime/types';
import { colors, fieldFontSize, iconSize, radius, sizing, space } from '@/theme/tokens';
import type { SendAttachment } from '../hooks/use-thread';

const MAX_ATTACHMENTS = CHAT_ATTACHMENT_MAX_COUNT;
const MAX_INPUT_HEIGHT = 110;

interface PendingAttachment {
  key: string;
  uri: string;
  uploaded: SendAttachment | null;
}

/**
 * Ô soạn tin của app.
 *
 * KHÔNG có `KeyboardAvoidingView` ở đây: màn thread đã bọc cả cây trong một cái (xem
 * `ChatThreadScreen`), và hai lớp tránh bàn phím lồng nhau thì phần đẩy cộng dồn — ô nhập bị hất
 * lên giữa màn hình. Quy tắc chung của app: khung chịu trách nhiệm bàn phím, không phải ô nhập.
 */
export function ChatComposer({
  onSend,
  disabled,
}: {
  onSend: (input: { text?: string; attachments?: SendAttachment[] }) => Promise<void>;
  disabled?: boolean;
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

  /*
   * Chốt chống gửi đôi bằng ref, không bằng state: `setBusy(true)` chỉ có hiệu lực ở lần render
   * sau, nên hai cú chạm nhanh vào nút gửi vẫn lọt qua một điều kiện đọc state.
   */
  const inFlight = useRef(false);

  const uploading = attachments.some((a) => !a.uploaded);
  const ready = attachments.flatMap((a) => (a.uploaded ? [a.uploaded] : []));
  const canSend = !disabled && !busy && !uploading && (text.trim().length > 0 || ready.length > 0);

  const submit = async () => {
    if (inFlight.current) return;
    const trimmed = text.trim();
    if (disabled || uploading || (!trimmed && ready.length === 0)) return;

    inFlight.current = true;
    setBusy(true);
    // Dọn ô nhập TRƯỚC khi await: tin đã nằm trong danh sách ở trạng thái `pending`.
    setText('');
    setAttachments([]);

    try {
      await onSend({
        ...(trimmed ? { text: trimmed } : {}),
        ...(ready.length ? { attachments: ready } : {}),
      });
    } catch (error) {
      // Tin đã chuyển sang `failed` kèm đủ nội dung để bấm gửi lại — chỉ cần nói ra.
      toast.showError(errorMessage(error));
    } finally {
      inFlight.current = false;
      setBusy(false);
    }
  };

  const attach = async () => {
    const room = MAX_ATTACHMENTS - attachments.length;
    if (room <= 0) {
      toast.showError(t('attachmentLimit', { count: MAX_ATTACHMENTS }));
      return;
    }

    let picked;
    try {
      picked = await pickImages(IMAGE_SOURCE.LIBRARY, room);
    } catch (error) {
      // Huỷ trả mảng rỗng; chỉ TỪ CHỐI QUYỀN mới ném — và nó cần một câu khác hẳn.
      toast.showError(imageError(error));
      return;
    }

    for (const image of picked) {
      const key = `${Date.now()}-${image.uri}`;
      setAttachments((prev) => [...prev, { key, uri: image.uri, uploaded: null }]);

      void uploadImageToR2(image, (meta) => chatApi.presignAttachment(meta))
        .then((url) => {
          setAttachments((prev) =>
            prev.map((a) =>
              a.key === key
                ? {
                    ...a,
                    uploaded: {
                      url,
                      fileType: image.contentType,
                      fileName: image.fileName,
                      // Số byte THẬT đã được `uploadImageToR2` đo lúc mở file; ở đây chỉ cần một
                      // con số hợp lệ cho metadata, không phải cho chữ ký.
                      fileSize: 0,
                    },
                  }
                : a,
            ),
          );
        })
        .catch((error: unknown) => {
          setAttachments((prev) => prev.filter((a) => a.key !== key));
          toast.showError(errorMessage(error));
        });
    }
  };

  return (
    <YStack bg={colors.surface} borderTopWidth={1} borderColor={colors.borderSubtle}>
      {attachments.length > 0 ? (
        <XStack gap={space.sm} px={space.md} pt={space.sm} flexWrap="wrap">
          {attachments.map((a) => (
            <XStack
              key={a.key}
              ai="center"
              gap={space.xs}
              px={space.sm}
              py={space.xs}
              br={radius.sm}
              bg={colors.surfaceMuted}
            >
              <Ionicons
                name={a.uploaded ? 'image-outline' : 'cloud-upload-outline'}
                size={iconSize.sm}
                color={colors.textMuted}
              />
              <Text col={colors.textMuted} fos={fieldFontSize.message}>
                {a.uploaded ? t('attachment') : t('sending')}
              </Text>
              <Pressable
                onPress={() => setAttachments((prev) => prev.filter((x) => x.key !== a.key))}
                accessibilityRole="button"
                accessibilityLabel={t('discard')}
                hitSlop={space.sm}
              >
                <Ionicons name="close" size={iconSize.sm} color={colors.textMuted} />
              </Pressable>
            </XStack>
          ))}
        </XStack>
      ) : null}

      <XStack ai="flex-end" gap={space.sm} px={space.md} py={space.sm}>
        <Pressable
          onPress={() => void attach()}
          disabled={disabled || attachments.length >= MAX_ATTACHMENTS}
          accessibilityRole="button"
          accessibilityLabel={t('attach')}
          hitSlop={space.xs}
          style={styles.iconButton}
        >
          <Ionicons name="attach-outline" size={iconSize.md} color={colors.textMuted} />
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
          style={[styles.sendButton, !canSend && styles.sendButtonDisabled]}
        >
          <Ionicons name="send" size={iconSize.sm} color={colors.onPrimary} />
        </Pressable>
      </XStack>
    </YStack>
  );
}

const styles = StyleSheet.create({
  iconButton: {
    alignItems: 'center',
    height: sizing.touchTarget,
    justifyContent: 'center',
    width: sizing.touchTarget,
  },
  input: {
    backgroundColor: colors.surfaceMuted,
    borderRadius: radius.md,
    color: colors.text,
    flex: 1,
    fontSize: fieldFontSize.value,
    maxHeight: MAX_INPUT_HEIGHT,
    minHeight: sizing.touchTarget,
    paddingHorizontal: space.md,
    paddingVertical: space.sm,
  },
  sendButton: {
    alignItems: 'center',
    backgroundColor: colors.primary,
    borderRadius: radius.pill,
    height: sizing.touchTarget,
    justifyContent: 'center',
    width: sizing.touchTarget,
  },
  sendButtonDisabled: {
    opacity: 0.45,
  },
});
