import { Ionicons } from '@expo/vector-icons';
import { useEffect, type ReactNode } from 'react';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  SHOP_PROFILE_REQUIREMENT,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_PUBLIC_STATUS_META,
  isEstablishedPackageShop,
  missingShopProfileRequirements,
  type ShopProfileRequirement,
  type VehiclePublicStatus,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { AccountTrackNotice } from './components/AccountTrackNotice';
import { Button } from '@/components/ui/Button';
import { Callout, CalloutBody } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useMyShop } from '@/features/shop/hooks/use-shop';
import { useVehiclesPage } from '@/features/vehicles/hooks/use-vehicles';
import { useRouter } from 'expo-router';
import { goBackOr } from '@/navigation/go-back-or';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useDomainLabel } from '@/i18n/domain';
import { ACCOUNT_SECTION, type AccountSection } from '@/navigation/account-section';
import { ROUTES } from '@/navigation/routes';
import { VEHICLE_REGISTRATION_SOURCE } from '@/navigation/vehicle-registration-source';
import { layout } from '@/theme/layout';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

/** Xe đang trên đường lên chợ — mọi trạng thái TRỪ "đã lên chợ". */
const IN_FLIGHT: readonly VehiclePublicStatus[] = [
  VEHICLE_PUBLIC_STATUS.DRAFT,
  VEHICLE_PUBLIC_STATUS.PENDING_PUBLIC_REVIEW,
  VEHICLE_PUBLIC_STATUS.NEEDS_REVISION,
  VEHICLE_PUBLIC_STATUS.REJECTED,
];

const VEHICLE_PAGE = { page: 1, limit: 20 };

/**
 * Mục hồ sơ còn thiếu → section của "Hồ sơ chủ xe" sửa được nó (web `REQUIREMENT_SECTION`, PR
 * #156). `Record` đầy đủ: thêm một yêu cầu mà quên chỗ sửa sẽ đỏ ngay ở đây.
 */
export const REQUIREMENT_SECTION: Readonly<Record<ShopProfileRequirement, AccountSection>> = {
  [SHOP_PROFILE_REQUIREMENT.OWNER_NAME]: ACCOUNT_SECTION.PROFILE,
  [SHOP_PROFILE_REQUIREMENT.OWNER_PHONE]: ACCOUNT_SECTION.LOGIN,
  [SHOP_PROFILE_REQUIREMENT.DISPLAY_NAME]: ACCOUNT_SECTION.PROFILE,
  [SHOP_PROFILE_REQUIREMENT.PROVINCE]: ACCOUNT_SECTION.ADDRESS,
};

/**
 * Tiến trình đăng ký chủ xe — CHỈ tiến trình (web PR #156 `OwnerRegistrationView`).
 *
 * Phần SỬA hồ sơ đã gộp vào "Hồ sơ chủ xe" ở trang tài khoản (`OwnerProfileScreen`); màn này dẫn
 * tới đó (nút "Hồ sơ chủ xe", và CTA "Hoàn thiện hồ sơ" nhảy thẳng tới mục đầu tiên còn thiếu).
 * Không nhúng biểu mẫu nào: với chủ xe cá nhân, tên/SĐT/logo của gian hàng không phải thứ khách
 * thấy (ADR 0054) — sửa chúng ở đây là sửa vào hư không.
 *
 * ## Ba bước, và bước nào cũng KHÔNG chờ ai gật đầu trừ bước cuối
 *
 * Khai hồ sơ đủ là xong bước 1 — không có vòng duyệt hồ sơ nào. Đăng xe rồi gửi duyệt là bước 2.
 * XePrime duyệt XE là bước duyệt DUY NHẤT (ADR 0036). Vẽ sai chỗ này là dựng lại đúng cái bế tắc
 * "chờ duyệt hồ sơ rồi mới được đăng xe" mà ADR đó gỡ đi.
 */
