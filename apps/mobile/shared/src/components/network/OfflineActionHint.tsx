import { Ionicons } from '@expo/vector-icons';
import { Text, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { useIsOnline } from '@/hooks/use-is-online';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, space } from '@/theme/tokens';

/**
 * Chữ nhỏ đặt ngay DƯỚI một nút bị khoá vì offline — một cách nói lý do cho mọi hành động chính
 * (gửi yêu cầu đặt xe, thanh toán, gửi tin, huỷ chuyến). Không vẽ gì khi online.
 *
 * Nút tự khoá bằng `disabled={!online}` từ `useIsOnline()`; component này chỉ giải thích vì sao,
 * để nút xám không đọc thành "thiếu quyền" hay "app treo".
 */
export function OfflineActionHint({ align = 'center' }: { align?: 'center' | 'start' }) {
  const online = useIsOnline();
  const t = useTranslations('MobileShell.network');
  const colors = useColors();
  const styles = useStyles();
  if (online) return null;
  return (
    <View
      accessibilityLiveRegion="polite"
      style={[styles.row, align === 'start' ? styles.start : styles.center]}
    >
      <Ionicons name="cloud-offline-outline" size={iconSize.xs} color={colors.warning} />
      <Text style={styles.text}>{t('actionBlocked')}</Text>
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs, marginTop: space.xs },
  center: { justifyContent: 'center' },
  start: { justifyContent: 'flex-start' },
  text: { fontSize: fontSize.label, color: colors.warning, flexShrink: 1 },
}));
