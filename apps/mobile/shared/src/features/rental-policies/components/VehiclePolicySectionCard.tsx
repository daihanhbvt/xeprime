import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { SectionHeader } from '@/components/ui/CardTitle';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, space } from '@/theme/tokens';
import { ToggleRow } from './PolicySections';

/** Công tắc "Áp dụng chính sách của gian hàng" của MỘT mục (ADR 0112 điều 1) - chỉ màn sửa xe. */
export interface PolicyInheritControl {
  /** Mục đang theo gian hàng. */
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  /** Mở trang chính sách chung - `undefined` khi người này không tới được trang đó. */
  onOpenPolicies?: () => void;
}

/**
 * Thẻ một mục chính sách ở màn sửa xe - bản native của web `PolicySectionCard` + `VehiclePolicySection`:
 * tiêu đề, mô tả, nhãn góc phải, và (khi có `inherit`) hàng công tắc kế thừa ngay dưới tiêu đề.
 * Chủ xe tuyến hoa hồng (chế độ `direct`) không có công tắc - sửa thẳng.
 */
export function VehiclePolicySectionCard({
  title,
  subtitle,
  badge,
  inherit,
  children,
}: {
  title: string;
  subtitle?: string;
  badge?: ReactNode;
  inherit?: PolicyInheritControl;
  children: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.policies.workspace.inherit');
  return (
    <Card lift="flat">
      <YStack gap={space.md}>
        <YStack gap={space.xs}>
          <SectionHeader {...(badge ? { action: badge } : {})}>{title}</SectionHeader>
          {subtitle ? (
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {subtitle}
            </Text>
          ) : null}
        </YStack>
        {inherit ? (
          <ToggleRow
            label={t('title')}
            hint={t.rich('hint', {
              policies: (chunks) =>
                inherit.onOpenPolicies ? (
                  <Text
                    col={colors.brandLink}
                    textDecorationLine="underline"
                    onPress={inherit.onOpenPolicies}
                  >
                    {chunks}
                  </Text>
                ) : (
                  chunks
                ),
            })}
            checked={inherit.checked}
            disabled={inherit.disabled ?? false}
            onToggle={() => inherit.onChange(!inherit.checked)}
          />
        ) : null}
        {children}
      </YStack>
    </Card>
  );
}
