import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { SvgXml } from 'react-native-svg';
import { Linking, ScrollView, StyleSheet } from 'react-native';
import { Image } from 'expo-image';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { isRegistrationTrack } from '@xeprime/types';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PARTNER_HERO_RATIO, images } from '@/assets';
import { AppHeader } from '@/components/layout/AppHeader';
import { Button } from '@/components/ui/Button';
import { InlineAction } from '@/components/ui/InlineAction';
import { fireAndForget } from '@/lib/fire-and-forget';
import { goBackOr } from '@/navigation/go-back-or';
import { PARTNER_HANDOFF_INTENT, ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import {
  PARTNER_APP_TARGET,
  PARTNER_AUTH_ENTRY,
  type PartnerAuthEntry,
  openPartnerApp,
  partnerStoreUrl,
  type PartnerAppTarget,
} from './open-partner-app';
import { PARTNER_PERK_ICONS } from './partner-perk-icons';

/** Đĩa minh hoạ của trạng thái "chưa cài app". */
const HERO_DISC = 132;
const HERO_ICON = 60;

/** Bốn ô lợi ích — thứ tự đúng Figma (hàng 1: nhanh · đơn; hàng 2: hỗ trợ · doanh thu). */
const PERKS = ['fast', 'orders', 'support', 'revenue'] as const;

/**
 * TẠM ẨN (28/10/2026): nút "Đăng ký tài khoản XePrime Partner" và dòng "Đã có tài khoản đối tác?
 * Đăng nhập" ở màn mời làm đối tác. Bật lại bằng `true` khi app Partner đã lên cửa hàng.
 */
const SHOW_PARTNER_REGISTER_ACTIONS = false;

const styles = StyleSheet.create({
  art: { width: '100%' },
  content: { padding: layout.screenX, gap: space.md },
});

type OpenState = 'idle' | 'notInstalled';

/**
 * Màn HANDOFF sang app XePrime Partner — đích của mọi `ROUTES.manage.*` và mọi CTA chủ xe ở app
 * Customer. Từ ADR 0053 tài khoản khách không có gian hàng: đăng xe và quản lý đều diễn ra ở app
 * Partner với một tài khoản ĐỐI TÁC riêng.
 *
 * Bố cục (28/10/2026) theo Figma `21943:42616` "Dành cho đối tác" (không nhắc gói — app khách không IAP);
 * nút Đăng ký / Đăng nhập ghim đáy. Mở app bằng scheme; chưa cài thì sang trạng thái riêng: có link
 * cửa hàng thì mời tải, chưa có thì nói thẳng app chưa lên cửa hàng.
 *
 * `intent=register` nhắm deep link vào luồng đăng ký; lời mời mở đúng lời mời; còn lại mở gốc app.
 * Không điều hướng nội bộ tới route Partner nào — app này không đăng ký chúng.
 */
export function PartnerHandoffScreen() {
  const colors = useColors();
  const t = useTranslations('MobileShell.partner');
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [openState, setOpenState] = useState<OpenState>('idle');

  const { intent, token, track } = useLocalSearchParams<{
    intent?: string;
    token?: string;
    track?: string;
  }>();
  const registrationTrack = isRegistrationTrack(track) ? track : undefined;
  const target: PartnerAppTarget =
    intent === PARTNER_HANDOFF_INTENT.REGISTER
      ? PARTNER_APP_TARGET.REGISTER
      : intent === PARTNER_HANDOFF_INTENT.INVITE && token
        ? PARTNER_APP_TARGET.INVITE
        : PARTNER_APP_TARGET.HOME;
  const isRegister = target === PARTNER_APP_TARGET.REGISTER;

  const leave = () => goBackOr(router, ROUTES.account.home());

  const open = (entry: PartnerAuthEntry = PARTNER_AUTH_ENTRY.REGISTER) =>
    fireAndForget(async () => {
      const opened = await openPartnerApp(target, {
        entry,
        ...(token ? { inviteToken: token } : {}),
        ...(registrationTrack ? { track: registrationTrack } : {}),
      });
      if (!opened) setOpenState('notInstalled');
    }, 'PartnerHandoffScreen.open');

  if (openState === 'notInstalled') {
    return <NotInstalled onRetry={() => setOpenState('idle')} onLater={leave} />;
  }

  return (
    <YStack f={1} bg={colors.background} pb={insets.bottom + space.md}>
      <AppHeader onBack={leave} title={t('headerTitle')} />

      <ScrollView contentContainerStyle={styles.content}>
        {/* Figma `21943:42616` "Dành cho đối tác": hai dòng tiêu đề, dòng vàng lớn, câu dẫn. */}
        <YStack gap={space.sm}>
          <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.semibold} accessibilityRole="header">
            {t('landing.headline')}
          </Text>
          <Text col={colors.primary} fos={fontSize.h1} fow={fontWeight.bold}>
            {t('landing.highlight')}
          </Text>
          <Text col={colors.placeholder} fos={fontSize.body}>
            {t('landing.body')}
          </Text>
        </YStack>

        <Image
          source={images.partnerHero}
          style={[styles.art, { aspectRatio: PARTNER_HERO_RATIO }]}
          contentFit="contain"
          accessible={false}
        />

        {/* Bốn lợi ích, lưới 2 × 2: icon Figma trong vòng tròn vàng nhạt + nhãn. */}
        <YStack gap={space.md}>
          {[PERKS.slice(0, 2), PERKS.slice(2)].map((row) => (
            <XStack key={row[0]!} gap={20}>
              {row.map((perk) => (
                <XStack key={perk} f={1} ai="center" gap={space.sm}>
                  <YStack p={12} br={radius.pill} bg={colors.primarySubtle}>
                    <SvgXml xml={PARTNER_PERK_ICONS[perk]} width={24} height={24} />
                  </YStack>
                  <Text f={1} col={colors.textMuted} fos={fontSize.body} fow={fontWeight.medium}>
                    {t(`landing.perks.${perk}`)}
                  </Text>
                </XStack>
              ))}
            </XStack>
          ))}
        </YStack>
      </ScrollView>

      {/* Lối hành động ghim đáy — tài khoản ĐỐI TÁC tách với tài khoản khách (ADR 0053). */}
      <YStack px={layout.screenX} pt={space.sm} gap={space.xs}>
        {isRegister ? (
          !SHOW_PARTNER_REGISTER_ACTIONS ? null : (
          <>
            <Button
              label={t('openRegister')}
              icon="person-add-outline"
              onPress={() => open(PARTNER_AUTH_ENTRY.REGISTER)}
            />
            <XStack jc="center" ai="center" gap={space.xs} pt={space.xs}>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('haveAccount')}
              </Text>
              <InlineAction
                label={t('loginLink')}
                onPress={() => open(PARTNER_AUTH_ENTRY.LOGIN)}
              />
            </XStack>
          </>
          )
        ) : (
          <Button label={t('open')} icon="open-outline" onPress={() => open()} />
        )}
      </YStack>
    </YStack>
  );
}

