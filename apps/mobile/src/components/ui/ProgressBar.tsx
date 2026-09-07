import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Ba vai của `status` trên `<Progress>` bên web: đang chạy · xong · vượt ngưỡng. */
type Tone = 'active' | 'success' | 'exception';

const TRACK_HEIGHT = 8;

const TONE: Readonly<Record<Tone, string>> = {
  active: colors.primary,
  success: colors.success,
  exception: colors.danger,
};

/**
 * Thanh tiến độ — bản native của `<Progress>` (AntD).
 *
 * `percent` được KẸP về 0–100 ở đây chứ không ở nơi gọi: nguồn của nó thường là một phép chia
 * dữ liệu thật (KM đã đi / chu kỳ) và vượt 100 là chuyện bình thường khi xe quá hạn bảo dưỡng —
 * không kẹp thì thanh tô tràn ra ngoài thẻ.
 *
 * `label` là chữ ĐỨNG TRÊN thanh, không đè lên nó: bề rộng màn hình native không đủ để một
 * chuỗi như "42.000 / 5.000 km" nằm gọn trong lòng thanh cao 8pt.
 */
export function ProgressBar({
  percent,
  tone = 'active',
  label,
}: {
  percent: number;
  tone?: Tone;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));

  return (
    <YStack gap={space.xs}>
      {label ? (
        <XStack jc="flex-end">
          <Text col={colors.textMuted} fos={fontSize.label} fow={fontWeight.medium}>
            {label}
          </Text>
        </XStack>
      ) : null}

      <YStack
        h={TRACK_HEIGHT}
        br={radius.pill}
        bg={colors.surfaceMuted}
        ov="hidden"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      >
        <YStack h={TRACK_HEIGHT} br={radius.pill} bg={TONE[tone]} width={`${clamped}%`} />
      </YStack>
    </YStack>
  );
}
