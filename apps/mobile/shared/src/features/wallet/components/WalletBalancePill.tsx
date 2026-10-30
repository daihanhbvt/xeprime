import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { WALLET_SCOPE } from '@/api/wallet/api';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, sizing, space } from '@/theme/tokens';
import { setBalanceHidden, useBalanceVisibility } from '../balance-visibility';
import { useWalletSummary } from '../hooks/use-wallet';
import { walletHrefFor, walletScopeFor } from '../wallet-scope';

/** Chuỗi che số dư — đúng `MASK` của web. */
const MASK = '••••••';
/** Biểu tượng mắt 16px của web (`.eye`). */
const EYE_SIZE = 16;

/**
 * Viên "Số dư" ở đầu thẻ hồ sơ — bản native của `WalletBalancePill` web: nút mắt ẩn/hiện số (ghi
 * nhớ trên máy, như `localStorage` của web) + "Số dư: <số> ›" mở mục Quản lý thanh toán.
 *
 * Như web: đang tải, hỏng, hay tài khoản không có ví ⇒ không dựng gì — một ô "—" làm người dùng
 * tưởng tiền của mình có vấn đề, trong khi thứ hỏng chỉ là một lối tắt.
 */
export function WalletBalancePill() {
  const colors = useColors();
  const t = useTranslations('Wallet');
  const fmt = useAppFormat();
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();
  // Chưa đọc xong lựa chọn đã lưu ⇒ che số (không lộ một nhịp rồi mới che).
  const { hidden, ready } = useBalanceVisibility();
  const masked = hidden || !ready;
  const scope = walletScopeFor(user);
  const summary = useWalletSummary(scope ?? WALLET_SCOPE.ACCOUNT, Boolean(user) && scope !== null);

  if (!user || !scope || !summary.data) return null;

  return (
    /*
     * Viên số dư — `.pill` của `WalletBalancePill.module.css` web: cao tối thiểu 44, đệm trái
     * `space-xs` / phải `space-md`, viền `border-strong` 1px, bo `radius-control` (12), nền
     * `bg-container`. Tiền tố `text-secondary` body · số `primary-hover` semibold.
     */
    <XStack
      alignSelf="flex-start"
      ai="center"
      gap={space.xs}
      minHeight={sizing.touchTarget}
      paddingLeft={space.xs}
      paddingRight={space.md}
      bw={1}
      bc={colors.borderInput}
      br={radius.control}
      bg={colors.surface}
    >
      <Pressable
        onPress={() => setBalanceHidden(!hidden)}
        accessibilityRole="button"
        accessibilityState={{ selected: hidden }}
        accessibilityLabel={hidden ? t('pill.show') : t('pill.hide')}
        hitSlop={space.xs}
        style={{
          width: sizing.touchTarget,
          height: sizing.touchTarget,
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <Ionicons
          name={hidden ? 'eye-off-outline' : 'eye-outline'}
          size={EYE_SIZE}
          color={colors.textMuted}
        />
      </Pressable>
      <Pressable
        onPress={() => navigateOnce(walletHrefFor(scope))}
        accessibilityRole="link"
        style={({ pressed }) => (pressed ? { opacity: 0.7 } : null)}
      >
        <XStack ai="center" gap={space.xs}>
          <Text col={colors.textMuted} fos={fontSize.body}>
            {t('pill.prefix')}
          </Text>
          <Text col={colors.primaryHover} fos={fontSize.body} fow={fontWeight.semibold}>
            {masked ? MASK : fmt.money(summary.data.available)}
          </Text>
          <Ionicons name="chevron-forward" size={12} color={colors.placeholder} />
        </XStack>
      </Pressable>
    </XStack>
  );
}
