import { useState } from 'react';
import { Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { fireAndForget } from '@/lib/fire-and-forget';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, space } from '@/theme/tokens';
import {
  PARTNER_APP_TARGET,
  openPartnerApp,
  partnerDownloadUrl,
  type PartnerAppTarget,
} from './open-partner-app';

/**
 * Màn HANDOFF sang app XePrime Partner — đích của mọi `ROUTES.manage.*` ở app Customer, và
 * thân của màn "đăng ký gian hàng thành công".
 *
 * `success` đổi tiêu đề + lời dẫn (vừa tạo hồ sơ xong) và nhắm deep link vào bước onboarding;
 * còn lại là một lời mời trung tính. Cả hai KHÔNG điều hướng nội bộ tới route Partner nào —
 * app này không đăng ký chúng.
 */
export function PartnerHandoffScreen({ success = false }: { success?: boolean }) {
  const t = useTranslations('MobileShell.partner');
  const router = useRouter();
  const [openFailed, setOpenFailed] = useState(false);

  const target: PartnerAppTarget = success
    ? PARTNER_APP_TARGET.ONBOARDING
    : PARTNER_APP_TARGET.HOME;

  const open = () =>
    fireAndForget(async () => {
      const opened = await openPartnerApp(target);
      if (!opened) setOpenFailed(true);
    }, 'PartnerHandoffScreen.open');

  const download = () => {
    const url = partnerDownloadUrl();
    if (url) fireAndForget(() => Linking.openURL(url), 'PartnerHandoffScreen.download');
  };

  return (
    <>
      <AppHeader title={success ? t('successTitle') : t('title')} />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg} pt={space.lg}>
          <Text fontSize={fontSize.body} color={colors.textMuted}>
            {success ? t('successDescription') : t('intro')}
          </Text>
          {openFailed ? (
            <Text fontSize={fontSize.bodySm} color={colors.danger}>
              {t('openFailed')}
            </Text>
          ) : null}
          <YStack gap={space.sm}>
            <Button label={t('open')} onPress={open} />
            <Button label={t('download')} variant="secondary" onPress={download} />
            <Button
              label={t('later')}
              variant="ghost"
              onPress={() => goBackOr(router, ROUTES.account.home())}
            />
          </YStack>
        </YStack>
      </Screen>
    </>
  );
}
