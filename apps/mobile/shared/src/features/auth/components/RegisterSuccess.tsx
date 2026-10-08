import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MOBILE_CLIENT_APP } from '@xeprime/types';
import { APP_PROFILE } from '@/app-profile';
import { Button } from '@/components/ui/Button';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';

/** Đĩa dấu tích — cùng cỡ với đĩa minh hoạ của màn hướng dẫn "Trở thành chủ xe". */
const HERO_DISC = 132;
const HERO_ICON = 60;
/** Hai vòng tròn trang trí ở nền sân khấu — cùng chất liệu với màn hướng dẫn. */
const ORB_LARGE = 260;
const ORB_SMALL = 140;

const styles = StyleSheet.create({
  orbLarge: { position: 'absolute', top: -ORB_LARGE / 3, right: -ORB_LARGE / 3, opacity: 0.35 },
  orbSmall: { position: 'absolute', bottom: -ORB_SMALL / 3, left: -ORB_SMALL / 3, opacity: 0.25 },
});

/**
 * Bước sau khi tạo tài khoản thành công — bản native của
 * `apps/web/src/features/auth/components/RegisterSuccess.tsx`.
 *
 * Luật của web, giữ nguyên: đăng ký xong **không** đẩy vào cổng quản lý và **không** hiện form
 * tạo gian hàng. Khách được mời chứ không bị bắt trở thành chủ xe (ADR 0014).
 *
 * HAI BẢN theo app (06/10/2026) — trước đó app Partner dùng y nguyên câu của app khách và mời
 * người vừa tạo tài khoản ĐỐI TÁC đi "tìm và đặt xe", một việc realm `partner` không làm được
 * (ADR 0053 điều 7):
 *
 *  - app khách: tiếp tục việc đang làm, hoặc mở tài khoản — hai nút như web;
 *  - app Partner: web không có bước này (site partner đăng ký xong là tới thẳng màn chọn cách cho
 *    thuê), nên ở đây nó chỉ là một lời xác nhận có MỘT nút dẫn đúng vào màn đó. Không có nút
 *    "Cập nhật tài khoản": tài khoản đối tác vừa tạo chưa có gì để cập nhật, và `ScopeGuard` sẽ
 *    đưa họ về đúng màn chọn tuyến dù bấm nút nào.
 *
 * Bố cục dựng theo màn hướng dẫn "Trở thành chủ xe": sân khấu màu thương hiệu chiếm phần trên,
 * chữ căn giữa, nút nằm dưới cùng.
 */
export function RegisterSuccess({
  onContinue,
  onOpenAccount,
}: {
  onContinue: () => void;
  onOpenAccount: () => void;
}) {
  const t = useTranslations('Auth');
  const partner = APP_PROFILE.clientApp === MOBILE_CLIENT_APP.PARTNER;
  const ns = partner ? 'registeredPartner' : 'registered';

  return (
    <YStack f={1} gap={space.lg}>
      <YStack h={280} br={radius.lg} ov="hidden" ai="center" jc="center" bg={colors.primaryLight}>
        <YStack
          w={ORB_LARGE}
          h={ORB_LARGE}
          br={ORB_LARGE / 2}
          bg={colors.primary}
          style={styles.orbLarge}
        />
        <YStack
          w={ORB_SMALL}
          h={ORB_SMALL}
          br={ORB_SMALL / 2}
          bg={colors.primary}
          style={styles.orbSmall}
        />
        <YStack
          w={HERO_DISC}
          h={HERO_DISC}
          br={HERO_DISC / 2}
          ai="center"
          jc="center"
          bg={colors.success}
        >
          <Ionicons name="checkmark" size={HERO_ICON} color={colors.onPrimary} />
        </YStack>
      </YStack>

      <YStack ai="center" gap={space.sm}>
        <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold} ta="center">
          {t(`${ns}.title`)}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.body} ta="center" maxWidth={420}>
          {t(`${ns}.body`)}
        </Text>
      </YStack>

      {/* Chặng kế tiếp nói trước ở app Partner: màn sau là một lựa chọn, không phải một biểu mẫu. */}
      {partner ? (
        <XStack ai="flex-start" gap={space.sm} p={space.md} br={radius.md} bg={colors.surfaceMuted}>
          <Ionicons name="git-branch-outline" size={iconSize.md} color={colors.primaryActive} />
          <YStack f={1} minWidth={0} gap={2}>
            <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
              {t('registeredPartner.nextTitle')}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.label}>
              {t('registeredPartner.nextBody')}
            </Text>
          </YStack>
        </XStack>
      ) : null}

      <YStack gap={space.sm} w="100%">
        {partner ? (
          <Button label={t('registeredPartner.cta')} icon="arrow-forward" onPress={onContinue} />
        ) : (
          <>
            <Button label={t('modal.continueLabel')} icon="arrow-forward" onPress={onContinue} />
            <Button
              label={t('registered.openAccount')}
              variant="secondary"
              icon="person-outline"
              onPress={onOpenAccount}
            />
          </>
        )}
      </YStack>
    </YStack>
  );
}