export function OwnerRegistrationScreen({
  shell = 'account',
}: {
  /**
   * `manage` = trang chủ Owner Lite của app XePrime Partner khi chủ xe chưa có xe nào lên chợ
   * (web `OwnerLiteHome` → `OwnerRegistrationView`): thanh trên là `ManageHeader`, không lui.
   */
  shell?: 'account' | 'manage';
} = {}) {
  const t = useTranslations('Account.registration');
  const domainLabel = useDomainLabel();
  const router = useRouter();
  const navigateOnce = useNavigateOnce();
  const { data: user } = useCurrentUser();
  const permissions = usePermissions();
  /** "Hồ sơ chủ xe" đọc hồ sơ gian hàng — thiếu `tenant.view` thì không mời họ vào. */
  const canViewProfile = permissions.has(PERMISSION.TENANT_VIEW);

  /*
   * GIAN HÀNG TRẢ PHÍ KHÔNG BAO GIỜ THẤY MÀN NÀY (ADR 0040 điều 4): câu chuyện ba bước dành cho
   * người CHƯA bắt đầu. Điều hướng, không render lỗi; `replace` để nút lui không rơi lại đây.
   */
  const wrongWorkspace = isEstablishedPackageShop(user?.tenant);
  useEffect(() => {
    if (wrongWorkspace) router.replace(ROUTES.account.vehicles());
  }, [router, wrongWorkspace]);

  const vehicles = useVehiclesPage(VEHICLE_PAGE);
  const shop = useMyShop(true);

  const items = vehicles.data?.items ?? [];
  const publicCount = items.filter(
    (v) => v.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC,
  ).length;
  const inFlight = items.filter((v) => IN_FLIGHT.includes(v.publicStatus as VehiclePublicStatus));
  const hasVehicle = items.length > 0;

  const addVehicle = () =>
    navigateOnce(ROUTES.listYourVehicle.register(VEHICLE_REGISTRATION_SOURCE.ACCOUNT));

  /*
   * Bước đang đứng suy từ DỮ LIỆU THẬT, chấm bằng `missingShopProfileRequirements` — CÙNG hàm
   * backend dùng, nên màn không bao giờ nói "xong" về một hồ sơ mà server sẽ từ chối.
   */
  const missing = shop.data
    ? missingShopProfileRequirements({
        // Mặt tiền cá nhân: tên khách thấy là họ tên tài khoản chủ (`storefrontIdentity`, ADR 0054).
        displayName: shop.data.ownerAccount.displayName,
        provinceCode: shop.data.defaultBranch?.provinceCode ?? shop.data.profile.provinceCode,
        // Chủ gian hàng đọc từ TÀI KHOẢN (16/09/2026) — cùng nguồn cổng gửi duyệt ở backend dùng.
        ownerFullName: shop.data.ownerAccount.displayName,
        ownerPhone: shop.data.ownerAccount.phone,
      })
    : [];
  const profileDone = shop.data != null && missing.length === 0;
  // CTA đưa thẳng tới mục ĐẦU TIÊN còn thiếu, không bắt người dùng đi tìm trong các section.
  const firstMissing = missing[0];
  const openProfile = () =>
    navigateOnce(
      ROUTES.manage.account(firstMissing ? REQUIREMENT_SECTION[firstMissing] : undefined),
    );

  const current = !profileDone ? 0 : publicCount > 0 ? 2 : 1;

  const headerActions = (
    <XStack gap={space.xs} flexWrap="wrap" jc={shell === 'manage' ? 'flex-start' : 'flex-end'}>
      {canViewProfile ? (
        <Button
          label={t('editProfile')}
          icon="id-card-outline"
          variant="ghost"
          size="sm"
          block={false}
          onPress={() => navigateOnce(ROUTES.manage.account())}
        />
      ) : null}
      {hasVehicle ? (
        <Button
          label={t('steps.vehicle.addMore')}
          variant="ghost"
          size="sm"
          block={false}
          onPress={addVehicle}
        />
      ) : null}
    </XStack>
  );

  const header: ReactNode =
    shell === 'manage' ? (
      <>
        <ManageHeader />
        {/*
          Hai nút KHÔNG đi vào khe `action` (cùng hàng với tiêu đề): ở màn hẹp chúng ép tiêu đề
          thành "Hồ sơ chủ ..." và mô tả thành một cột hẹp. Tiêu đề + mô tả chiếm full width,
          nút xuống hàng riêng và tự xuống dòng.
        */}
        <ManagePageTitle title={t('title')} subtitle={t('subtitle')} />
        {canViewProfile || hasVehicle ? (
          <XStack px={layout.screenX} pb={space.xs}>
            {headerActions}
          </XStack>
        ) : null}
      </>
    ) : (
      <AppHeader
        /*
          Màn chen ngang mở từ menu ⇒ phải lui được. `goBackOr` chứ không `router.back` trần: vào
          thẳng bằng deep link thì ngăn xếp rỗng.
        */
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
        right={headerActions}
      />
    );

  if (wrongWorkspace) return <>{header}</>;

  if (shop.isError && !shop.data) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={shop.error}
            title={t('loadError')}
            onRetry={() => void shop.refetch()}
          />
        </Screen>
      </>
    );
  }

  return (
    <>
      {header}
      <Screen
        edges={['left', 'right', 'bottom']}
        refreshing={shop.isRefetching || vehicles.isRefetching}
        onRefresh={() => {
          void shop.refetch();
          void vehicles.refetch();
        }}
      >
        <YStack gap={space.sm}>
          {/* Trang chủ Owner Lite mở đầu bằng dải tuyến ở CẢ HAI bậc (web `OwnerLiteHome`). */}
          {shell === 'manage' ? <AccountTrackNotice /> : null}

          {shop.isPending ? (
            <MiniRowsSkeleton rows={3} />
          ) : (
            <Card>
              <YStack gap={space.sm}>
                <Step
                  index={0}
                  current={current}
                  icon="storefront-outline"
                  title={t('steps.profile.title')}
                  description={t('steps.profile.description')}
                />
                <Step
                  index={1}
                  current={current}
                  icon="car-outline"
                  title={t('steps.vehicle.title')}
                  description={t('steps.vehicle.description')}
                />
                <Step
                  index={2}
                  current={current}
                  icon="bag-check-outline"
                  title={t('steps.live.title')}
                  description={t('steps.live.description')}
                />
              </YStack>
            </Card>
          )}

          {/*
            Bước 1 chưa xong: dẫn thẳng tới mục đầu tiên còn thiếu ở "Hồ sơ chủ xe". Đặt TRƯỚC dải
            "chưa có xe" vì đó là thứ tự của ba bước.
          */}
          {shop.data && !profileDone && canViewProfile ? (
            <Callout tone="warning" title={t('profileIncomplete.title')}>
              <CalloutBody>{t('profileIncomplete.body')}</CalloutBody>
              <Button
                label={t('profileIncomplete.cta')}
                icon="id-card-outline"
                size="sm"
                onPress={openProfile}
              />
            </Callout>
          ) : null}

          {/*
            Chưa có xe nào: nói thẳng việc còn lại và dẫn tới wizard. KHÔNG phụ thuộc hồ sơ đã
            "duyệt" hay chưa — chủ xe đăng được xe ngay (ADR 0036).
          */}
          {!hasVehicle && !vehicles.isPending ? (
            <Callout tone="info" title={t('noVehicle.title')}>
              <CalloutBody>{t('noVehicle.body')}</CalloutBody>
              <Button label={t('noVehicle.cta')} size="sm" onPress={addVehicle} />
            </Callout>
          ) : null}

          {vehicles.isPending ? <MiniRowsSkeleton rows={2} /> : null}

          {/*
            Xe đang trên đường lên chợ — danh sách NGẮN, chỉ trạng thái và lối vào sửa, kèm lý do
            người duyệt trả xe về ngay tại dòng đó.
          */}
          {inFlight.length > 0 ? (
            <Card>
              <YStack gap={space.sm} accessibilityLabel={t('queue.title')}>
                <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.bold}>
                  {t('queue.title')}
                </Text>
                {inFlight.map((vehicle) => (
                  <Pressable
                    key={vehicle.id}
                    accessibilityRole="button"
                    accessibilityLabel={vehicle.name}
                    onPress={() => navigateOnce(ROUTES.account.vehicleDetail(vehicle.id))}
                  >
                    <YStack gap={space.xs}>
                      <XStack ai="center" jc="space-between" gap={space.sm}>
                        <Text
                          f={1}
                          col={colors.text}
                          fos={fontSize.bodySm}
                          fow={fontWeight.semibold}
                          numberOfLines={1}
                        >
                          {vehicle.name}
                        </Text>
                        <StatusBadge
                          label={domainLabel(
                            'vehiclePublicStatus',
                            vehicle.publicStatus,
                            VEHICLE_PUBLIC_STATUS_META[vehicle.publicStatus as VehiclePublicStatus]
                              ?.label,
                          )}
                          color={
                            VEHICLE_PUBLIC_STATUS_META[vehicle.publicStatus as VehiclePublicStatus]
                              ?.color ?? 'default'
                          }
                          size="sm"
                        />
                      </XStack>
                      {vehicle.latestPublicReview?.reason ? (
                        <Text col={colors.textMuted} fos={fontSize.label}>
                          {vehicle.latestPublicReview.reason}
                        </Text>
                      ) : null}
                    </YStack>
                  </Pressable>
                ))}
              </YStack>
            </Card>
          ) : null}
        </YStack>
      </Screen>
    </>
  );
}

function Step({
  index,
  current,
  icon,
  title,
  description,
}: {
  index: number;
  current: number;
  icon: 'storefront-outline' | 'car-outline' | 'bag-check-outline';
  title: string;
  description: string;
}) {
  const done = index < current;
  const active = index === current;
  const tone = done ? colors.success : active ? colors.primary : colors.placeholder;

  return (
    <XStack ai="flex-start" gap={space.sm}>
      <Ionicons name={done ? 'checkmark-circle' : icon} size={iconSize.lg} color={tone} />
      <YStack f={1} minWidth={0} gap={2}>
        <Text
          col={active ? colors.text : colors.textMuted}
          fos={fontSize.bodySm}
          fow={fontWeight.semibold}
        >
          {title}
        </Text>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {description}
        </Text>
      </YStack>
    </XStack>
  );
}
