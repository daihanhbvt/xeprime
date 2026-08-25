import { useRouter } from 'expo-router';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useTranslations } from 'use-intl';
import { images } from '@/assets';
import { LocaleSwitcher } from '@/components/i18n/LocaleSwitcher';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { getApiBaseUrl } from '@/lib/api-client';
import { elevation } from '@/theme/elevation';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';

export default function HomeScreen() {
  const router = useRouter();
  const t = useTranslations('MobileShell');

  return (
    <Screen>
      <View style={styles.header}>
        <Image source={images.logo} style={styles.logo} resizeMode="contain" />
        <View style={styles.headerText}>
          <Text style={styles.title}>{t('home.title')}</Text>
          <Text style={styles.apiUrl}>{getApiBaseUrl()}</Text>
        </View>
      </View>

      <View style={styles.card}>
        <Text style={styles.cardTitle}>{t('home.placeholderTitle')}</Text>
        <Text style={styles.muted}>{t('home.placeholderDescription')}</Text>
      </View>

      <LocaleSwitcher />

      <Button
        label={t('nav.goToLogin')}
        variant="secondary"
        onPress={() => router.replace('/login')}
      />
    </Screen>
  );
}

const styles = StyleSheet.create({
  logo: {
    borderRadius: radius.md,
    height: 48,
    width: 48,
  },
  header: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: space.sm,
  },
  headerText: {
    flexShrink: 1,
    gap: space.xs,
  },
  title: {
    color: colors.text,
    fontSize: fontSize.h2,
    fontWeight: fontWeight.bold,
  },
  apiUrl: {
    color: colors.textMuted,
    fontSize: fontSize.bodySm,
  },
  card: {
    backgroundColor: colors.surface,
    borderColor: colors.border,
    borderRadius: radius.md,
    borderWidth: 1,
    gap: space.sm,
    padding: space.md,
    ...elevation.card,
  },
  cardTitle: {
    color: colors.text,
    fontSize: fontSize.h3,
    fontWeight: fontWeight.semibold,
  },
  muted: {
    color: colors.textMuted,
    fontSize: fontSize.body,
  },
});