/**
 * Không mở được app Partner (máy chưa cài). Có link cửa hàng thì mời tải; CHƯA lên cửa hàng thì
 * nói thẳng như vậy — hiện tại app chưa phát hành nên đây là nhánh người dùng thật sẽ gặp.
 */
function NotInstalled({ onRetry, onLater }: { onRetry: () => void; onLater: () => void }) {
  const colors = useColors();
  const t = useTranslations('MobileShell.partner');
  const insets = useSafeAreaInsets();
  const storeUrl = partnerStoreUrl();

  return (
    <YStack
      f={1}
      bg={colors.background}
      pt={insets.top + space.xl}
      pb={insets.bottom + space.md}
      px={layout.screenX}
    >
      <YStack f={1} ai="center" jc="center" gap={space.lg}>
        <YStack
          w={HERO_DISC}
          h={HERO_DISC}
          br={HERO_DISC / 2}
          ai="center"
          jc="center"
          bg={colors.primaryLight}
        >
          <Ionicons
            name={storeUrl ? 'download-outline' : 'time-outline'}
            size={HERO_ICON}
            color={colors.primaryActive}
          />
        </YStack>
        <YStack gap={space.sm} ai="center" maxWidth={420}>
          <Text col={colors.text} fos={fontSize.h3} fow={fontWeight.bold} ta="center">
            {storeUrl ? t('notInstalledTitle') : t('comingSoonTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.body} ta="center">
            {storeUrl ? t('notInstalledBody') : t('comingSoonBody')}
          </Text>
        </YStack>
      </YStack>
      <YStack gap={space.xs}>
        {storeUrl ? (
          <Button
            label={t('storeCta')}
            icon="download-outline"
            onPress={() => fireAndForget(() => Linking.openURL(storeUrl), 'PartnerHandoff.store')}
          />
        ) : null}
        <Button label={t('retry')} variant="secondary" onPress={onRetry} />
        <Button label={t('later')} variant="ghost" onPress={onLater} />
      </YStack>
    </YStack>
  );
}
