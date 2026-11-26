import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { radius, space, typeScale } from '@/theme/tokens';

/** Tên tệp đọc từ đường dẫn (phần cuối, bỏ query) - server chỉ trả URL của tệp đã tải. */
export const fileNameOf = (url: string) => {
  const last = url.split('?')[0]?.split('/').pop() ?? url;
  try {
    return decodeURIComponent(last);
  } catch {
    return last;
  }
};

export const isPdfUrl = (url: string) => url.toLowerCase().split('?')[0]?.endsWith('.pdf') === true;

const extOf = (name: string) =>
  name.includes('.') ? (name.split('.').pop() ?? '').toUpperCase() : 'FILE';

/**
 * Một tệp chứng từ của phiếu thu/chi (Figma "_File upload item base" `24512:130902`): icon trang có
 * nhãn loại tệp, tên tệp, ✓ 100%, nút gỡ đỏ.
 *
 * MỘT khuôn cho form tạo phiếu (có `onRemove`) và tấm chi tiết phiếu (có `onOpen` - chạm để xem,
 * không gỡ được): hai chỗ cùng hiện một tệp thì phải trông như nhau.
 */
export const ReceiptAttachmentRow = memo(function ReceiptAttachmentRow({
  url,
  openLabel,
  onOpen,
  removeLabel,
  onRemove,
}: {
  url: string;
  openLabel?: string;
  onOpen?: (url: string) => void;
  removeLabel?: string;
  onRemove?: (url: string) => void;
}) {
  const colors = useColors();
  const name = fileNameOf(url);
  const body = (
    <XStack
      ai="flex-start"
      gap={space.md}
      px={space.lg}
      py={space.md}
      br={radius.control}
      bw={1}
      bc={colors.border}
      bg={colors.surface}
    >
      <YStack w={40} h={40}>
        <LineIcon name="file-page" size={40} color={colors.borderInput} />
        <YStack pos="absolute" left={1} top={18} px={3} py={2} br={2} bg={colors.info}>
          <Text col={colors.textInverse} fos={10} lh={12} fontFamily={FONT_FAMILY.bold}>
            {extOf(name)}
          </Text>
        </YStack>
      </YStack>
      <YStack f={1} minWidth={0} gap={2}>
        <Text
          col={colors.textMuted}
          fos={typeScale.body.fontSize}
          lh={22}
          fontFamily={FONT_FAMILY.medium}
          numberOfLines={1}
        >
          {name}
        </Text>
        <XStack ai="center" gap={space.xs}>
          <LineIcon name="check-circle-16" size={16} color={colors.success} />
          <Text col={colors.success} fos={typeScale.body.fontSize} lh={22} fontFamily={FONT_FAMILY.medium}>
            100%
          </Text>
        </XStack>
      </YStack>
      {onRemove ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={removeLabel ?? name}
          hitSlop={space.sm}
          onPress={() => onRemove(url)}
        >
          <YStack pt={2}>
            <LineIcon name="delete-2" size={16} color={colors.danger} />
          </YStack>
        </Pressable>
      ) : null}
    </XStack>
  );
  return onOpen ? (
    <Pressable accessibilityRole="button" accessibilityLabel={openLabel ?? name} onPress={() => onOpen(url)}>
      {body}
    </Pressable>
  ) : (
    body
  );
});
