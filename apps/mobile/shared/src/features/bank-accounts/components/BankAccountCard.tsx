import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { bankInitials } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BankAccount } from '@/api/bank-accounts/api';
import { bankAccountTitle } from '../current-account';

const BADGE_SIZE = 40;

/**
 * Thẻ MỘT tài khoản nhận tiền — bản native của web `BankAccountCard`. Cùng một hình ở mọi nơi tài
 * khoản hiện ra: khối tài khoản nhận tiền, tấm rút tiền, tấm khai tài khoản nhận hoàn.
 *
 * `emphasis` cho nơi thẻ là ĐÍCH của một lệnh chi sắp gửi (tấm rút): nền màu chính. `action` là
 * lối rẽ phụ đặt dưới thẻ (nút "Đổi tài khoản") — xếp DỌC để không chật trên màn hẹp.
 */
export function BankAccountCard({
  account,
  action,
  emphasis = false,
}: {
  account: BankAccount;
  action?: ReactNode;
  emphasis?: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('BankAccounts');
  return (
    <Card tone={emphasis ? 'accent' : 'surface'} lift={emphasis ? 'flat' : 'card'}>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.sm}>
          {/* Biểu trưng dựng từ MÃ ngân hàng, không tải logo — đúng web. */}
          <YStack
            w={BADGE_SIZE}
            h={BADGE_SIZE}
            br={radius.md}
            bg={colors.primaryLight}
            ai="center"
            jc="center"
            accessibilityElementsHidden
            importantForAccessibility="no-hide-descendants"
          >
            <Text col={colors.primaryActive} fos={fontSize.label} fow={fontWeight.bold}>
              {bankInitials(account.bankCode)}
            </Text>
          </YStack>
          <YStack f={1} minWidth={0} gap={2}>
            <XStack ai="center" gap={space.xs}>
              <Text
                f={1}
                col={colors.text}
                fos={fontSize.body}
                fow={fontWeight.semibold}
                numberOfLines={1}
              >
                {bankAccountTitle(account)}
              </Text>
              {account.verifiedAt ? (
                <StatusBadge label={t('verifiedTag')} color={STATUS_COLOR.SUCCESS} size="sm" />
              ) : null}
            </XStack>
            <Text col={colors.text} fos={fontSize.bodySm} numberOfLines={1}>
              {t('accountNumberLine', { number: account.accountNumberMasked })}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={2}>
              {account.accountName}
            </Text>
          </YStack>
        </XStack>
        {action ?? null}
      </YStack>
    </Card>
  );
}
