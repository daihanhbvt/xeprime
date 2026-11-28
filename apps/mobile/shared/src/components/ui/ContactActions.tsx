import { memo, useCallback, type ReactNode } from 'react';
import { Linking, Pressable } from 'react-native';
import { Image } from 'expo-image';
import { Text, XStack } from 'tamagui';
import { telHref, zaloHref } from '@xeprime/domain';
import { images } from '@/assets';
import { LineIcon } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, radius, sizing, typeScale } from '@/theme/tokens';
import { IconSquareButton, type IconSquareSize } from './IconSquareButton';

/** Web `.zaloLogo { width: 18px; height: 18px }`. */
const ZALO_LOGO = { width: 18, height: 18 } as const;
/** Figma "Buttons group": các nút cách 8 (cỡ 36); cỡ 44 của màn cũ cách 12. */
const GAP: Readonly<Record<IconSquareSize, number>> = { sm: 8, md: 8, card: 8, lg: 12 };

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
  labeled = false,
}: {
  phone: string | null | undefined;
  labels: { message: string; call: string; zalo: string };
  onMessage?: (() => void) | undefined;
  /** Khách chưa có tài khoản: nút MỜ nhưng vẫn nhận chạm để nơi gọi nói lý do. */
  messageUnavailable?: boolean;
  messageLoading?: boolean;
  disabled?: boolean;
  size?: IconSquareSize;
  /**
   * Nút CÓ CHỮ (icon + nhãn, đệm 14/8, bo 12) - Figma Chi tiết tài xế "Buttons group" `24512:120499`.
   * Mặc định là nút vuông chỉ icon.
   */
  labeled?: boolean;
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
  if (labeled) {
    return (
      <XStack gap={12} flexWrap="wrap">
        {onMessage ? (
          <LabeledButton label={labels.message} disabled={disabled || messageLoading} dimmed={messageUnavailable} onPress={onMessage}>
            <LineIcon name="message-sm" size={iconSize.lg} color={colors.textMuted} />
          </LabeledButton>
        ) : null}
        {tel && phone ? (
          <LabeledButton label={labels.call} disabled={disabled} onPress={call}>
            <LineIcon name="calling" size={iconSize.lg} color={colors.textMuted} />
          </LabeledButton>
        ) : null}
        {zalo && phone ? (
          <LabeledButton label={labels.zalo} zalo disabled={disabled} onPress={openZalo}>
            <Image source={images.zaloLogo} style={ZALO_LOGO_LABELED} contentFit="contain" />
          </LabeledButton>
        ) : null}
      </XStack>
    );
  }
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

/** Figma: logo Zalo 17.5 trong khung 20. */
const ZALO_LOGO_LABELED = { width: 17.5, height: 17.5 } as const;
const LABELED_SLOP = Math.ceil((sizing.touchTarget - 36) / 2);

function LabeledButton({
  label,
  onPress,
  children,
  zalo = false,
  disabled = false,
  dimmed = false,
}: {
  label: string;
  onPress: () => void;
  children: ReactNode;
  zalo?: boolean;
  disabled?: boolean;
  dimmed?: boolean;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={disabled ? undefined : onPress}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled: disabled || dimmed }}
      hitSlop={LABELED_SLOP}
      style={({ pressed }) => ({ opacity: disabled || dimmed ? 0.45 : pressed ? 0.7 : 1 })}
    >
      <XStack
        ai="center"
        gap={6}
        px={14}
        py={8}
        br={radius.control}
        bw={1}
        bc={zalo ? colors.infoBorder : colors.borderInput}
        bg={zalo ? colors.infoLow : colors.surface}
      >
        {children}
        <Text
          col={zalo ? colors.infoStrong : colors.textMuted}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
        >
          {label}
        </Text>
      </XStack>
    </Pressable>
  );
}
