import { Ionicons } from '@expo/vector-icons';
import type { ChatMessage, MessageAttachment } from '@/features/chat/api';
import { CHAT_SEND_STATE, type ChatSendState } from '@xeprime/domain';
import { Image } from 'expo-image';
import { memo, useState } from 'react';
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { chatDebug } from '@/lib/chat-debug';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/**
 * Cạnh dài nhất của một ảnh đính kèm — đúng `max-width/max-height: 200px` của web.
 *
 * Là TRẦN, không phải kích thước cố định: xem `attachmentBox`.
 */
const ATTACHMENT_MAX = 200;

/**
 * Khung vẽ cho một ảnh đính kèm, theo tỉ lệ THẬT của nó.
 *
 * Web đặt `max-width`/`max-height` nên thẻ `img` tự co theo tỉ lệ gốc; app thì đặt cứng
 * 180×180 kèm `contentFit="cover"` — mọi ảnh bị CẮT thành hình vuông, ảnh dọc mất hẳn đầu và
 * chân. Đó là chỗ hai client nhìn ra hai bức ảnh khác nhau từ cùng một tệp.
 *
 * React Native không biết tỉ lệ ảnh trước khi tải xong, nên nơi gọi đọc nó từ `onLoad` của
 * `expo-image`; trong lúc chờ thì ô vuông là phỏng đoán ít sai nhất.
 */
/**
 * Tỉ lệ đã đo được, nhớ theo URL và sống suốt phiên chạy.
 *
 * Không có nó thì mỗi lần mở lại thread, mọi ảnh bắt đầu ở ô vuông 200×200 rồi NHẢY sang đúng
 * tỉ lệ khi tải xong — một cú giật layout cho mỗi ảnh, mỗi lần vào. Ảnh đã ở trong bộ nhớ đệm
 * của `expo-image` nên nó hiện gần như tức thì, và cú nhảy càng lộ.
 *
 * `Map` ở phạm vi module chứ không phải state: nó là dữ liệu về TỆP, không phải về màn hình, và
 * hai bong bóng cùng trỏ một ảnh thì dùng chung một số đo. Không cần dọn — khoá là URL R2, số
 * lượng chặn bởi số ảnh người dùng thật sự xem trong một phiên.
 */
const ratioCache = new Map<string, number>();

export function attachmentBox(ratio: number | null): { width: number; height: number } {
  if (!ratio || !Number.isFinite(ratio) || ratio <= 0) {
    return { width: ATTACHMENT_MAX, height: ATTACHMENT_MAX };
  }
  return ratio >= 1
    ? { width: ATTACHMENT_MAX, height: Math.round(ATTACHMENT_MAX / ratio) }
    : { width: Math.round(ATTACHMENT_MAX * ratio), height: ATTACHMENT_MAX };
}

/** Bề ngang tối đa của một bong bóng. Web dùng 74% trên cột hẹp; màn 360dp chịu được rộng hơn. */
const BUBBLE_MAX_WIDTH = '82%';

/** Ảnh xe trong thẻ ngữ cảnh — bằng `Avatar size={40}` mà web dùng ở cùng chỗ. */
const VEHICLE_THUMB = 40;

/**
 * Bề ngang bong bóng: co theo nội dung, TRỪ khi có thẻ xe.
 *
 * Tách thành hàm để khoá được bằng test. Trong Yoga, bề rộng của một cột là bề rộng của đứa con
 * RỘNG NHẤT, mà một đứa con `flex: 1` không đóng góp gì vào phép đo đó — nên thẻ xe (một hàng
 * `ảnh + cột chữ f={1}`) nằm trong một bong bóng chỉ chứa chữ "aloo" sẽ bị bóp còn đúng bề rộng
 * chữ "aloo", cột tên xe về 0px, và cái thẻ hiện ra thành một ô trắng chỉ có ảnh.
 *
 * `width` cho nó một số đo có thật để chia, và cũng là thứ web làm — ở đó thẻ xe chiếm trọn bề
 * ngang bong bóng.
 */
