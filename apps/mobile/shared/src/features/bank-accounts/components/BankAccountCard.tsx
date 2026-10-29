import type { ReactNode } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR } from '@xeprime/types';
import { findBank } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BankAccount } from '@/api/bank-accounts/api';
import { bankAccountTitle } from '../current-account';
import { BankLogo } from './BankLogo';

const BADGE_SIZE = 40;
/** Logo của hình `detail` — đủ lớn để đọc được chữ trong logo ngân hàng. */
const DETAIL_BADGE_SIZE = 56;

/**
 * Thẻ MỘT tài khoản nhận tiền — bản native của web `BankAccountCard`. Cùng một hình ở mọi nơi tài
 * khoản hiện ra: khối tài khoản nhận tiền, tấm rút tiền, tấm khai tài khoản nhận hoàn.
 *
 * `emphasis` cho nơi thẻ là ĐÍCH của một lệnh chi sắp gửi (tấm rút): nền màu chính. `action` là
 * lối rẽ phụ đặt dưới thẻ (nút "Đổi tài khoản") — xếp DỌC để không chật trên màn hẹp.
 *
 * `variant="detail"` — hình của tab "Tài khoản thanh toán" khu tài khoản khách: hàng đầu logo +
 * tên ngân hàng + `action` (nút "Đổi" gọn), rồi số tài khoản (đã che) · người thụ hưởng · tên gợi nhớ.
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
  const colors = useColors();
  const t = useTranslations('BankAccounts');

  if (variant === 'detail') {
    const bank = findBank(account.bankCode);
    /*
     * Dựng lại 29/10/2026 (người dùng chốt): đầu thẻ logo 56 + tên ngắn đậm + tên đầy đủ xuống dòng;
     * thông tin thành hàng nhãn ↔ giá trị; nút "Đổi tài khoản" ở chân thẻ, căn phải.
     */
    return (
      <YStack gap={space.sm} p={space.md} br={radius.lg} bw={1} bc={colors.borderSubtle} bg={colors.surface}>
        <XStack ai="center" gap={space.md}>
          <BankLogo code={account.bankCode} size={DETAIL_BADGE_SIZE} radius={radius.md} />
          <YStack f={1} minWidth={0} gap={2}>
            {/* Tên ngân hàng là tên riêng — không dịch (ADR 0012). Tên đầy đủ được XUỐNG DÒNG, không cắt '…'. */}
            <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
              {bank?.shortName ?? bankAccountTitle(account)}
            </Text>
            {bank ? (
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {bank.fullName}
              </Text>
            ) : null}
            {account.verifiedAt ? (
              <XStack pt={2}>
                <StatusBadge label={t('verifiedTag')} color={STATUS_COLOR.SUCCESS} size="sm" />
              </XStack>
            ) : null}
          </YStack>
        </XStack>
        <YStack gap={space.xs} pt={space.sm} borderTopWidth={1} borderTopColor={colors.borderSubtle}>
          <Fact label={t('detail.number')} value={account.accountNumberMasked} />
          <Fact label={t('detail.holder')} value={account.accountName.toUpperCase()} />
          <Fact label={t('detail.label')} value={account.label || t('detail.noLabel')} />
        </YStack>
        {action ? (
          <XStack jc="flex-end" pt={space.xs} borderTopWidth={1} borderTopColor={colors.borderSubtle}>
            {action}
          </XStack>
        ) : null}
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
  const colors = useColors();
  return (
    <XStack ai="flex-start" gap={space.sm}>
      <Text col={colors.textMuted} fos={fontSize.bodySm}>
        {label}
      </Text>
      <Text f={1} ta="right" col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {value}
      </Text>
    </XStack>
  );
}
