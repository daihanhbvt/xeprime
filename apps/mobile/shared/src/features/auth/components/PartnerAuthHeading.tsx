import { memo, type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space, typeScale } from '@/theme/tokens';

/**
 * Khối tiêu đề các màn tài khoản của app Partner — cột form Figma Partner-XePrime "Login -
 * Partner/Admin" (`24382:23343`) · quên mật khẩu (`24382:85620` · `85789` · `85898`): minh hoạ
 * (nếu có) · tiêu đề 30/38 đậm IN HOA căn giữa · lời dẫn 18/28 xám căn giữa, khe 8.
 *
 * In hoa bằng `textTransform` chứ không bằng chuỗi dịch: cùng khoá được dùng ở nơi viết thường.
 */
export const PartnerAuthHeading = memo(function PartnerAuthHeading({
  title,
  subtitle,
  art,
  size = 'lg',
}: {
  title: string;
  subtitle?: ReactNode;
  /** Minh hoạ trên tiêu đề (ổ khoá, khiên… của màn quên mật khẩu). */
  art?: ReactNode;
  /**
   * `lg` - tiêu đề 30/38 · lời dẫn 18/28, khe 8 (màn quên mật khẩu).
   * `md` - tiêu đề 24/32 · lời dẫn 14/20, khe 4 (màn đăng nhập app Partner, Figma `24464:24584`).
   */
  size?: 'lg' | 'md';
}) {
  const colors = useColors();
  const md = size === 'md';
  return (
    <YStack ai="center" gap={md ? space.xs : space.sm}>
      {art ? <YStack mb={space.sm}>{art}</YStack> : null}
      <Text
        col={colors.text}
        fos={md ? typeScale.display.fontSize : fontSize.h1}
        lh={md ? typeScale.display.lineHeight : HEADING_LINE_HEIGHT}
        fow={fontWeight.bold}
        ta="center"
        textTransform="uppercase"
        accessibilityRole="header"
      >
        {title}
      </Text>
      {subtitle ? (
        <Text
          col={colors.placeholder}
          fos={md ? typeScale.body.fontSize : fontSize.h3}
          lh={md ? typeScale.body.lineHeight : SUBTITLE_LINE_HEIGHT}
          ta="center"
        >
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
});

/** Figma: tiêu đề 30/38, lời dẫn 18/28. */
const HEADING_LINE_HEIGHT = 38;
const SUBTITLE_LINE_HEIGHT = 28;

/** Khe giữa các khối lớn của cột form (tiêu đề ↔ form ↔ nút ↔ mạng xã hội) — Figma 56. */
export const PARTNER_AUTH_SECTION_GAP = 56;
