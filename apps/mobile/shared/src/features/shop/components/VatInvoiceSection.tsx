import type { ReactNode } from 'react';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { VatInvoiceSetting } from './VatInvoiceSetting';

/**
 * Khối "Hoá đơn VAT" (tiêu đề + mô tả + thẻ thiết lập) — dùng ở "Chính sách thuê" (tuyến gói) và
 * "Hồ sơ chủ xe" (tuyến hoa hồng), như web đặt `VatInvoiceSetting` ở hai trang đó (ADR 0059).
 * Màn chứa nó đã gác `tenant.view`; `canEdit` = `tenant.update`.
 *
 * Tiêu đề/mô tả chỉ định nghĩa ở ĐÂY. Màn có kiểu đầu mục riêng (Hồ sơ chủ xe dùng `SectionHead`)
 * truyền `renderHead` để vẽ cùng chữ đó theo kiểu của mình, thay vì tự đọc lại khoá i18n.
 */
export function VatInvoiceSection({
  canEdit,
  renderHead,
  gap = space.md,
}: {
  canEdit: boolean;
  renderHead?: (head: { title: string; subtitle: string }) => ReactNode;
  gap?: number;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.vatInvoice');
  const title = t('title');
  const subtitle = t('subtitle');
  return (
    <YStack gap={gap}>
      {renderHead ? (
        renderHead({ title, subtitle })
      ) : (
        <YStack gap={2}>
          <Text
            col={colors.text}
            fos={fontSize.h4}
            fow={fontWeight.semibold}
            accessibilityRole="header"
          >
            {title}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {subtitle}
          </Text>
        </YStack>
      )}
      <VatInvoiceSetting canEdit={canEdit} />
    </YStack>
  );
}
