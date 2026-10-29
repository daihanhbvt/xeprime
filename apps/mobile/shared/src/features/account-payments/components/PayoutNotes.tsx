import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';

function StrongText({ children }: { children: ReactNode }) {
  const colors = useColors();
  return (
    <Text col={colors.text} fow={fontWeight.semibold}>
      {children}
    </Text>
  );
}

const strong = (chunks: ReactNode) => <StrongText>{chunks}</StrongText>;

/**
 * "Lưu ý khi thêm tài khoản nhận tiền" — bản native của web `PayoutNotes` (Figma `19879:74829`).
 *
 * Cùng bốn dòng, cùng lý do chọn lọc như web: tên thụ hưởng khớp tên ở NGÂN HÀNG, thời gian chuyển
 * lấy từ server (`maxBusinessDays` — chưa có thì bỏ dòng, không đoán số), chỉ tài khoản ngân hàng
 * trong nước, đổi tài khoản không đổi đích lệnh rút đang chờ. Không có dòng "phí giao dịch" —
 * XePrime không thu phí rút.
 */
export function PayoutNotes({ maxBusinessDays }: { maxBusinessDays?: number }) {
  const colors = useColors();
  const t = useTranslations('AccountPayments.balance.notes');

  const items: ReactNode[] = [
    t.rich('holder', { strong }),
    ...(maxBusinessDays !== undefined ? [t.rich('timing', { strong, days: maxBusinessDays })] : []),
    t.rich('accountType', { strong }),
    t.rich('change', { strong }),
  ];

  return (
    <Card tone="muted" lift="flat">
      <YStack gap={space.sm}>
        <Text col={colors.warning} fos={fontSize.bodySm} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        {items.map((item, index) => (
          <XStack key={index} gap={space.xs}>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {'•'}
            </Text>
            <Text f={1} col={colors.textMuted} fos={fontSize.bodySm}>
              {item}
            </Text>
          </XStack>
        ))}
      </YStack>
    </Card>
  );
}
