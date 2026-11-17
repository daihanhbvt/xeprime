import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Button } from '@/components/ui/Button';
import { IconButton } from '@/components/ui/IconButton';
import { useCopy } from '@/hooks/use-copy';
import { APP_NAME } from '@/lib/app-name';
import { resolvePartnerLoginUrl } from '@/lib/partner-web-url';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

/**
 * Thông tin đăng nhập vừa cấp / vừa đặt lại cho một nhân viên (ADR 0087) — bản native của web
 * `StaffCredentials`. Hiện ĐÚNG MỘT LẦN: mật khẩu không lưu ở đâu để xem lại (không cache, không
 * log), nên mỗi dòng có nút sao chép và "Sao chép tất cả" ra đúng một đoạn để chủ dán vào Zalo.
 *
 * Dòng "Địa chỉ đăng nhập": URL trang đăng nhập site partner như web (`EXPO_PUBLIC_PARTNER_WEB_URL`);
 * bundle không khai biến đó thì ghi tên app, vì nhân viên cũng đăng nhập được ngay trong app.
 */
export function StaffCredentials({
  name,
  username,
  password,
  body,
}: {
  /** Tên nhân viên — nhãn trợ năng của cả khối (web `aria-label={name}`). */
  name: string;
  username: string | null;
  password: string;
  /** Câu dẫn — "Gửi thông tin… cho {name}" khi tạo, "Gửi mật khẩu mới…" khi đặt lại. */
  body: string;
}) {
  const colors = useColors();
  const t = useTranslations('Members.staff.created');
  const copy = useCopy();
  const loginTarget = resolvePartnerLoginUrl() ?? APP_NAME;

  const rows = [
    { key: 'url', label: t('loginUrl'), value: loginTarget },
    ...(username ? [{ key: 'username', label: t('username'), value: username }] : []),
    { key: 'password', label: t('password'), value: password },
  ];

  return (
    <YStack gap={space.md} accessibilityLabel={name}>
      <Text col={colors.text} fos={fontSize.body}>
        {body}
      </Text>
      <YStack gap={space.sm}>
        {rows.map((row) => (
          <XStack
            key={row.key}
            ai="center"
            gap={space.sm}
            p={space.sm}
            br={radius.control}
            bw={1}
            bc={colors.border}
            bg={colors.neutralSurface}
          >
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.textMuted} fos={fontSize.meta}>
                {row.label}
              </Text>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold} selectable>
                {row.value}
              </Text>
            </YStack>
            <IconButton
              icon="copy-outline"
              label={`${t('copy')} ${row.label}`}
              onPress={() => void copy(row.value)}
            />
          </XStack>
        ))}
      </YStack>
      <Button
        label={t('copyAll')}
        icon="copy-outline"
        variant="secondary"
        onPress={() =>
          void copy(t('copyText', { url: loginTarget, username: username ?? '', password }))
        }
      />
    </YStack>
  );
}
