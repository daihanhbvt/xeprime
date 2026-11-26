import { Text, XStack, YStack } from 'tamagui';
import { findBank } from '@xeprime/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { BankAccount } from '@/api/bank-accounts/api';
import { bankAccountTitle } from '../current-account';
import { BankLogo } from './BankLogo';

/** Ô logo chữ nhật ngang: logo ngang (Techcombank, MB…) đủ lớn mà không bị cắt. */
const LOGO_HEIGHT = 40;
const LOGO_WIDTH = 80;

/**
 * Một tài khoản nhận tiền dạng thẻ gọn (người dùng chốt 26/11/2026): thẻ trắng viền mảnh, logo
 * đứng trơn bên TRÁI (không ô nền), bên phải họ tên viết hoa đậm · số đã che · tên đầy đủ ngân
 * hàng mờ. Dùng ở khối "Tài khoản nhận tiền" của ví và ô "Tài khoản nhận" của tấm rút tiền.
 */
export function BankAccountInline({ account }: { account: BankAccount }) {
  const colors = useColors();
  const bank = findBank(account.bankCode);
  return (
    <XStack
      ai="center"
      gap={space.md}
      p={space.md}
      br={radius.control}
      bw={1}
      bc={colors.border}
      bg={colors.surface}
      minWidth={0}
    >
      <BankLogo
        code={account.bankCode}
        size={LOGO_HEIGHT}
        width={LOGO_WIDTH}
        radius={0}
        fit="contain"
        plain
      />
      <YStack f={1} minWidth={0} gap={2}>
        <Text
          col={colors.text}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.semibold}
          textTransform="uppercase"
          numberOfLines={1}
        >
          {account.accountName}
        </Text>
        <Text col={colors.text} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight} letterSpacing={1}>
          {account.accountNumberMasked}
        </Text>
        {/* Tên ngân hàng là tên riêng - không dịch (ADR 0012). */}
        <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight} numberOfLines={2}>
          {bank ? bank.fullName : bankAccountTitle(account)}
        </Text>
      </YStack>
    </XStack>
  );
}