export function bubbleSizeStyle(hasVehicle: boolean): { width: string } | { maxWidth: string } {
  return hasVehicle ? { width: BUBBLE_MAX_WIDTH } : { maxWidth: BUBBLE_MAX_WIDTH };
}

export interface MessageBubbleProps {
  text: string | null;
  attachments: MessageAttachment[];
  sentAt: string;
  mine: boolean;
  state: ChatSendState;
  /** Tên người gửi — chỉ truyền khi CẦN phân biệt (nhiều người cùng ở phía bên kia). */
  senderName?: string | null;
  /** Vị trí trong nhóm tin liên tiếp — chỉ đổi góc bo và khoảng hở, không đổi nội dung. */
  firstOfGroup?: boolean;
  lastOfGroup?: boolean;
  /** Xe tin nhắn này nói về — thẻ ngữ cảnh, bấm vào mở tin đăng. */
  vehicle?: ChatMessage['vehicle'];
  /** Khoá idempotency của tin — chỉ tin do CHÍNH người dùng gửi mới có. */
  clientMessageId?: string | null;
  onPressImage: (url: string) => void;
  onPressVehicle?: (vehicleId: string) => void;
  /*
   * Nhận `clientMessageId` thay vì đóng gói sẵn trong closure.
   *
   * Nơi gọi nằm trong `renderItem` của một `FlatList`, nên một closure `() => retry(id)` là một
   * hàm MỚI ở mỗi lần render — và `memo` không bao giờ khớp cho đúng những tin của chính mình.
   */
  onRetry?: (clientMessageId: string) => void;
  onDiscard?: (clientMessageId: string) => void;
}

/**
 * Một bong bóng tin nhắn.
 *
 * Phía nào là "của tôi" do NƠI GỌI quyết định bằng `isOwnSideMessage` của `@xeprime/domain` —
 * component này chỉ vẽ. Trộn phép so đó vào đây là chép lại một luật đã có chủ.
 */
/**
 * Hai bong bóng có cần vẽ lại không.
 *
 * `memo` mặc định so theo THAM CHIẾU, và điều đó vô dụng ở đây: `mergeThreadMessages` dựng lại
 * `{ message, state }` cho MỌI tin ở mỗi lượt hoà giải, nên `attachments` luôn là một mảng mới
 * dù nội dung y hệt. Kết quả: cả ba mươi bong bóng vẽ lại sau mỗi nhịp poll (5–25 giây), kể cả
 * khi không có gì đổi.
 *
 * So theo GIÁ TRỊ giải đúng chuyện đó. Đính kèm so bằng URL — đó là danh tính của một tệp trên
 * R2, và số byte/tên tệp không đổi nếu URL không đổi.
 *
 * Handler KHÔNG so ở đây được nếu chúng không ổn định; nơi gọi phải bọc `useCallback` — đó là
 * lý do `onRetry`/`onDiscard` nhận `clientMessageId` thay vì đóng gói sẵn trong closure.
 */
function sameBubble(a: MessageBubbleProps, b: MessageBubbleProps): boolean {
  return (
    a.text === b.text &&
    a.sentAt === b.sentAt &&
    a.mine === b.mine &&
    a.state === b.state &&
    a.senderName === b.senderName &&
    a.firstOfGroup === b.firstOfGroup &&
    a.lastOfGroup === b.lastOfGroup &&
    a.clientMessageId === b.clientMessageId &&
    a.vehicle?.id === b.vehicle?.id &&
    a.onRetry === b.onRetry &&
    a.onDiscard === b.onDiscard &&
    a.onPressImage === b.onPressImage &&
    a.onPressVehicle === b.onPressVehicle &&
    sameAttachments(a.attachments, b.attachments)
  );
}

/** Đính kèm coi là KHÔNG đổi khi cùng số lượng và cùng bộ URL, đúng thứ tự. */
export function sameAttachments(
  a: readonly MessageAttachment[],
  b: readonly MessageAttachment[],
): boolean {
  return a.length === b.length && a.every((item, i) => item.url === b[i]?.url);
}

