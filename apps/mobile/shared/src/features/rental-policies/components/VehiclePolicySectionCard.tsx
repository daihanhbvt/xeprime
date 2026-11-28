import type { ReactNode } from 'react';
import { Text } from 'tamagui';
import { useTranslations } from 'use-intl';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { InfoHint } from '@/components/ui/InfoHint';
import { RowDivider, SwitchRow } from '@/components/ui/SwitchRow';
import { useColors } from '@/theme/ThemeProvider';
import { typeScale } from '@/theme/tokens';

/** Khoảng tiêu đề → mô tả của `InfoGroupCard` là 8; Figma vẽ sát (0). */
const HEAD_PULL = 8;

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
 * Thẻ một mục chính sách ở màn sửa xe - bản native của web `PolicySectionCard` + `VehiclePolicySection`,
 * dựng theo "Nhóm thông tin" của Figma Partner (`24237:56980`): tiêu đề 16/24, (khi có `inherit`) hàng
 * công tắc kế thừa + đường kẻ, rồi nội dung. Chủ xe tuyến hoa hồng (chế độ `direct`) không có công
 * tắc - sửa thẳng.
 */
export function VehiclePolicySectionCard({
  title,
  subtitle,
  titleHint,
  badge,
  inherit,
  children,
}: {
  title: string;
  subtitle?: string;
  /** Câu giới thiệu dài - vào dấu ⓘ cuối hàng tiêu đề thay vì chiếm chỗ (người dùng chốt 27/11/2026). */
  titleHint?: string;
  badge?: ReactNode;
  inherit?: PolicyInheritControl;
  children: ReactNode;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.policies.workspace.inherit');
  return (
    <InfoGroupCard
      title={title}
      {...(badge || titleHint
        ? {
            headerRight: (
              <>
                {badge}
                {titleHint ? (
                  <InfoHint label={title} content={titleHint} size={typeScale.body.fontSize} />
                ) : null}
              </>
            ),
          }
        : {})}
      // Figma: dòng mô tả nằm SÁT dưới tiêu đề (cùng khối "Info"), không cách 12 như các phần khác.
      {...(subtitle
        ? {
            subheader: (
              <Text
                col={colors.placeholder}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                mt={-HEAD_PULL}
              >
                {subtitle}
              </Text>
            ),
          }
        : {})}
    >
      {inherit ? (
        <>
          <SwitchRow
            title={t('title')}
            description={t.rich('hint', {
              // Figma: "chính sách chung" gạch chân, `text/brand/primary-2`.
              policies: (chunks) =>
                inherit.onOpenPolicies ? (
                  <Text
                    col={colors.brandLink}
                    fos={typeScale.label.fontSize}
                    lh={typeScale.label.lineHeight}
                    textDecorationLine="underline"
                    accessibilityRole="link"
                    onPress={inherit.onOpenPolicies}
                  >
                    {chunks}
                  </Text>
                ) : (
                  chunks
                ),
            })}
            value={inherit.checked}
            disabled={inherit.disabled ?? false}
            onChange={inherit.onChange}
          />
          <RowDivider />
        </>
      ) : null}
      {children}
    </InfoGroupCard>
  );
}
