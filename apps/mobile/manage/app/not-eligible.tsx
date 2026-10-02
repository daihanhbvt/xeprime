import { useRouter } from 'expo-router';
import { useTranslations } from 'use-intl';
import { YStack } from 'tamagui';
import { Screen } from '@/components/layout/Screen';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { LogoutRow } from '@/features/shell/LogoutRow';
import { ROUTES } from '@/navigation/routes';

/**
 * Phiên hợp lệ nhưng tài khoản NGOÀI PHẠM VI app Partner — bản màn hình của mã lỗi
 * `PARTNER_ACCESS_REQUIRED` (403). `ScopeGuard` đá về đây khi tenant rời tuyến gói giữa
 * phiên (server chỉ gác lúc ĐĂNG NHẬP, nên ca mất quyền giữa chừng hạ cánh ở đây).
 * Lối thoát duy nhất là đăng xuất để vào bằng tài khoản gian hàng.
 */
export default function NotEligibleRoute() {
  const t = useTranslations('MobileShell.partner');
  const router = useRouter();

  return (
    <Screen scroll={false}>
      {/*
        `ScreenMessage` tự có `f={1}` nên nó phải nằm trong một khung CÓ CHIỀU CAO riêng; đặt
        thẳng cạnh `LogoutRow` trong một cột thì hai phần tử chồng lên nhau (lỗi thấy trên
        emulator 28/09/2026).
      */}
      <YStack f={1} ai="stretch">
        <YStack f={1}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('notEligibleTitle')}
            description={t('notEligibleDescription')}
          />
        </YStack>
        <LogoutRow onDone={() => router.replace(ROUTES.account.login())} />
      </YStack>
    </Screen>
  );
}
