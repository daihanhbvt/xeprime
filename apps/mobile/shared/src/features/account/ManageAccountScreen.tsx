import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { Screen } from '@/components/layout/Screen';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { ScreenError } from '@/components/state/ScreenError';
import { AppVersion } from '@/components/ui/AppVersion';
import { Card } from '@/components/ui/Card';
import { SettingRow } from '@/components/ui/SettingRow';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { ROUTES } from '@/navigation/routes';
import { space } from '@/theme/tokens';
import { PersonalProfileCard } from './components/PersonalProfileCard';
import { useMyProfile } from './hooks/use-account';
import { useAccountIdentityLabel } from './use-account-identity-label';

/**
 * TÀI KHOẢN & BẢO MẬT của NGƯỜI ĐANG ĐĂNG NHẬP — trong khu quản lý (ADR 0038 điều 7).
 *
 * ## Vì sao màn này phải tồn tại
 *
 * Khu khách của một tài khoản gian hàng tuyến gói chỉ còn hai mục ("Quản lý gian hàng", "Hồ sơ
 * gian hàng"), nên sau đợt tách tuyến KHÔNG mục nào dẫn tới màn đổi mật khẩu nữa. Một `shop_staff`
 * sống trong khu quản lý vì thế không có đường nào để đổi mật khẩu của chính mình.
 *
 * ## Hai HỒ SƠ khác nhau, và đây là chỗ tách chúng
 *
 *   `/manage/shop`    — hồ sơ GIAN HÀNG: pháp nhân, địa chỉ, mã số thuế, tài khoản thu. Đổi nó là
 *                       đổi thứ khách nhìn thấy và thứ in trên hợp đồng.
 *   `/manage/account` — hồ sơ CON NGƯỜI: tên, email/SĐT, mật khẩu, thao tác bảo mật.
 *
 * Nhầm hai hồ sơ đó là chuyện xảy ra thật, nên màn mở đầu bằng `PersonalProfileCard` — ĐÚNG thẻ
 * mà tab Tài khoản bên khu khách dựng, cùng một component — trả lời "tôi đang đăng nhập bằng tài
 * khoản nào, vai gì, tuyến nào". Không có câu mô tả nào dưới tiêu đề trang: web không có, và
 * chính khối nhận diện ngay bên dưới đã nói rõ đây là hồ sơ của ai.
 *
 * ## Khác web ở VỎ, không khác ở nghiệp vụ
 *
 * Web xếp bốn khối trên một trang cuộn; app native cũng vậy — khác ở chỗ đổi mật khẩu và xoá tài
 * khoản là hai MÀN riêng đã có sẵn, nên ở đây chúng là hai dòng dẫn đi chứ không phải bản sao thứ
 * hai của cùng một biểu mẫu.
 *
 * Xoá tài khoản đứng RIÊNG một thẻ và mang tông nguy hiểm: xếp nó ngay dưới "đổi mật khẩu", cùng
 * cỡ chữ cùng màu, là mời người dùng chạm nhầm vào thứ không rút lại được.
 */

export function ManageAccountScreen() {
  const t = useTranslations('Navigation');
  const tAccount = useTranslations('Account');
  const { data: user } = useCurrentUser();
  const identityLabel = useAccountIdentityLabel();
  /*
   * Hồ sơ đọc từ `GET /users/me`, KHÔNG từ `/auth/me`: chỉ cái đầu có `phone` + `phoneVerified`,
   * hai trường thẻ hồ sơ phải hiện và phải cho đổi.
   */
  const profile = useMyProfile();
  const tenant = user?.tenant ?? null;

  /* Nhãn danh tính — xem `useAccountIdentityLabel`: tuyến, không phải vai RBAC. */
  const userRole = identityLabel(user);

  if (profile.isLoading) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']}>
          <ProfileSkeleton />
        </Screen>
      </>
    );
  }

  if (profile.isError || !profile.data) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError error={profile.error} onRetry={() => void profile.refetch()} />
        </Screen>
      </>
    );
  }

  return (
    <>
      {/*
        Thanh trên của KHU QUẢN LÝ, không phải `AppHeader` trần: màn này là một mục của drawer, và
        `AppHeader` trần mọc ra ở đây thì mất nút mở menu, mất tên gian hàng, mất phạm vi chi
        nhánh — người dùng vào được rồi không có đường mở lại menu. Tiêu đề TRANG đi vào nội dung
        qua `ManagePageTitle`, đúng khuôn mọi màn gốc khác của khu quản lý.
      */}
      <ManageHeader />
      <ManagePageTitle title={t('manage.security')} />

      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={profile.isRefetching}
        onRefresh={() => void profile.refetch()}
      >
        <YStack gap={space.lg}>
          {/*
            Thẻ hồ sơ CON NGƯỜI, bản CHO SỬA — đây là nơi duy nhất sửa tên/ảnh/email/SĐT trong
            app (người dùng chốt 16/09/2026). Tab Tài khoản bên khu khách dựng CÙNG component ở
            bản chỉ xem, nên hai màn không thể lệch nhau về cách hiển thị.
          */}
          <PersonalProfileCard profile={profile.data} subtitle={userRole} tenant={tenant} editable />

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

          {/*
            Xoá tài khoản đứng RIÊNG một thẻ, tông nguy hiểm. Xếp nó ngay dưới "đổi mật khẩu",
            cùng cỡ chữ cùng màu, là mời người dùng chạm nhầm vào thứ không rút lại được.
          */}
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

          <AppVersion />
        </YStack>
      </Screen>
    </>
  );
}
