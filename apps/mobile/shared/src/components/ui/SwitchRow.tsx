import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { TextWithHint } from '@/components/ui/InfoHint';
import { ToggleSwitch } from '@/components/ui/ToggleSwitch';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, space, typeScale } from '@/theme/tokens';

/**
 * Hàng công tắc của design v2 (Figma Partner "Service Toggle" - màn sửa xe › Dịch vụ xe `24237:38682`):
 * tiêu đề 14/20 đậm vừa `text/gray/high`, dòng mô tả cách 2 (mặc định 12/18 `text/gray/low`, có thể
 * chứa link), công tắc `_Toggle base` 44×24 bên phải, cách 8.
 *
 * `descriptionSize="body"`: mô tả 14/20 - khối "Hạn mức quãng đường" / "Hạn mức & phí trả xe quá giờ"
 * của cùng frame vẽ cỡ này. `titleHint`: dấu ⓘ LỒNG sát sau chữ cuối của tiêu đề (vd luật tự nhận chuyến).
 */
export function SwitchRow({
  title,
  description,
  descriptionSize = 'label',
  titleHint,
  value,
  onChange,
  disabled = false,
}: {
  title: string;
  description?: ReactNode;
  descriptionSize?: 'label' | 'body';
  /** Dấu ⓘ sau tiêu đề: `content` là tấm giải thích, `label` là tên nút + tiêu đề tấm. */
  titleHint?: { content: ReactNode; label: string };
  value: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  const colors = useColors();
  const desc = typeScale[descriptionSize];
  return (
    <XStack ai="center" gap={space.sm}>
      <YStack f={1} minWidth={0} gap={2}>
        <TextWithHint
          hint={titleHint?.content}
          hintLabel={titleHint?.label ?? title}
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
        >
          {title}
        </TextWithHint>
        {description ? (
          <Text col={colors.placeholder} fos={desc.fontSize} lh={desc.lineHeight}>
            {description}
          </Text>
        ) : null}
      </YStack>
      <ToggleSwitch
        value={value}
        onValueChange={onChange}
        disabled={disabled}
        accessibilityLabel={title}
      />
    </XStack>
  );
}

/** Đường kẻ 1px giữa các hàng trong một "Nhóm thông tin" - màu theo đúng nét Figma của khối đó. */
export function RowDivider({ tone = 'border' }: { tone?: 'border' | 'faint' }) {
  const colors = useColors();
  return <YStack h={1} bg={tone === 'faint' ? colors.background : colors.border} />;
}