export const MessageBubble = memo(function MessageBubble({
  text,
  attachments,
  sentAt,
  mine,
  state,
  senderName,
  firstOfGroup = true,
  lastOfGroup = true,
  clientMessageId,
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

  /*
   * Góc "đuôi": ba góc bo lớn, riêng góc sát mép người gửi thu nhỏ lại khi bong bóng còn dính
   * vào bong bóng kế tiếp cùng nhóm. Đây là thứ làm một chồng tin đọc thành MỘT lượt nói thay
   * vì bốn ô rời — và nó thay được cho việc lặp lại tên người gửi ở từng dòng.
   *
   * Chỉ là TRÌNH BÀY: việc gộp nhóm vẫn do `groupThreadMessages` của `@xeprime/domain` quyết,
   * cùng hàm web gọi. Web vẽ bốn góc bằng nhau vì ở đó bong bóng nằm trong một cột hẹp trên màn
   * rộng; trên màn 360dp thì chồng tin chiếm gần hết bề ngang và cần dấu hiệu nhóm rõ hơn.
   */
  const outerTop = firstOfGroup ? radius.lg : radius.sm;
  const outerBottom = lastOfGroup ? radius.lg : radius.sm;
  const tail = mine
    ? { borderTopRightRadius: outerTop, borderBottomRightRadius: outerBottom }
    : { borderTopLeftRadius: outerTop, borderBottomLeftRadius: outerBottom };

  return (
    <YStack
      ai={mine ? 'flex-end' : 'flex-start'}
      px={space.md}
      pt={firstOfGroup ? space.sm : 2}
      pb={2}
    >
      {senderName ? (
        <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.semibold} mb={2}>
          {senderName}
        </Text>
      ) : null}

      <YStack
        {...bubbleSizeStyle(Boolean(vehicle))}
        gap={space.xs}
        px={space.md}
        py={space.sm}
        br={radius.lg}
        {...tail}
        // Vàng nhạt, đúng `--xp-color-bg-sand` của web — mà token đó CHÍNH LÀ `color-primary-light`.
        // Trắng thì bong bóng tan vào nền màn hình (cũng gần trắng) và chỉ còn nhận ra nhờ cái bóng.
        bg={mine ? colors.primary : colors.primaryLight}
        borderWidth={1}
        borderColor={failed ? colors.danger : mine ? colors.primary : colors.border}
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
              alignSelf="stretch"
              gap={space.sm}
              px={space.sm}
              py={space.xs}
              br={radius.sm}
              // Nền TRẮNG để nổi khỏi bong bóng vàng nhạt; trên bong bóng của mình (vàng đậm)
              // nó cũng là màu tương phản nhất, nên một giá trị dùng được cho cả hai phía.
              bg={colors.surface}
            >
              {vehicle.imageUrl ? (
                <Image
                  source={{ uri: vehicle.imageUrl }}
                  style={styles.vehicleThumb}
                  contentFit="cover"
                />
              ) : null}
              {/* `minWidth={0}` để `numberOfLines` cắt được: thiếu nó, chữ dài đẩy thẻ tràn ra. */}
              <YStack f={1} minWidth={0}>
                <Text col={colors.textMuted} fos={fontSize.meta}>
                  {t('aboutVehicle')}
                </Text>
                <Text
                  col={colors.primaryActive}
                  fos={fontSize.label}
                  fow={fontWeight.semibold}
                  numberOfLines={2}
                >
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

        {/*
          Giờ gửi ở bậc CUỐI của thang chữ. Để ngang bậc `label` thì nó đọc ra như một câu thứ
          hai trong bong bóng — mắt dừng lại ở đó thay vì lướt qua.
        */}
        <XStack ai="center" jc="flex-end" gap={space.xs} mt={-2}>
          <Text
            col={failed ? colors.danger : mine ? colors.onPrimary : colors.textMuted}
            fos={fontSize.meta}
            fow={fontWeight.medium}
            opacity={mine && !failed ? 0.75 : 1}
          >
            {pending ? t('sending') : failed ? t('sendFailed') : fmt.time(sentAt)}
          </Text>
        </XStack>
      </YStack>

      {failed && clientMessageId ? (
        <XStack gap={space.md} pt={space.xs}>
          <Pressable
            onPress={() => onRetry?.(clientMessageId)}
            accessibilityRole="button"
            hitSlop={space.sm}
          >
            <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.semibold}>
              {t('retrySend')}
            </Text>
          </Pressable>
          <Pressable
            onPress={() => onDiscard?.(clientMessageId)}
            accessibilityRole="button"
            hitSlop={space.sm}
          >
            <Text col={colors.danger} fos={fontSize.label} fow={fontWeight.semibold}>
              {t('discard')}
            </Text>
          </Pressable>
        </XStack>
      ) : null}
    </YStack>
  );
}, sameBubble);

