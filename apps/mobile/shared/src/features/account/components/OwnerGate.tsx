import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { OWNER_STAGE } from '@xeprime/types';
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
 * Hai mức, đúng hai bậc của `resolveOwnerStage` và đúng cặp bên web:
 *
 * - `minStage="registering"` — chỉ cần đã mở hồ sơ chủ xe. Dùng cho màn tiến trình đăng ký, danh
 *   sách xe, không gian quản lý một chiếc xe, trang gói và SỔ TIỀN: cả năm đều có việc thật để
 *   làm khi xe còn đang chờ duyệt.
 * - `minStage="owner"` (mặc định) — phải có ít nhất một xe đang bán trên chợ. Lịch và khai thuế
 *   đều rỗng trước mốc đó, và một màn rỗng không giải thích được vì sao nó rỗng là cách nhanh
 *   nhất để người dùng tin mình đã làm sai bước nào.
 *
 * Không đạt thì `children` KHÔNG được render — tức không hook nào bên trong chạy, không request
 * tenant nào bay đi để rồi nhận 403. Người tới đây bằng deep link thấy một trạng thái tử tế với
 * đúng hai lối đi.
 *
 * Đây là lớp trải nghiệm; lớp chặn thật vẫn là guard backend (CLAUDE.md §3). Bản native của
 * `apps/web/src/features/account/components/OwnerGate.tsx`.
 */
export function OwnerGate({
  children,
  minStage = OWNER_STAGE.OWNER,
}: {
  children: ReactNode;
  minStage?: typeof OWNER_STAGE.REGISTERING | typeof OWNER_STAGE.OWNER;
}) {
  const t = useTranslations('Account.ownerGate');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const { user, stage, isLoading } = useOwnerAccess();

  if (isLoading) {
    return (
      <Screen scroll={false}>
        <ScreenLoading />
      </Screen>
    );
  }

  const passed =
    minStage === OWNER_STAGE.REGISTERING ? stage !== OWNER_STAGE.NONE : stage === OWNER_STAGE.OWNER;
  if (passed) return <>{children}</>;

  /*
   * Người ĐANG đăng ký đứng trước một màn của bậc `owner` là một tình huống khác hẳn với người
   * chưa từng mở hồ sơ: họ đã làm đúng mọi thứ và chỉ đang chờ. Nói đúng điều đó và dẫn về màn
   * tiến trình, thay vì mời họ "trở thành chủ xe" lần thứ hai.
   */
  const registering = stage === OWNER_STAGE.REGISTERING;
  const shopName = user?.tenant?.name;

  return (
    <Screen scroll={false}>
      <ScreenMessage
        icon="storefront-outline"
        title={registering ? t('registeringTitle') : t('title')}
        description={
          registering
            ? t('registeringBody')
            : shopName
              ? t('bodyMember', { shop: shopName })
              : t('body')
        }
        actionLabel={
          registering ? t('openRegistration') : shopName ? t('openManage') : t('becomeOwner')
        }
        onAction={() =>
          navigateOnce(registering ? ROUTES.account.registration() : resolveOwnerCtaHref(user))
        }
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
