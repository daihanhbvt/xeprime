import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { getApiBaseUrl } from '@/lib/api-client';
import { colors } from '@/theme/colors';
import { elevation } from '@/theme/elevation';

export default function HomeScreen() {
  const router = useRouter();
  const t = useTranslations('Home');
  const tCommon = useTranslations('Common.actions');

  return (
    <Screen>
      <View style={styles.header}>
        <Image source={images.logo} style={styles.logo} resizeMode="contain" />
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('title')}</Text>
          <Text style={styles.apiUrl}>{getApiBaseUrl()}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('placeholder.title')}</Text>
        <Text style={styles.muted}>{t('placeholder.description')}</Text>
      </View>

      <LocaleSwitcher />

      <Button label={tCommon('goToLogin')} variant="secondary" onPress={() => router.replace('/login')} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: {
    borderRadius: 10,
    height: 48,
    width: 48,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: 12,
  },
  headerText: {
    flexShrink: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 24,
    fontWeight: '700',
  },
  apiUrl: {
    color: colors.textMuted,
    fontSize: 12,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: 12,
    borderWidth: 1,
    gap: 12,
    padding: 16,
    ...elevation.card,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  muted: {
    color: colors.textMuted,
    fontSize: 14,
  },
});
