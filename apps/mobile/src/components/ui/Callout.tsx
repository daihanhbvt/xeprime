import { Ionicons } from '@expo/vector-icons';
import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/** Bốn tông của `<Alert>` bên web — cùng bộ, cùng thứ tự đọc. */
const TONE = {
  info: { fg: colors.info, bg: colors.infoSurface, icon: 'information-circle' as const },
  warning: { fg: colors.warning, bg: colors.warningSurface, icon: 'warning' as const },
  success: { fg: colors.success, bg: colors.successSurface, icon: 'checkmark-circle' as const },
  danger: { fg: colors.danger, bg: colors.dangerSurface, icon: 'alert-circle' as const },
} as const;

export type CalloutTone = keyof typeof TONE;

/**
 * Khối thông báo trong luồng đọc — bản native của `<Alert showIcon>` bên web.
 *
 * Có VIỀN cùng tông, không chỉ nền nhạt: một mảng màu nhạt đặt trên thẻ trắng gần như không tách
 * khỏi nền, mà khối này luôn là thứ phải nhìn thấy ngay (giá vừa tính lại, hồ sơ còn thiếu, form
 * đang ở chế độ chỉ đọc).
 *
 * `title` là DÒNG ĐẦU in đậm; `children` là phần thân. Chỉ có một trong hai cũng hợp lệ — đúng
 * cặp `message`/`description` của AntD.
 */
export function Callout({
  tone = 'info',
  title,
  children,
}: {
  tone?: CalloutTone;
  title?: string;
  children?: ReactNode;
}) {
  const skin = TONE[tone];
  const body = typeof children === 'string' ? <CalloutBody>{children}</CalloutBody> : children;

  return (
    <YStack bg={skin.bg} br={radius.md} bw={1} bc={skin.fg} p={space.md} gap={space.sm}>
      <XStack gap={space.xs} ai="flex-start">
        {/* `pt` nhỏ để hình thẳng hàng với DÒNG ĐẦU, không phải giữa cả khối. */}
        <YStack pt={1}>
          <Ionicons name={skin.icon} size={iconSize.md} color={skin.fg} />
        </YStack>
        {/*
          Chữ dùng MÀU CHỮ CHÍNH, chỉ biểu tượng mang màu tông. Tô cả câu theo tông thì con số
          quan trọng nhất trong khối đọc ra như một nhãn trạng thái.
        */}
        {title ? (
          <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {title}
          </Text>
        ) : (
          <YStack f={1} gap={space.xs}>
            {body}
          </YStack>
        )}
      </XStack>

      {title && body ? <YStack gap={space.sm}>{body}</YStack> : null}
    </YStack>
  );
}

/** Một đoạn thân của `Callout` — dùng khi khối có nhiều đoạn, hoặc xen kẽ với nội dung khác. */
export function CalloutBody({ children }: { children: string }) {
  return (
    <Text col={colors.textMuted} fos={fontSize.bodySm}>
      {children}
    </Text>
  );
}
