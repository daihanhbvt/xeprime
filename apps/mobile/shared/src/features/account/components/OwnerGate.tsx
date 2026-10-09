import type { ReactNode } from 'react';
import { useRouter } from 'expo-router';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { OWNER_STAGE } from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenLoading } from '@/components/state/ScreenLoading';
import { AppHeader } from '@/components/layout/AppHeader';
import { goBackOr } from '@/navigation/go-back-or';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Button } from '@/components/ui/Button';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { space } from '@/theme/tokens';
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
  header,
}: {
  children: ReactNode;
  /**
   * Thanh trên cho màn CHỜ và màn CHẶN — truyền `<ManageHeader />` khi cổng đứng trong bộ tab của
   * khu quản lý: màn chặn không có thanh menu là một ngõ cụt (không lui được, không mở menu được).
   */
  header?: ReactNode;
  minStage?: typeof OWNER_STAGE.REGISTERING | typeof OWNER_STAGE.OWNER;
}) {
  const t = useTranslations('Account.ownerGate');
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const { user, stage, isLoading, loadFailed, error, retry } = useOwnerAccess();
  /*
   * Không truyền `header` (màn chen ngang trong stack) ⇒ thanh có nút lui, để màn chờ/màn chặn không
   * thành ngõ cụt không có đường ra.
   */
  const top = header ?? (
    <AppHeader title="" onBack={() => goBackOr(router, ROUTES.manage.home())} />
  );

  if (isLoading) {
    return (
      <>
        {top}
        <Screen scroll={false}>
          <ScreenLoading />
        </Screen>
      </>
    );
  }

  // Lỗi mạng khi chưa có hồ sơ — KHÔNG kết luận "chưa là chủ xe".
  if (loadFailed) {
    return (
      <>
        {top}
        <Screen scroll={false}>
          <ScreenError error={error} onRetry={retry} />
        </Screen>
      </>
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
  /*
   * THÀNH VIÊN (không phải chủ) của một gian hàng tuyến hoa hồng — web `OwnerGate` (ADR 0053):
   * các màn chủ xe chỉ mở cho chủ gian hàng, nên không có nút chính nào để bấm; câu giải thích nói
   * họ phải hỏi chủ gian hàng.
   */
  const member = !registering && Boolean(shopName);

  return (
    <>
      {top}
      <Screen scroll={false}>
        <ScreenMessage
          icon="storefront-outline"
          title={registering ? t('registeringTitle') : t('title')}
          description={
            registering
              ? t('registeringBody')
              : member
                ? t('bodyMemberPartner', { shop: shopName ?? '' })
                : t('body')
          }
          {...(member
            ? {}
            : {
                actionLabel: registering ? t('openRegistration') : t('becomeOwner'),
                onAction: () =>
                  navigateOnce(
                    // Web PR #156: "openRegistration" về trang chủ Owner Lite — nơi tiến trình đăng ký sống.
                    registering ? ROUTES.manage.home() : ROUTES.manage.register(),
                  ),
              })}
        />
        {/*
        Lối thứ HAI, bắt buộc: người mở màn này bằng deep link không có gì trong ngăn xếp để lui
        về. Web dẫn về trang tài khoản đối tác (`ROUTES.MANAGE.ACCOUNT`).
      */}
        <YStack px={space.lg} pb={space.lg}>
          <Button
            label={t('backToAccount')}
            variant="ghost"
            onPress={() => router.replace(ROUTES.manage.account())}
          />
        </YStack>
      </Screen>
    </>
  );
}
