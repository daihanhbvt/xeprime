import { memo } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon, type LineIconName } from '@/components/icons/LineIcon';
import { Pill } from '@/components/ui/Pill';
import { elevation } from '@/theme/elevation';
import { themed, useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, typeScale } from '@/theme/tokens';

export type MetricTileTone = 'danger' | 'warning' | 'info' | 'success' | 'brand';

export interface MetricTileLine {
  key: string;
  text: string;
}

/** Ô icon tô theo tông - Figma "Metric Icon": nền `*-low`, icon màu đậm cùng sắc. */
const useToneSkin = themed<Record<MetricTileTone, { bg: string; fg: string }>>((colors) => ({
  danger: { bg: colors.dangerSurface, fg: colors.danger },
  warning: { bg: colors.warningSubtle, fg: colors.warningVivid },
  info: { bg: colors.infoLow, fg: colors.infoStrong },
  success: { bg: colors.successSurface, fg: colors.success },
  brand: { bg: colors.brandLow, fg: colors.brandShape },
}));

/**
 * Ô SỐ LIỆU của design v2 (Figma "Overview Metrics" `24175:52353`): thẻ trắng bo 12, đệm 12, quầng
 * bóng "New/8-4"; hàng đầu = ô icon 28 (đệm 6, bo 8) + số 24/32 đậm vừa + viên đỏ tuỳ chọn
 * ("7 quá hạn"); dưới là nhãn 10/14 đậm vừa VIẾT HOA và các dòng phụ 12/18 mờ.
 *
 * Giao diện tối: không bóng, thẻ tách nền bằng viền `border` (như `Card`).
 */
export const MetricTile = memo(function MetricTile({
  icon,
  tone,
  value,
  label,
  badge,
  lines,
  onPress,
  accessibilityLabel,
}: {
  icon: LineIconName;
  tone: MetricTileTone;
  value: string;
  label: string;
  /** Viên đỏ cạnh con số - việc đã quá giờ / sắp hết hạn. */
  badge?: string;
  lines: readonly MetricTileLine[];
  onPress?: () => void;
  accessibilityLabel?: string;
}) {
  const colors = useColors();
  const skin = useToneSkin()[tone];
  const dark = useAppScheme().scheme === 'dark';

  const body = (
    <YStack
      f={1}
      p={PAD}
      gap={GAP}
      br={radius.control}
      bg={colors.surface}
      bw={1}
      bc={dark ? colors.border : colors.surface}
      style={dark ? undefined : elevation.ambient}
    >
      <XStack ai="center" gap={HEAD_GAP} flexWrap="wrap" rowGap={4}>
        <XStack ai="center" gap={HEAD_GAP}>
          <YStack p={ICON_PAD} br={ICON_RADIUS} bg={skin.bg}>
            <LineIcon name={icon} color={skin.fg} size={ICON} />
          </YStack>
          <Text
            col={colors.text}
            fos={typeScale.display.fontSize}
            lh={typeScale.display.lineHeight}
            fow={fontWeight.semibold}
            fontVariant={TABULAR}
          >
            {value}
          </Text>
        </XStack>
        {badge ? <Pill label={badge} tone="danger" borderless /> : null}
      </XStack>
      <YStack gap={2}>
        <Text
          col={colors.text}
          fos={typeScale.caption.fontSize}
          lh={typeScale.caption.lineHeight}
          fow={fontWeight.semibold}
          textTransform="uppercase"
          numberOfLines={2}
        >
          {label}
        </Text>
        {lines.map((line) => (
          <Text
            key={line.key}
            col={colors.placeholder}
            fos={typeScale.label.fontSize}
            lh={typeScale.label.lineHeight}
          >
            {line.text}
          </Text>
        ))}
      </YStack>
    </YStack>
  );

  if (!onPress) return body;
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      style={({ pressed }) => [FILL, pressed ? PRESSED : null]}
    >
      {body}
    </Pressable>
  );
});

/** Figma: thẻ `p 12 · gap 6`, hàng đầu `gap 12`, ô icon `p 6 · r 8` quanh icon 16. */
const PAD = 12;
const GAP = 6;
const HEAD_GAP = 12;
const ICON_PAD = 6;
const ICON_RADIUS = 8;
const ICON = 16;
const TABULAR = ['tabular-nums'] as ('tabular-nums')[];
const FILL = { flex: 1 } as const;
const PRESSED = { opacity: 0.85 } as const;
