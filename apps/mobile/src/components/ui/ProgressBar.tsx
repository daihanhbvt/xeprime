import { Text, XStack, YStack } from 'tamagui';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** Ba vai của `status` trên `<Progress>` bên web: đang chạy · xong · vượt ngưỡng. */
type Tone = 'active' | 'success' | 'exception';
type Size = 'sm' | 'md';

/**
 * `md` là thanh ĐỌC SỐ — nó đứng cạnh nhãn "đã đi 4.100 / 5.000 km" ở màn hồ sơ và là một số liệu.
 *
 * `sm` là thanh LƯỚT QUA: trong một thẻ danh sách nó chỉ trả lời "gần hết chu kỳ chưa", và ở bề
 * dày 8pt nó thành mảng màu nặng thứ ba trên thẻ, tranh chỗ với nhãn trạng thái.
 */
const TRACK_HEIGHT: Readonly<Record<Size, number>> = { sm: 4, md: 8 };

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
  size = 'md',
  label,
}: {
  percent: number;
  tone?: Tone;
  size?: Size;
  label?: string;
}) {
  const clamped = Math.min(100, Math.max(0, percent));
  const height = TRACK_HEIGHT[size];

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
        h={height}
        br={radius.pill}
        bg={colors.surfaceMuted}
        ov="hidden"
        accessibilityRole="progressbar"
        accessibilityValue={{ min: 0, max: 100, now: Math.round(clamped) }}
      >
        <YStack h={height} br={radius.pill} bg={TONE[tone]} width={`${clamped}%`} />
      </YStack>
    </YStack>
  );
}