function Attachment({
  attachment,
  onPressImage,
}: {
  attachment: MessageAttachment;
  onPressImage: (url: string) => void;
}) {
  const t = useTranslations('Chat');
  /** Tỉ lệ ngang/dọc THẬT của ảnh — đo một lần rồi nhớ lại, xem `ratioCache`. */
  const [ratio, setRatio] = useState<number | null>(
    () => ratioCache.get(attachment.url) ?? null,
  );

  if (attachment.fileType?.startsWith('image/')) {
    return (
      <Pressable
        onPress={() => onPressImage(attachment.url)}
        accessibilityRole="imagebutton"
        accessibilityLabel={attachment.fileName ?? t('imageAlt')}
      >
        {/*
          Tỉ lệ nằm ở KHUNG BỌC, không ở chính `Image`.
          
          Đặt lên `Image` thì `style` của nó đổi ngay sau `onLoad` — và `expo-image` dựng lại nội
          dung view khi kích thước đổi, nên ảnh vừa hiện đã biến mất, để lại một ô rỗng đúng kích
          thước. Khung bọc co giãn được, còn `Image` giữ MỘT style bất biến suốt vòng đời.
        */}
        <View style={attachmentBox(ratio)}>
          <Image
            source={{ uri: attachment.url }}
            style={styles.image}
            onLoad={(event) => {
              const { width, height } = event.source;
              if (height <= 0) return;
              ratioCache.set(attachment.url, width / height);
              setRatio(width / height);
            }}
            onError={(event) => chatDebug.attachmentRenderFailed(event.error)}
            /*
             * `recyclingKey` là BẮT BUỘC trong danh sách: `FlatList` tái dùng ô, và không có
             * khoá này thì một ô được tái dùng vẫn giữ ảnh của tin CŨ cho tới khi ảnh mới tải
             * xong — hoặc giữ luôn nếu ảnh mới hỏng.
             */
            recyclingKey={attachment.url}
            // Khung đã ĐÚNG tỉ lệ ảnh nên `cover` không cắt gì; giữ nguyên giá trị web dùng.
            contentFit="cover"
            cachePolicy="memory-disk"
            transition={120}
          />
        </View>
      </Pressable>
    );
  }

  return (
    <Pressable
      onPress={() => void Linking.openURL(attachment.url)}
      accessibilityRole="button"
      accessibilityLabel={attachment.fileName ?? t('attachment')}
    >
      <XStack
        ai="center"
        gap={space.xs}
        px={space.sm}
        py={space.xs}
        br={radius.sm}
        bg={colors.surface}
      >
        <Ionicons name="document-outline" size={iconSize.sm} color={colors.textMuted} />
        <Text col={colors.text} fos={fontSize.label} numberOfLines={1}>
          {attachment.fileName ?? t('attachment')}
        </Text>
      </XStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  /**
   * BẤT BIẾN suốt vòng đời — kích thước do khung bọc quyết (`attachmentBox`).
   *
   * `expo-image` dựng lại nội dung view khi style đổi kích thước; để tỉ lệ ở đây thì ảnh biến
   * mất ngay sau `onLoad`, chừa lại một ô rỗng đúng kích thước.
   */
  image: {
    borderRadius: radius.sm,
    height: '100%',
    width: '100%',
  },
  vehicleThumb: {
    borderRadius: radius.sm,
    height: VEHICLE_THUMB,
    width: VEHICLE_THUMB,
  },
});
