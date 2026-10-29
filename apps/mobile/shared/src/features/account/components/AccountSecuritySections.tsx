import type { LayoutChangeEvent } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Card } from '@/components/ui/Card';
import { SettingRow } from '@/components/ui/SettingRow';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';

/** Tiêu đề + lời dẫn một phần của trang — gương `SectionCard` (title/hint) bên web. */
export function SectionHead({
  title,
  hint,
  danger = false,
}: {
  title: string;
  hint?: string;
  danger?: boolean;
}) {
  const colors = useColors();
  return (
    <YStack gap={2}>
      <Text col={danger ? colors.danger : colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
        {title}
      </Text>
      {hint ? (
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {hint}
        </Text>
      ) : null}
    </YStack>
  );
}

/**
 * Hai khối cuối của trang tài khoản — Mật khẩu · Xoá tài khoản — chung cho "Tài khoản & bảo mật"
 * và "Hồ sơ chủ xe" (web `AccountSecuritySections`). Trên native cả hai là MÀN riêng đã có sẵn, nên
 * ở đây chúng là dòng dẫn đi chứ không phải bản sao biểu mẫu.
 *
 * Xoá tài khoản đứng RIÊNG một thẻ, tông nguy hiểm: xếp nó ngay dưới "đổi mật khẩu", cùng cỡ chữ
 * cùng màu, là mời người dùng chạm nhầm vào thứ không rút lại được.
 */
export function AccountSecuritySections({
  onPasswordLayout,
  onDeleteLayout,
}: {
  onPasswordLayout?: (event: LayoutChangeEvent) => void;
  onDeleteLayout?: (event: LayoutChangeEvent) => void;
}) {
  const t = useTranslations('Navigation');
  const tAccount = useTranslations('Account');
  const tHub = useTranslations('Account.hub');

  return (
    <>
      <YStack gap={space.sm} {...(onPasswordLayout ? { onLayout: onPasswordLayout } : {})}>
        <SectionHead title={tHub('sections.password')} hint={tHub('sections.passwordHint')} />
        <Card padded={false}>
          <YStack px={space.md} py={space.xs}>
            <SettingRow
              icon="lock-closed-outline"
              label={t('account.changePassword')}
              description={tAccount('changePassword.subtitle')}
              href={ROUTES.account.changePassword()}
            />
          </YStack>
        </Card>
      </YStack>

      <YStack gap={space.sm} {...(onDeleteLayout ? { onLayout: onDeleteLayout } : {})}>
        <SectionHead title={tHub('sections.delete')} hint={tHub('sections.deleteHint')} danger />
        <Card padded={false}>
          <YStack px={space.md} py={space.xs}>
            <SettingRow
              icon="trash-outline"
              label={t('account.deleteAccount')}
              description={tAccount('deleteAccount.subtitle')}
              href={ROUTES.account.deleteAccount()}
              danger
            />
          </YStack>
        </Card>
      </YStack>
    </>
  );
}
