import { Ionicons } from '@expo/vector-icons';
import { CHAT_SIDE } from '@xeprime/types';
import type { ConversationSummary } from '@/features/chat/api';
import { memo } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Avatar } from '@/components/ui/Avatar';
import { CountBadge } from '@/components/ui/CountBadge';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { layout } from '@/theme/layout';

/** Ảnh đại diện to hơn sàn chạm: nó là mỏ neo thị giác của cả dòng, không phải một icon. */
const AVATAR = 52;

/**
 * Một dòng trong danh sách tin nhắn.
 *
 * `memo` không phải trang trí: mỗi nhịp poll làm màn render lại, và không có nó thì cả danh sách
 * dựng lại theo dù không dòng nào đổi — thấy rõ thành giật khi vừa cuộn vừa tới nhịp hỏi tin.
 */
export const ConversationRow = memo(function ConversationRow({
  conversation,
  showRole,
  onPress,
}: {
  conversation: ConversationSummary;
  /**
   * Danh sách đang trộn HAI VAI (hộp thư hợp nhất) ⇒ mỗi dòng mang một nhãn vai.
   *
   * Prop chứ không suy từ dữ liệu: một hộp thư khách mà tình cờ chỉ có hội thoại khách vẫn là hộp
   * thư một-vai, và ở đó nhãn là nhiễu vì mọi dòng mang cùng một chữ.
   */
  showRole: boolean;
  onPress: (conversation: ConversationSummary) => void;
}) {
  const t = useTranslations('Chat');
  const fmt = useAppFormat();

  const unread = conversation.unread > 0;
  const preview =
    conversation.lastMessageText ??
    (conversation.vehicleName
      ? t('about', { subject: conversation.vehicleName })
      : t('startConversation'));

  return (
    <Pressable
      onPress={() => onPress(conversation)}
      accessibilityRole="button"
      accessibilityLabel={conversation.partyName}
      /*
       * Phản hồi khi chạm — bản trước KHÔNG có, nên một cú chạm vào dòng trông y hệt một cú
       * chạm trượt cho tới khi màn mới kịp mở. Trên máy chậm khoảng lặng đó đủ để người dùng
       * bấm lần thứ hai.
       */
      style={({ pressed }) => [
        styles.row,
        unread && styles.rowUnread,
        pressed && styles.rowPressed,
      ]}
    >
      <XStack ai="center" gap={space.md}>
        <Avatar name={conversation.partyName} url={conversation.partyAvatarUrl} size={AVATAR} />

        <YStack f={1} gap={3}>
          <XStack ai="flex-start" jc="space-between" gap={space.sm}>
            <Text
              f={1}
              numberOfLines={1}
              col={colors.text}
              fos={fontSize.body}
              fow={unread ? fontWeight.bold : fontWeight.semibold}
            >
              {conversation.partyName}
            </Text>
            {/*
              Nhãn VAI, chỉ ở hộp thư hợp nhất.

              Ở đó hai dòng cạnh nhau có thể là hai việc khác hẳn: một chủ xe mà tôi đang thuê, và
              một khách đang hỏi xe của tôi. Tên phía bên kia không nói ra điều đó — cả hai đều chỉ
              là một cái tên — nên người đọc phải tự nhớ, và họ sẽ trả lời nhầm giọng.
            */}
            {showRole ? (
              <Text
                col={colors.textMuted}
                fos={fontSize.label}
                numberOfLines={1}
                bg={colors.surfaceMuted}
                px={space.xs}
                br={radius.sm}
              >
                {t(conversation.side === CHAT_SIDE.SHOP ? 'roleAsHost' : 'roleAsRenter')}
              </Text>
            ) : null}
            {/*
              NGÀY ở hàng tên, GIỜ ở hàng cuối cạnh badge — hai mẩu của cùng một mốc, tách theo
              mức người ta cần chúng.

              Một dòng `11/09/2026 09:41` dài gần nửa bề ngang màn 360dp và ăn thẳng vào chỗ của
              TÊN: tên gian hàng dài bị cắt trước khi mốc thời gian chịu nhường. Ngày là thứ liếc
              một lần để biết "lâu chưa"; giờ là thứ đọc cùng câu xem trước, nên nó xuống nằm
              ngay cạnh câu đó.

              `date` chứ không `shortDateTime`: bản ngắn bỏ NĂM, nên một hội thoại im từ năm
              ngoái trông y hệt một hội thoại hôm kia.
            */}
            {conversation.lastMessageAt ? (
              // `fow` chọn LUÔN mặt chữ: `tamagui.config` map mỗi weight sang một file .ttf.
              <Text col={colors.textMuted} fos={fontSize.meta} fow={fontWeight.regular}>
                {fmt.date(conversation.lastMessageAt)}
              </Text>
            ) : null}
          </XStack>

          {/*
            Tên xe mang màu VÀNG ĐẬM — đúng `.convVehicle` của web (`--xp-gold-deep`, tức
            `color-primary-active`). Icon xe đi kèm để dòng này đọc ra là NGỮ CẢNH chứ không
            phải một câu tin nhắn.
          */}
          {conversation.vehicleName || unread ? (
            <XStack ai="center" jc="space-between" gap={space.sm}>
              {conversation.vehicleName ? (
                <XStack ai="center" gap={space.xs} flexShrink={1}>
                  <Ionicons name="car-outline" size={12} color={colors.primaryActive} />
                  <Text
                    numberOfLines={1}
                    col={colors.primaryActive}
                    fos={fontSize.label}
                    fow={fontWeight.medium}
                  >
                    {conversation.vehicleName}
                  </Text>
                </XStack>
              ) : (
                /*
                  Chỗ trống giữ cột TRÁI khi hội thoại chưa gắn xe nào — thiếu nó thì số chưa đọc
                  trôi sang mép trái và ba hàng không còn thẳng cột với nhau.
                */
                <YStack f={1} />
              )}

              {/* Số tin chưa đọc nằm ở HÀNG GIỮA, thẳng cột với ngày ở trên và giờ ở dưới. */}
              {unread ? <CountBadge count={conversation.unread} /> : null}
            </XStack>
          ) : null}

          <XStack ai="center" jc="space-between" gap={space.sm}>
            <Text
              f={1}
              numberOfLines={1}
              col={unread ? colors.text : colors.textMuted}
              fos={fontSize.bodySm}
              fow={unread ? fontWeight.semibold : fontWeight.regular}
            >
              {preview}
            </Text>

            {/*
              GIỜ đứng một mình cạnh câu xem trước — số chưa đọc đã lên hàng tên xe, nên cột
              phải đọc từ trên xuống là ngày → số tin mới → giờ.
            */}
            {conversation.lastMessageAt ? (
              <Text
                col={unread ? colors.primaryActive : colors.textMuted}
                fos={fontSize.label}
                fow={unread ? fontWeight.semibold : fontWeight.medium}
              >
                {fmt.time(conversation.lastMessageAt)}
              </Text>
            ) : null}
          </XStack>
        </YStack>
      </XStack>
    </Pressable>
  );
});

