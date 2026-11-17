import { memo, useCallback } from 'react';
import { Linking } from 'react-native';
import { Image } from 'expo-image';
import { XStack } from 'tamagui';
import { telHref, zaloHref } from '@xeprime/domain';
import { images } from '@/assets';
import { LineIcon } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize } from '@/theme/tokens';
import { IconSquareButton, type IconSquareSize } from './IconSquareButton';

/** Web `.zaloLogo { width: 18px; height: 18px }`. */
const ZALO_LOGO = { width: 18, height: 18 } as const;
/** Figma "Buttons group": các nút cách 8 (cỡ 36); cỡ 44 của màn cũ cách 12. */
const GAP: Readonly<Record<IconSquareSize, number>> = { md: 8, lg: 12 };

/**
 * Cụm liên hệ dạng ICON — Nhắn tin · Gọi · Zalo (Figma "Buttons group", web `CustomerContactButtons
 * variant="icon"`). Chỉ là TRÌNH BÀY: nút nào có do nơi gọi quyết (`onMessage` vắng ⇒ không có nút
 * nhắn tin — cổng `chatOpen` ADR 0073; không có SĐT ⇒ không có Gọi/Zalo — cổng lộ liên hệ ADR 0056).
 * Nhãn truyền vào đã dịch, nên dùng được ở cả hai app.
 */
export const ContactActions = memo(function ContactActions({
  phone,
  labels,
  onMessage,
  messageUnavailable = false,
  messageLoading = false,
  disabled = false,
  size = 'md',
}: {
  phone: string | null | undefined;
  labels: { message: string; call: string; zalo: string };
  onMessage?: (() => void) | undefined;
  /** Khách chưa có tài khoản: nút MỜ nhưng vẫn nhận chạm để nơi gọi nói lý do. */
  messageUnavailable?: boolean;
  messageLoading?: boolean;
  disabled?: boolean;
  size?: IconSquareSize;
}) {
  const colors = useColors();
  const tel = telHref(phone);
  const zalo = zaloHref(phone);
  const call = useCallback(() => {
    if (tel) void Linking.openURL(tel);
  }, [tel]);
  const openZalo = useCallback(() => {
    if (zalo) void Linking.openURL(zalo);
  }, [zalo]);
  return (
    <XStack gap={GAP[size]} flexWrap="wrap">
      {onMessage ? (
        <IconSquareButton
          label={labels.message}
          size={size}
          dimmed={messageUnavailable}
          busy={messageLoading}
          disabled={disabled}
          onPress={onMessage}
        >
          <LineIcon name="message-sm" size={iconSize.lg} color={colors.textMuted} />
        </IconSquareButton>
      ) : null}
      {tel && phone ? (
        <IconSquareButton label={labels.call} size={size} disabled={disabled} onPress={call}>
          <LineIcon name="calling" size={iconSize.lg} color={colors.textMuted} />
        </IconSquareButton>
      ) : null}
      {zalo && phone ? (
        <IconSquareButton label={labels.zalo} size={size} tone="zalo" disabled={disabled} onPress={openZalo}>
          {/* Logo Zalo thật như web (`/icons/brand/zalo.png`), không vẽ lại bằng icon chung. */}
          <Image source={images.zaloLogo} style={ZALO_LOGO} contentFit="contain" />
        </IconSquareButton>
      ) : null}
    </XStack>
  );
});
