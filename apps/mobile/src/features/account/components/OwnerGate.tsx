import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { space } from '@/theme/tokens';
import { resolveOwnerCtaHref } from '../account-nav';
import { useOwnerAccess } from '../hooks/use-owner-access';

/**
 * Cổng của các màn CHỦ XE trong khu tài khoản: danh sách xe, lịch xe, thông tin khai thuế, chi
 * tiết xe và cả 13 mục của không gian quản lý một chiếc xe — đúng những route web gác bằng
 * `OwnerGate` bên đó. Ba màn tài liệu tĩnh (cẩm nang, hợp đồng & chứng từ, bảo vệ dữ liệu) KHÔNG
 * đi qua đây: chúng không đọc dữ liệu của gian hàng nào, và ai đọc cũng không hại gì.
 *
 * Không phải chủ gian hàng thì `children` KHÔNG được render — tức không hook nào bên trong chạy,
 * không request tenant nào bay đi để rồi nhận 403. Người tới đây bằng deep link thấy một trạng
 * thái tử tế với đúng hai lối đi: trở thành chủ xe (hoặc về cổng quản lý nếu họ là nhân viên của
 * một gian hàng) và quay về tài khoản.
 *
 * Đây là lớp trải nghiệm; lớp chặn thật vẫn là guard backend (CLAUDE.md §3). Bản native của
 * `apps/web/src/features/account/components/OwnerGate.tsx`.
 */
export function OwnerGate({ children }: { children: ReactNode }) {
  const t = useTranslations('Account.ownerGate');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const { user, isOwner, isLoading } = useOwnerAccess();

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <ScreenLoading />
      </Screen>
    );
  }

  if (isOwner) return <>{children}</>;

  const shopName = user?.tenant?.name;

  return (
    <Screen scroll={false}>
      <ScreenMessage
        icon="storefront-outline"
        title={t('title')}
        description={shopName ? t('bodyMember', { shop: shopName }) : t('body')}
        actionLabel={shopName ? t('openManage') : t('becomeOwner')}
        onAction={() => navigateOnce(resolveOwnerCtaHref(user))}
      />
      {/*
        Lối thứ HAI, bắt buộc: người mở màn này bằng deep link không có gì trong ngăn xếp để lui
        về, nên chỉ một nút "trở thành chủ xe" là đẩy họ vào phễu đăng ký mà không có đường ra.
      */}
      <YStack px={space.lg} pb={space.lg}>
        <Button
          label={t('backToAccount')}
          variant="ghost"
          onPress={() => router.replace(ROUTES.account.home())}
        />
      </YStack>
    </Screen>
  );
}
