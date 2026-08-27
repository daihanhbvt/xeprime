import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { StatusIcon, STATUS_TONE } from '@/components/ui/StatusIcon';
import { colors, fontSize, space } from '@/theme/tokens';

/**
 * Bước sau khi tạo tài khoản thành công — bản native của
 * `apps/web/src/features/auth/components/RegisterSuccess.tsx`.
 *
 * Luật của web, giữ nguyên: đăng ký xong **không** đẩy vào cổng quản lý và **không** hiện form
 * tạo gian hàng. Khách được mời chứ không bị bắt trở thành chủ xe (ADR 0014).
 *
 * Web còn nút "Trở thành chủ xe" dẫn tới `/manage/onboarding`; cổng quản lý chưa có mặt trong
 * app nên nút đó — và `registered.ownerNote` vốn là chú thích cho nó — chưa xuất hiện ở đây.
 * Thêm vào cùng đợt port khu `manage`, đừng dựng một lối đi dẫn ra màn trống.
 */
export function RegisterSuccess({
  onContinue,
  onOpenAccount,
}: {
  onContinue: () => void;
  onOpenAccount: () => void;
}) {
  const t = useTranslations('Auth');

  return (
    <YStack ai="center" gap={space.lg}>
      <StatusIcon icon="checkmark-circle" tone={STATUS_TONE.SUCCESS} />

      <YStack ai="center" gap={space.xs}>
        <Text col={colors.text} fontFamily="$heading" fos={fontSize.h2} ta="center">
          {t('registered.title')}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.body} ta="center">
          {t('registered.body')}
        </Text>
      </YStack>

      <YStack gap={space.sm} w="100%">
        <Button label={t('modal.continueLabel')} onPress={onContinue} />
        <Button
          label={t('registered.openAccount')}
          variant="secondary"
          icon="person-outline"
          onPress={onOpenAccount}
        />
      </YStack>
    </YStack>
  );
}
