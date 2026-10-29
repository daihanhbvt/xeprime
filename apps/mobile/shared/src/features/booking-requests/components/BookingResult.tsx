import type { ReactNode } from 'react';
import { Image } from 'expo-image';
import { Text, XStack, YStack } from 'tamagui';
import { XP_TOKENS, toPx } from '@xeprime/ui';
import { images } from '@/assets';
import { IconButton } from '@/components/ui/IconButton';
import { useCopy } from '@/hooks/use-copy';
import { useAppFormat } from '@/i18n/use-app-format';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** `.status { gap: var(--xp-space-12) }` — khoảng giữa huy hiệu, tiêu đề, lời dẫn và ô mã. */
const STATUS_GAP = toPx(XP_TOKENS['space-12']);
/** `.badge` 120 × 120. */
const BADGE_SIZE = 120;
/**
 * Hai biến thể như web `BookingResultVariant`: `default` (huy hiệu 120, tiêu đề h2) và `sent` — hộp
 * "Đã gửi yêu cầu" bản 27/10/2026 (Figma `21836:55889`): phong bì 64 × 63, tiêu đề h3, lời dẫn
 * body, khe 8.
 */
const VARIANT = {
  default: {
    image: images.bookingRequestSent,
    badge: { width: BADGE_SIZE, height: BADGE_SIZE },
    title: fontSize.h2,
    lead: fontSize.bodyLg,
    gap: STATUS_GAP,
  },
  sent: {
    image: images.bookingRequestSentEnvelope,
    badge: { width: 64, height: 63 },
    title: fontSize.h3,
    lead: fontSize.body,
    gap: space.sm,
  },
} as const;
export type BookingResultVariant = keyof typeof VARIANT;

/**
 * Khung của các hộp KẾT QUẢ trong hành trình đặt xe — bản native của web `BookingResult`
 * (Figma `19759:22026` "Đã gửi yêu cầu"; luồng đặt hộ "Đã tạo đơn thuê" dùng cùng khuôn).
 *
 * Bố cục lấy ở breakpoint ĐIỆN THOẠI của web (`@media (max-width: 640px)` trong
 * `BookingResult.module.css`): thân không đệm ngang (màn đã có lề), khối cách nhau `space-md`,
 * hàng nút sau một đường kẻ trên. Khuôn sống ở đây một lần; NỘI DUNG (câu chữ, nút) là của từng màn.
 */
export function BookingResult({
  title,
  lead,
  code,
  children,
  footer,
  variant = 'default',
}: {
  variant?: BookingResultVariant;
  title: string;
  lead: string;
  /** Mã khách/nhân viên đọc cho tổng đài — một Ô giá trị chép được. */
  code: { label: string; value: string; copyLabel: string } | null;
  /** Thẻ chuyến (bố cục `receipt`) và lời nhắc dưới nó. */
  children: ReactNode;
  /** Hàng nút — màn gọi tự quyết xếp dọc hay một hàng. */
  footer: ReactNode;
}) {
  const colors = useColors();
  const copy = useCopy();
  const look = VARIANT[variant];

  return (
    // `.content` ≤640px: không đệm ngang, các khối cách `space-md`.
    <YStack gap={space.md} pt={layout.section}>
      {/* `.status` — cột căn giữa: huy hiệu · tiêu đề · lời dẫn · ô mã, cách nhau `space-12`. */}
      <YStack ai="center" gap={look.gap}>
        {/* `.badge` — ảnh `request-sent.webp` 120×120, TRANG TRÍ (tiêu đề đã nói đúng điều nó nói). */}
        <Image
          source={look.image}
          style={look.badge}
          contentFit="contain"
          accessible={false}
        />
        {/* `.title` — h2 · semibold · `color-text`. */}
        <Text
          col={colors.text}
          fos={look.title}
          fow={fontWeight.semibold}
          ta="center"
          accessibilityRole="header"
        >
          {title}
        </Text>
        {/* `.lead` — body-lg · `color-text-secondary`. */}
        <Text col={colors.textMuted} fos={look.lead} ta="center">
          {lead}
        </Text>
        {code ? (
          /*
            `.code` — Ô giá trị: viền 1px `color-border-strong`, bo `radius-control`, nền
            `bg-container`, bóng `elevation-xs`, đệm xs xs xs 12. Cái khung nói cho mắt biết "đây là
            một giá trị chép được".
          */
          <XStack
            maxWidth="100%"
            ai="center"
            gap={space.sm}
            py={space.xs}
            paddingRight={space.xs}
            paddingLeft={STATUS_GAP}
            bw={1}
            bc={colors.borderInput}
            br={radius.control}
            bg={colors.surface}
            style={elevation.xs}
          >
            {/* `.codeText` body · `.codeLabel` `text-placeholder` · `.codeValue` chữ thường. */}
            <Text f={1} minWidth={0} col={colors.text} fos={fontSize.body}>
              <Text col={colors.textPlaceholder}>{code.label}</Text> {code.value}
            </Text>
            <IconButton
              icon="copy-outline"
              label={code.copyLabel}
              onPress={() => void copy(code.value)}
            />
          </XStack>
        ) : null}
      </YStack>

      {children}

      {/* `.footer` ≤640px — đường kẻ trên `color-border`, đệm trên `space-md`, nút rộng hết hàng. */}
      {/* Màn gọi đặt nút DÍNH ĐÁY ở chỗ khác (`footer={null}`) thì không vẽ khung rỗng. */}
      {footer ? (
        <YStack pt={space.md} borderTopWidth={1} borderTopColor={colors.border}>
          {footer}
        </YStack>
      ) : null}
    </YStack>
  );
}

/**
 * Dòng tổng trong thẻ chuyến của hộp kết quả — web `BookingResultTotal`
 * (Figma `19759:22246`): nhãn body-lg semibold bên trái (kèm câu giải thích body-sm
 * `text-tertiary` nếu có), số tiền h1 semibold `color-primary-hover` bên phải; xuống dòng khi hẹp.
 */
export function BookingResultTotal({
  label,
  note,
  amount,
  variant = 'default',
}: {
  /** `sent` — hộp "Đã gửi yêu cầu" (web `.totalSent`): nhãn body 14, số h3 18. */
  variant?: BookingResultVariant;
  label: string;
  note?: string;
  amount: string;
}) {
  const colors = useColors();
  const fmt = useAppFormat();
  return (
    <XStack flexWrap="wrap" ai="center" jc="space-between" columnGap={space.md} rowGap={space.xs}>
      <YStack f={1} minWidth={0}>
        <Text
          col={colors.text}
          fos={variant === 'sent' ? fontSize.body : fontSize.bodyLg}
          fow={fontWeight.semibold}
        >
          {label}
        </Text>
        {note ? (
          <Text col={colors.placeholder} fos={fontSize.bodySm}>
            {note}
          </Text>
        ) : null}
      </YStack>
      <Text
        col={colors.primaryHover}
        fos={variant === 'sent' ? fontSize.h3 : fontSize.h1}
        fow={fontWeight.semibold}
        numberOfLines={1}
      >
        {fmt.money(amount)}
      </Text>
    </XStack>
  );
}
