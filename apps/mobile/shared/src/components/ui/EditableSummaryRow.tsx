import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { LineIcon } from '@/components/icons/LineIcon';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';

/** Khoảng cách trong khung v2 - Figma "Nhóm thông tin" gap 12. */
const COMPACT_GAP = 12;

export interface SummaryLine {
  label: string;
  value: string;
  /** Màu chữ giá trị (vd. "Miễn phí" xanh); vắng = chữ thường đậm. */
  tone?: string;
}

/**
 * Khung dòng tóm tắt v2 (Figma "Discount Toggle" `24231:111519`): các cặp "Nhãn: giá trị" bên trái,
 * nút xoá + sửa 20 bên phải. Dùng cho bậc giao xe và mốc ưu đãi dài hạn.
 */
export function EditableSummaryRow({
  lines,
  removeLabel,
  editLabel,
  disabled,
  onRemove,
  onEdit,
}: {
  lines: readonly SummaryLine[];
  removeLabel: string;
  editLabel: string;
  disabled: boolean;
  onRemove: () => void;
  onEdit: () => void;
}) {
  const colors = useColors();
  const line = ({ label, value, tone }: SummaryLine) => (
    <XStack f={1} minWidth={0} gap={space.xs} ai="center">
      <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
        {label}
      </Text>
      <Text
        f={1}
        minWidth={0}
        numberOfLines={1}
        col={tone ?? colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={tone ? fontWeight.medium : fontWeight.semibold}
      >
        {value}
      </Text>
    </XStack>
  );
  return (
    <XStack
      ai="center"
      gap={COMPACT_GAP}
      p={COMPACT_GAP}
      br={radius.control}
      bw={1}
      bc={colors.border}
      bg={colors.surface}
    >
      <YStack f={1} minWidth={0} gap={6}>
        {lines.map((entry) => (
          <XStack key={entry.label}>{line(entry)}</XStack>
        ))}
      </YStack>
      {disabled ? null : (
        <>
          <Pressable onPress={onRemove} hitSlop={space.sm} accessibilityRole="button" accessibilityLabel={removeLabel}>
            <LineIcon name="trash" size={20} color={colors.textMuted} />
          </Pressable>
          <Pressable onPress={onEdit} hitSlop={space.sm} accessibilityRole="button" accessibilityLabel={editLabel}>
            <LineIcon name="edit-2" size={20} color={colors.textMuted} />
          </Pressable>
        </>
      )}
    </XStack>
  );
}

/** Nút chữ có dấu + (Figma "Button" `24789:85089`): icon Add 20 + chữ 14 đậm vừa `text/brand/primary-2`. */
export function AddLink({ label, onPress }: { label: string; onPress: () => void }) {
  const colors = useColors();
  return (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label} hitSlop={space.xs}>
      <XStack ai="center" gap={6} alignSelf="flex-start">
        <LineIcon name="add" size={20} color={colors.brandLink} />
        <Text
          col={colors.brandLink}
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
