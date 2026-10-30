import { Ionicons } from '@expo/vector-icons';
import { Switch } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import type { IconName } from '@/components/ui/Chip';
import { makeStyles, themed, useAppScheme, useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

const useSwitchTrack = themed((colors) => ({ false: colors.borderInput, true: colors.primary }));

/**
 * Hai tuỳ chọn thuộc về THIẾT BỊ, không thuộc về tài khoản: giao diện sáng/tối và ngôn ngữ.
 *
 * Chỉ còn dùng ở menu tài khoản của app Partner (`ManageAccountSheet`). App KHÁCH dùng
 * `PreferenceToggleRows` (hình menu web) ở menu avatar + thẻ hồ sơ; chưa đăng nhập thì sáng/tối ở
 * nút trên thanh và ngôn ngữ ở chân trang chủ (27/10/2026).
 */
export function PreferenceRows({ theme = true }: { theme?: boolean }) {
  const t = useTranslations('Navigation.public');
  const tCommon = useTranslations('Common.locale');
  const { scheme, setScheme } = useAppScheme();
  const track = useSwitchTrack();
  const dark = scheme === 'dark';

  return (
    <YStack>
      {theme ? (
        <Row icon="moon-outline" label={t('appearance')}>
          <Switch
            value={dark}
            onValueChange={(next) => setScheme(next ? 'dark' : 'light')}
            accessibilityLabel={t('toggleTheme')}
            trackColor={track}
          />
        </Row>
      ) : null}
      <Row icon="language-outline" label={tCommon('switchLabel')}>
        <LocaleSwitcher />
      </Row>
    </YStack>
  );
}

function Row({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}) {
  const colors = useColors();
  const styles = useStyles();
  return (
    <XStack ai="center" gap={space.sm} px={space.md} minHeight={sizing.touchTarget} py={space.xs}>
      <YStack style={styles.dot}>
        <Ionicons name={icon} size={iconSize.sm} color={colors.primaryActive} />
      </YStack>
      <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.medium} numberOfLines={1}>
        {label}
      </Text>
      {children}
    </XStack>
  );
}

const useStyles = makeStyles((colors) => ({
  dot: {
    alignItems: 'center',
    backgroundColor: colors.primaryLight,
    borderRadius: radius.pill,
    height: sizing.compactBox,
    justifyContent: 'center',
    width: sizing.compactBox,
  },
}));
