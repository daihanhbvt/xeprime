import { getSecureItem, SECURE_KEY, setSecureItem } from '@/lib/secure-storage';
import Constants from 'expo-constants';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Animated, BackHandler, Easing, Linking, Modal, Platform, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  APP_UPDATE_LEVEL,
  parseAppVersion,
  resolveAppUpdateLevel,
  type AppUpdateLevel,
  type NativeAppKey,
} from '@xeprime/domain';
import { appVersionsApi } from '@/api/app-versions/api';
import { Button } from '@/components/ui/Button';
import { useAppActive } from '@/hooks/use-app-active';
import { layout } from '@/theme/layout';
import { useAppStyles } from '@/theme/styles';
import { useColors, useFloatingSurfaceBorder } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/** "Để sau" nhớ theo PHIÊN BẢN mới nhất trong 3 ngày — không phải bí mật, nằm cùng kho bền DUY NHẤT của app (`secure-storage`). */
const SNOOZE_MS = 3 * 24 * 60 * 60 * 1000;
/** Trở lại tiền cảnh dày hơn nhịp này thì không hỏi lại server. */
const MIN_CHECK_INTERVAL_MS = 30 * 60 * 1000;
const snoozeKey = (app: NativeAppKey) =>
  app === 'partner' ? SECURE_KEY.APP_UPDATE_SNOOZE_PARTNER : SECURE_KEY.APP_UPDATE_SNOOZE_CUSTOMER;

type Prompt = { level: AppUpdateLevel; storeUrl: string; latestVersion: string | null };

async function isSnoozed(app: NativeAppKey, version: string | null): Promise<boolean> {
  try {
    const raw = await getSecureItem(snoozeKey(app));
    if (!raw) return false;
    const saved = JSON.parse(raw) as { version?: string | null; until?: number };
    return saved.version === version && typeof saved.until === 'number' && saved.until > Date.now();
  } catch {
    return false;
  }
}

/**
 * Hộp nhắc cập nhật app — kiểm lúc mở app và mỗi lần trở lại tiền cảnh (giãn
 * `MIN_CHECK_INTERVAL_MS`). Dưới `minVersion` ⇒ bắt buộc (không đóng, chặn nút back Android);
 * dưới `latestVersion` ⇒ "Cập nhật / Để sau". Lỗi mạng ⇒ im lặng. Expo Go / dev (`0.0.0`,
 * không có version) ⇒ không hiện. Cấu hình ở env của API (docs/deployment.md §9.4c).
 */
export function AppUpdatePrompt({ app }: { app: NativeAppKey }) {
  const t = useTranslations('MobileShell.appUpdate');
  const colors = useColors();
  const appStyles = useAppStyles();
  const floatingBorder = useFloatingSurfaceBorder();
  const insets = useSafeAreaInsets();
  const active = useAppActive();
  const lastCheckAt = useRef(0);
  const [prompt, setPrompt] = useState<Prompt | null>(null);
  /** 0 = ẩn hẳn (tấm nằm dưới mép màn, nền trong suốt) · 1 = hiện. Một giá trị lái cả hai. */
  const progress = useRef(new Animated.Value(0)).current;

  const check = useCallback(async () => {
    if (Platform.OS !== 'ios' && Platform.OS !== 'android') return;
    const installed = Constants.expoConfig?.version;
    if (!parseAppVersion(installed)) return;
    lastCheckAt.current = Date.now();
    try {
      const config = await appVersionsApi.get(app, Platform.OS);
      const level = resolveAppUpdateLevel(installed, config);
      if (level === APP_UPDATE_LEVEL.NONE || !config.storeUrl) {
        setPrompt(null);
        return;
      }
      if (level === APP_UPDATE_LEVEL.OPTIONAL && (await isSnoozed(app, config.latestVersion))) return;
      setPrompt({ level, storeUrl: config.storeUrl, latestVersion: config.latestVersion });
    } catch {
      // Lỗi mạng / server: không chặn app, lần tiền cảnh sau thử lại.
      lastCheckAt.current = 0;
    }
  }, [app]);

  useEffect(() => {
    if (!active) return;
    if (Date.now() - lastCheckAt.current < MIN_CHECK_INTERVAL_MS) return;
    void check();
  }, [active, check]);

  const required = prompt?.level === APP_UPDATE_LEVEL.REQUIRED;

  // Bắt buộc: nút back Android không đóng được hộp (Modal `onRequestClose` cũng no-op).
  useEffect(() => {
    if (!required) return;
    const sub = BackHandler.addEventListener('hardwareBackPress', () => true);
    return () => sub.remove();
  }, [required]);

  // Hiện: nền mờ dần + tấm trượt lên bằng spring (mềm, hơi nảy). Chạy ở luồng native.
  useEffect(() => {
    if (!prompt) return;
    progress.setValue(0);
    Animated.spring(progress, {
      toValue: 1,
      useNativeDriver: true,
      damping: 18,
      stiffness: 180,
      mass: 0.9,
    }).start();
  }, [prompt, progress]);

  const later = useCallback(() => {
    if (!prompt || required) return;
    const value = JSON.stringify({ version: prompt.latestVersion, until: Date.now() + SNOOZE_MS });
    setSecureItem(snoozeKey(app), value).catch(() => undefined);
    // Trượt xuống rồi mới gỡ Modal — gỡ ngay thì tấm biến mất cái rụp.
    Animated.timing(progress, {
      toValue: 0,
      duration: 200,
      easing: Easing.in(Easing.cubic),
      useNativeDriver: true,
    }).start(() => setPrompt(null));
  }, [app, prompt, required, progress]);

  const update = useCallback(() => {
    if (!prompt) return;
    Linking.openURL(prompt.storeUrl).catch(() => undefined);
  }, [prompt]);

  if (!prompt) return null;

  return (
    <Modal
      visible
      transparent
      animationType="none"
      statusBarTranslucent
      onRequestClose={required ? () => undefined : later}
    >
      <YStack f={1}>
        <Animated.View style={[appStyles.scrim, { opacity: progress }]}>
          <Pressable
            style={StyleSheet.absoluteFill}
            onPress={required ? undefined : later}
            accessibilityLabel={required ? undefined : t('later')}
          />
        </Animated.View>
        <Animated.View
          style={{
            transform: [
              { translateY: progress.interpolate({ inputRange: [0, 1], outputRange: [360, 0] }) },
            ],
          }}
        >
        <YStack
          bg={colors.surface}
          borderTopLeftRadius={radius.lg}
          borderTopRightRadius={radius.lg}
          {...floatingBorder}
          px={layout.screenX}
          pt={layout.screenX}
          pb={layout.screenX + insets.bottom}
          gap={space.md}
          accessibilityViewIsModal
          accessibilityRole="alert"
        >
          <YStack w={56} h={56} br={28} ai="center" jc="center" bg={colors.primaryLight}>
            <Ionicons
              name={required ? 'alert-circle-outline' : 'cloud-download-outline'}
              size={28}
              color={colors.primary}
            />
          </YStack>
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.bold}>
              {required ? t('requiredTitle') : t('optionalTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {required
                ? t('requiredMessage')
                : prompt.latestVersion
                  ? t('optionalMessageVersion', { version: prompt.latestVersion })
                  : t('optionalMessage')}
            </Text>
          </YStack>
          <YStack gap={space.xs}>
            <Button label={t('update')} variant="primary" onPress={update} />
            {required ? null : <Button label={t('later')} variant="ghost" onPress={later} />}
          </YStack>
        </YStack>
        </Animated.View>
      </YStack>
    </Modal>
  );
}
