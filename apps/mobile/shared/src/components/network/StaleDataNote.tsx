import { Ionicons } from '@/components/icons/Ionicons';
import { Text, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { useIsOnline } from '@/hooks/use-is-online';
import { useAppFormat } from '@/i18n/use-app-format';
import { makeStyles, useColors } from '@/theme/ThemeProvider';
import { fontSize, iconSize, space } from '@/theme/tokens';
import { FONT_FAMILY } from '@/theme/fonts';

/**
 * "Đang offline · Dữ liệu cập nhật lúc …" — hiện CHỈ khi máy offline và màn đang có dữ liệu
 * (thường là bản khôi phục từ cache trên máy, `queries/query-persist.ts`). `dataUpdatedAt` là
 * mốc của chính query (`useQuery().dataUpdatedAt`), 0 = chưa từng có dữ liệu.
 *
 * `money`: màn có tiền / trạng thái thanh toán ⇒ thêm dòng nói rõ số đó có thể đã cũ — khách
 * không được hiểu một trạng thái chụp hôm qua là trạng thái bây giờ.
 */
export function StaleDataNote({ dataUpdatedAt, money = false }: { dataUpdatedAt: number; money?: boolean }) {
  const online = useIsOnline();
  const t = useTranslations('MobileShell.network');
  const fmt = useAppFormat();
  const colors = useColors();
  const styles = useStyles();
  if (online || !dataUpdatedAt) return null;
  return (
    <View style={styles.box} accessibilityRole="text">
      <View style={styles.row}>
        <Ionicons name="time-outline" size={iconSize.xs} color={colors.warning} />
        <Text style={styles.text}>
          {t('staleAt', { time: fmt.dateTime(new Date(dataUpdatedAt).toISOString()) })}
        </Text>
      </View>
      {money ? <Text style={styles.text}>{t('staleMoney')}</Text> : null}
    </View>
  );
}

const useStyles = makeStyles((colors) => ({
  box: { gap: space.xs, paddingVertical: space.xs },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.xs },
  text: { fontFamily: FONT_FAMILY.body, fontSize: fontSize.label, color: colors.warning, flexShrink: 1 },
}));
