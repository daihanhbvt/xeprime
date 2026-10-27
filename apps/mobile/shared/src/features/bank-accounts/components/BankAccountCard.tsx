import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { findBank } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BankAccount } from '@/api/bank-accounts/api';
import { bankAccountTitle } from '../current-account';
import { BankLogo } from './BankLogo';

const BADGE_SIZE = 40;
/** Logo của hình `detail` — web 172px ở desktop, 72px ở máy hẹp. */
const DETAIL_BADGE_SIZE = 72;

/**
 * Thẻ MỘT tài khoản nhận tiền — bản native của web `BankAccountCard`. Cùng một hình ở mọi nơi tài
 * khoản hiện ra: khối tài khoản nhận tiền, tấm rút tiền, tấm khai tài khoản nhận hoàn.
 *
 * `emphasis` cho nơi thẻ là ĐÍCH của một lệnh chi sắp gửi (tấm rút): nền màu chính. `action` là
 * lối rẽ phụ đặt dưới thẻ (nút "Đổi tài khoản") — xếp DỌC để không chật trên màn hẹp.
 *
 * `variant="detail"` — hình của tab "Tài khoản thanh toán" khu tài khoản khách (web
 * `BankAccountCard variant="detail"`, Figma `19879:74829`): ô biểu trưng lớn nền tối, nhãn đối
 * chiếu, rồi bốn dòng ngân hàng (tên đầy đủ) · số tài khoản (đã che) · người thụ hưởng · tên gợi nhớ.
 */
export function BankAccountCard({
  account,
  action,
  emphasis = false,
  variant = 'row',
}: {
  account: BankAccount;
  action?: ReactNode;
  emphasis?: boolean;
  variant?: 'row' | 'detail';
}) {
  const t = useTranslations('BankAccounts');

  if (variant === 'detail') {
    const bank = findBank(account.bankCode);
    return (
      <YStack gap={space.md}>
        <XStack ai="center" gap={space.md}>
          <BankLogo code={account.bankCode} size={DETAIL_BADGE_SIZE} radius={radius.lg} />
          {account.verifiedAt ? (
            <StatusBadge label={t('verifiedTag')} color={STATUS_COLOR.SUCCESS} />
          ) : null}
        </XStack>
        <YStack gap={space.sm}>
          {/* Tên ngân hàng là tên riêng — không dịch (ADR 0012). */}
          <Fact
            label={t('detail.bank')}
            value={bank ? `${bank.fullName} (${bank.shortName})` : bankAccountTitle(account)}
          />
          <Fact label={t('detail.number')} value={account.accountNumberMasked} />
          <Fact label={t('detail.holder')} value={account.accountName.toUpperCase()} />
          <Fact label={t('detail.label')} value={account.label || t('detail.noLabel')} />
        </YStack>
        {action ?? null}
      </YStack>
    );
  }

  return (
    <Card tone={emphasis ? 'accent' : 'surface'} lift={emphasis ? 'flat' : 'card'}>
      <YStack gap={space.sm}>
        <XStack ai="center" gap={space.sm}>
          <BankLogo code={account.bankCode} size={BADGE_SIZE} radius={radius.md} />
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

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <YStack gap={2}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
        {value}
      </Text>
    </YStack>
  );
}
