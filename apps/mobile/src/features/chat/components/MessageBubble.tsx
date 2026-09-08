import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage, MessageAttachment } from '@xeprime/api-client';
import { CHAT_SEND_STATE, type ChatSendState } from '@xeprime/domain';
import { Image } from 'expo-image';
import { memo } from 'react';
import { Linking, Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

const ATTACHMENT_SIZE = 180;

export interface MessageBubbleProps {
  text: string | null;
  attachments: MessageAttachment[];
  sentAt: string;
  mine: boolean;
  state: ChatSendState;
  /** Tên người gửi — chỉ truyền khi CẦN phân biệt (nhiều người cùng ở phía bên kia). */
  senderName?: string | null;
  /** Xe tin nhắn này nói về — thẻ ngữ cảnh, bấm vào mở tin đăng. */
  vehicle?: ChatMessage['vehicle'];
  onPressImage: (url: string) => void;
  onPressVehicle?: (vehicleId: string) => void;
  onRetry?: () => void;
  onDiscard?: () => void;
}

/**
 * Một bong bóng tin nhắn.
 *
 * Phía nào là "của tôi" do NƠI GỌI quyết định bằng `isOwnSideMessage` của `@xeprime/domain` —
 * component này chỉ vẽ. Trộn phép so đó vào đây là chép lại một luật đã có chủ.
 */
export const MessageBubble = memo(function MessageBubble({
  text,
  attachments,
  sentAt,
  mine,
  state,
  senderName,
  vehicle,
  onPressImage,
  onPressVehicle,
  onRetry,
  onDiscard,
}: MessageBubbleProps) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  const pending = state === CHAT_SEND_STATE.PENDING;
  const failed = state === CHAT_SEND_STATE.FAILED;

  return (
    <YStack ai={mine ? 'flex-end' : 'flex-start'} px={space.md} py={2}>
      {senderName ? (
        <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold} mb={2}>
          {senderName}
        </Text>
      ) : null}

      <YStack
        maxWidth="82%"
        gap={space.xs}
        px={space.sm}
        py={space.sm}
        br={radius.md}
        bg={mine ? colors.primary : colors.surfaceMuted}
        borderWidth={failed ? 1 : 0}
        borderColor={colors.danger}
        // Tin đang bay mờ đi — phân biệt được với tin server đã nhận mà vẫn đọc được.
        opacity={pending ? 0.65 : 1}
      >
        {vehicle ? (
          <Pressable
            onPress={() => onPressVehicle?.(vehicle.id)}
            accessibilityRole="button"
            accessibilityLabel={vehicle.name}
          >
            <XStack
              ai="center"
              gap={space.xs}
              px={space.sm}
              py={space.xs}
              br={radius.sm}
              bg={colors.surface}
            >
              {vehicle.imageUrl ? (
                <Image source={{ uri: vehicle.imageUrl }} style={styles.vehicleThumb} contentFit="cover" />
              ) : null}
              <YStack f={1}>
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('aboutVehicle')}
                </Text>
                <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.semibold} numberOfLines={1}>
                  {vehicle.name}
                </Text>
              </YStack>
            </XStack>
          </Pressable>
        ) : null}

        {text ? (
          <Text col={mine ? colors.onPrimary : colors.text} fos={fontSize.bodySm}>
            {text}
          </Text>
        ) : null}

        {attachments.map((attachment, index) => (
          <Attachment
            key={`${sentAt}-${index}`}
            attachment={attachment}
            onPressImage={onPressImage}
          />
        ))}

        <XStack ai="center" jc="flex-end" gap={space.xs}>
          <Text
            col={failed ? colors.danger : mine ? colors.onPrimary : colors.textMuted}
            fos={fontSize.label}
          >
            {pending ? t('sending') : failed ? t('sendFailed') : fmt.time(sentAt)}
          </Text>
        </XStack>
      </YStack>

      {failed ? (
        <XStack gap={space.md} pt={space.xs}>
          <Pressable onPress={onRetry} accessibilityRole="button" hitSlop={space.sm}>
            <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.semibold}>
              {t('retrySend')}
            </Text>
          </Pressable>
          <Pressable onPress={onDiscard} accessibilityRole="button" hitSlop={space.sm}>
            <Text col={colors.danger} fos={fontSize.label} fow={fontWeight.semibold}>
              {t('discard')}
            </Text>
          </Pressable>
        </XStack>
      ) : null}
    </YStack>
  );
});

function Attachment({
  attachment,
  onPressImage,
}: {
  attachment: MessageAttachment;
  onPressImage: (url: string) => void;
}) {
  const t = useTranslations('Chat');

  if (attachment.fileType?.startsWith('image/')) {
    return (
      <Pressable
        onPress={() => onPressImage(attachment.url)}
        accessibilityRole="imagebutton"
        accessibilityLabel={attachment.fileName ?? t('imageAlt')}
      >
        <Image
          source={{ uri: attachment.url }}
          style={styles.image}
          contentFit="cover"
          cachePolicy="memory-disk"
          transition={120}
        />
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => void Linking.openURL(attachment.url)}
      accessibilityRole="button"
      accessibilityLabel={attachment.fileName ?? t('attachment')}
    >
      <XStack ai="center" gap={space.xs} px={space.sm} py={space.xs} br={radius.sm} bg={colors.surface}>
        <Ionicons name="document-outline" size={iconSize.sm} color={colors.textMuted} />
        <Text col={colors.text} fos={fontSize.label} numberOfLines={1}>
          {attachment.fileName ?? t('attachment')}
        </Text>
      </XStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  image: {
    borderRadius: radius.sm,
    height: ATTACHMENT_SIZE,
    width: ATTACHMENT_SIZE,
  },
  vehicleThumb: {
    borderRadius: radius.sm,
    height: 36,
    width: 36,
  },
});
