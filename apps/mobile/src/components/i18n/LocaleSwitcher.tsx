import { StyleSheet, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { LOCALES } from '@/i18n/config';
import { useAppLocale } from '@/i18n/I18nProvider';
import { space } from '@/theme/tokens';

export function LocaleSwitcher() {
  const t = useTranslations('Common.locale');
  const { locale, setLocale } = useAppLocale();

  return (
    <View style={styles.row}>
      {LOCALES.map((option) => (
        <View key={option} style={styles.item}>
          <Button
            label={t(option)}
            variant={option === locale ? 'primary' : 'secondary'}
            onPress={() => setLocale(option)}
          />
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    gap: space.sm,
  },
  item: {
    flex: 1,
  },
});