const styles = StyleSheet.create({
  /*
   * Dòng chạy HẾT bề ngang như cũ — không phải thẻ rời có bo góc và lề.
   *
   * Đổi so với bản đầu đúng một thứ: viền đủ BỐN cạnh thay cho MỘT nét `hairlineWidth` ở đáy.
   * Nét cũ mảnh tới mức trên nền trang #faf9f7 gần như không thấy, nên cả danh sách đọc ra
   * thành một khối chữ liền; viền khép được bốn cạnh thì mỗi cuộc trò chuyện là một khối riêng.
   *
   * Màu `color-border` chứ không phải `color-border-strong`: dòng nào cũng có viền nên một
   * màu đậm hơn lặp lại hàng chục lần sẽ đọc ra thành cái lưới. Và KHÔNG kéo dòng lên đè viền
   * dòng trên (`marginTop: -1`) — làm vậy thì dòng đầu tiên mất luôn cạnh trên của nó.
   */
  row: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderWidth: 1,
    // Sàn chạm 44pt/48dp — dòng thấp hơn thì ngón cái trượt sang cuộc trò chuyện bên cạnh.
    minHeight: sizing.touchTarget + space.md,
    paddingHorizontal: layout.screenX,
    paddingVertical: space.md,
  },
  /** Chưa đọc: nền VÀNG NHẠT cho cả thẻ — thấy ngay khi lướt, không phải đọc số ở góc. */
  rowUnread: {
    backgroundColor: colors.primaryLight,
  },
  /**
   * Nền lúc CHẠM — xám nhạt, không phải vàng nhạt như trước: vàng nhạt giờ mang nghĩa "chưa
   * đọc", nên dùng lại nó cho cú chạm thì thẻ đã đọc nhấp nháy thành thẻ chưa đọc.
   */
  rowPressed: {
    backgroundColor: colors.surfaceMuted,
  },
});
