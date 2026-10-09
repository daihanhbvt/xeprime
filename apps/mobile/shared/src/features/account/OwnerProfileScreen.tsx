import { useFocusEffect } from 'expo-router';
import { useCallback, useRef } from 'react';
import type { LayoutChangeEvent, ScrollView } from 'react-native';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  STOREFRONT_KIND,
  TENANT_STATUS,
  storefrontIdentity,
  type TenantStatus,
} from '@xeprime/types';
import {
  shopProfileWithContactSchema,
  type ShopProfileWithContactValues,
} from '@xeprime/validators';
import { Screen } from '@/components/layout/Screen';
import { AddressFields } from '@/components/form/AddressFields';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { ScreenError } from '@/components/state/ScreenError';
import { AppVersion } from '@/components/ui/AppVersion';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { ManageHeader } from '@/features/shell/ManageHeader';
import type { MyShop } from '@/features/shop/api';
import { ShopProfileChecklist } from '@/features/shop/components/ShopProfileChecklist';
import { ShopStatusBanner } from '@/features/shop/components/ShopStatusBanner';
import { useMyShop, useUpdateShopProfile } from '@/features/shop/hooks/use-shop';
import { toValues as shopFormValues } from '@/features/shop/ShopProfileScreen';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { ACCOUNT_SECTION, type AccountSection } from '@/navigation/account-section';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, space } from '@/theme/tokens';
import type { UserProfile } from './api';
import { AccountIdentityHero } from './components/AccountIdentityHero';
import { AccountSecuritySections, SectionHead } from './components/AccountSecuritySections';
import { OwnerInfoForm } from './components/OwnerInfoForm';
import { PersonalProfileCard } from './components/PersonalProfileCard';
import { SellerTaxForm } from '@/features/seller-profile/components/SellerTaxForm';
import { useSellerProfile } from '@/features/seller-profile/hooks/use-seller-profile';
import { SubscriptionWorkspace } from '@/features/subscription/SubscriptionScreen';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { useMyProfile } from './hooks/use-account';

const ADDRESS_FIELD_NAMES = {
  provinceCode: 'provinceCode',
  wardCode: 'wardCode',
  addressLine: 'addressLine',
} as const;
const ADDRESS_PIN_NAMES = {
  placeId: 'placeId',
  latitude: 'latitude',
  longitude: 'longitude',
  locationSource: 'locationSource',
} as const;

/**
 * HỒ SƠ CHỦ XE — trang tài khoản của CHỦ xe tuyến hoa hồng trong app Partner (bản native của web
 * `OwnerProfilePage`, PR #156 · #159). `/manage/account` dựng màn này thay cho "Tài khoản & bảo mật"
 * khi người xem là chủ xe tuyến hoa hồng có `tenant.view` (`ManageAccountScreen`).
 *
 * Một trang, theo thứ tự người ta cần: Thông tin chủ xe (ảnh bắt buộc · họ tên · giới thiệu) ·
 * Địa chỉ nhận xe · Thông tin khai thuế · Gói dịch vụ · Đăng nhập · Mật khẩu · Xoá tài khoản.
 *
 * ## MỘT danh tính (ADR 0054)
 *
 * Với chủ xe cá nhân khách thấy đúng TÀI KHOẢN của họ (`storefrontIdentity`, cùng hàm API dùng ở
 * chợ/chuyến/hợp đồng). Trang này vì thế KHÔNG có ô tên/SĐT/email/logo/ảnh bìa của gian hàng.
 *
 * ## Khác web ở VỎ
 *
 * Khai thuế và gói là MÀN riêng đã có sẵn trên app (`/manage/tax`, `/manage/subscription`) — ở đây
 * chúng là dòng dẫn đi, không phải bản sao thứ hai của biểu mẫu/luồng mua gói. `?section=` cuộn tới
 * khối tương ứng như `useScrollToSection` bên web.
 */
export function OwnerProfileScreen({ section }: { section?: AccountSection }) {
  const t = useTranslations('Account.ownerHub');
  const permissions = usePermissions();
  const profile = useMyProfile();
  // Màn này chỉ dựng khi có `tenant.view` (xem `ManageAccountScreen`).
  const shop = useMyShop(permissions.has(PERMISSION.TENANT_VIEW));

  if (profile.data && shop.data) {
    return (
      <OwnerProfileSections
        profile={profile.data}
        shop={shop.data}
        canEdit={permissions.has(PERMISSION.TENANT_UPDATE)}
        refreshing={profile.isRefetching || shop.isRefetching}
        onRefresh={() => {
          void profile.refetch();
          void shop.refetch();
        }}
        {...(section ? { section } : {})}
      />
    );
  }

  const failed = profile.isError || shop.isError;
  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']} scroll={!failed}>
        {failed ? (
          <ScreenError
            error={profile.error ?? shop.error}
            title={t('loadError')}
            onRetry={() => {
              if (profile.isError) void profile.refetch();
              if (shop.isError) void shop.refetch();
            }}
          />
        ) : (
          <ProfileSkeleton />
        )}
      </Screen>
    </>
  );
}

function OwnerProfileSections({
  profile,
  shop,
  canEdit,
  section,
  refreshing,
  onRefresh,
}: {
  profile: UserProfile;
  shop: MyShop;
  canEdit: boolean;
  section?: AccountSection;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const t = useTranslations('Account.ownerHub');
  const tHub = useTranslations('Account.hub');
  const tTax = useTranslations('Account.tax');
  const tShop = useTranslations('Shop');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const permissions = usePermissions();
  const { data: user } = useCurrentUser();
  const updateShop = useUpdateShopProfile();

  /*
   * Hai section đi theo đúng quyền mà API của chúng gác — thiếu quyền thì vắng khỏi trang:
   *  - khai thuế → `seller_profile.view`; gói → `subscription.view`.
   */
  const canSeeTax = permissions.has(PERMISSION.SELLER_PROFILE_VIEW);
  const canSeePlan = permissions.has(PERMISSION.SUBSCRIPTION_VIEW);
  const readOnly = !canEdit;

  /* ---------- Địa chỉ nhận xe — form của hồ sơ gian hàng, chỉ phần địa chỉ ---------- */
  const resolver = useValidationResolver<ShopProfileWithContactValues>(
    shopProfileWithContactSchema,
    'Shop.validation',
  );
  const { control, handleSubmit, reset, formState } = useForm<ShopProfileWithContactValues>({
    resolver,
    values: shopFormValues(shop),
    resetOptions: { keepDirtyValues: true },
  });
  const saving = updateShop.isPending;
  const dirty = formState.isDirty && !readOnly;

  const saveAddress = handleSubmit((values) => {
    if (saving) return;
    /*
     * CHỈ địa chỉ: tên/SĐT/email/logo của gian hàng không phải thứ khách thấy ở tuyến này (ADR
     * 0054), còn `bio` lưu ở "Thông tin chủ xe" — gửi kèm là ghi đè bằng bản cũ. Endpoint cập nhật
     * từng phần nên trường vắng mặt không bị chạm.
     */
    updateShop.mutate(
      {
        provinceCode: values.provinceCode,
        // Chuỗi rỗng không gửi — DTO `@Length(5, 5)` (xem `toBody` của `ShopProfileScreen`).
        wardCode: values.wardCode || undefined,
        addressLine: values.addressLine,
      },
      {
        onSuccess: () => toast.showSuccess(t('form.saved')),
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  });

  /* ---------- Cuộn tới `?section=` — MỘT lần mỗi lần màn được focus ---------- */
  const scrollRef = useRef<ScrollView | null>(null);
  const columnY = useRef<number | null>(null);
  const sectionY = useRef<Partial<Record<AccountSection, number>>>({});
  const scrolled = useRef(false);
  /*
   * `?section=tax|plan` mà người xem không có quyền (section không dựng) thì rơi về đầu trang, như
   * mọi giá trị lạ — y như web.
   */
  const target =
    section === ACCOUNT_SECTION.TAX && !canSeeTax
      ? undefined
      : section === ACCOUNT_SECTION.PLAN && !canSeePlan
        ? undefined
        : section;
  const scrollToSection = useCallback(() => {
    if (!target || scrolled.current) return;
    const y = sectionY.current[target];
    if (columnY.current === null || y === undefined) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, columnY.current + y - space.md), animated: true });
  }, [target]);
  useFocusEffect(
    useCallback(() => {
      scrolled.current = false;
      scrollToSection();
    }, [scrollToSection]),
  );
  const onColumnLayout = useCallback(
    (event: LayoutChangeEvent) => {
      columnY.current = event.nativeEvent.layout.y;
      scrollToSection();
    },
    [scrollToSection],
  );
  const layoutOf = (key: AccountSection) => (event: LayoutChangeEvent) => {
    sectionY.current[key] = event.nativeEvent.layout.y;
    scrollToSection();
  };

  /*
   * Thứ khách thấy — CÙNG hàm với API (`storefrontIdentity`), nên khối nhận diện không thể nói
   * khác trang công khai.
   */
  const identity = storefrontIdentity(
    STOREFRONT_KIND.PERSONAL,
    {
      name: shop.name,
      phone: shop.phone ?? null,
      email: shop.email ?? null,
      logoUrl: shop.profile.logoUrl ?? null,
    },
    {
      displayName: profile.displayName,
      phone: profile.phone ?? null,
      phoneVerified: profile.phoneVerified,
      email: profile.email ?? null,
      emailVerified: profile.emailVerified,
      avatarUrl: profile.avatarUrl ?? null,
    },
  );
  const status = shop.status as TenantStatus;

  return (
    <>
      <ManageHeader />
      <Screen
        edges={['left', 'right', 'bottom']}
        scrollRef={scrollRef}
        refreshing={refreshing}
        onRefresh={onRefresh}
      >
        <YStack gap={space.lg} onLayout={onColumnLayout}>
          <Card padded={false}>
            <AccountIdentityHero
              name={identity.name}
              avatarUrl={identity.avatarUrl}
              subtitle={t('subtitle')}
              tenant={user?.tenant ?? null}
            />
            {/* Chỉ trang đang hoạt động mới có bản công khai — link tới 404 là hành động giả. */}
            {status === TENANT_STATUS.ACTIVE ? (
              <XStack px={space.md} pb={space.md}>
                <Button
                  label={t('viewPublicPage')}
                  icon="open-outline"
                  variant="secondary"
                  size="sm"
                  block={false}
                  onPress={() => navigateOnce(ROUTES.explore.shopDetail(shop.slug))}
                />
              </XStack>
            ) : null}
          </Card>

          <ShopStatusBanner shop={shop} />
          {readOnly ? <Callout tone="info">{t('readOnly')}</Callout> : null}

          {/*
            "Còn thiếu gì" đứng ĐẦU trang: các mục của nó rải khắp các khối (ảnh + họ tên ở khối 1,
            địa chỉ ở khối 2, SĐT ở Đăng nhập). Ảnh là mục BẮT BUỘC — với chủ xe cá nhân nó là ảnh
            khách thấy. Thẻ tự biến mất khi hồ sơ đã đủ.
          */}
          {readOnly ? null : (
            <ShopProfileChecklist
              control={control}
              ownerAccount={shop.ownerAccount}
              kind={STOREFRONT_KIND.PERSONAL}
              ownerAvatarUrl={profile.avatarUrl ?? null}
              logoRequired
            />
          )}

          <YStack gap={space.sm} onLayout={layoutOf(ACCOUNT_SECTION.PROFILE)}>
            <SectionHead title={t('sections.profile')} hint={t('sections.profileHint')} />
            <Card>
              <OwnerInfoForm profile={profile} shop={shop} canEditBio={canEdit} />
            </Card>
          </YStack>

          <YStack gap={space.sm} onLayout={layoutOf(ACCOUNT_SECTION.ADDRESS)}>
            <SectionHead title={t('sections.address')} hint={t('sections.addressHint')} />
            <Card>
              <YStack gap={space.md}>
                <AddressFields
                  control={control}
                  names={ADDRESS_FIELD_NAMES}
                  pin={ADDRESS_PIN_NAMES}
                  required
                  wardRequired={false}
                  addressLineRequired={false}
                  disabled={readOnly || saving}
                />
                {/* Chữ của mặt tiền CÁ NHÂN (web `ShopLegalFields` kind=PERSONAL). */}
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {tShop('personal.provinceHelp')}
                </Text>
                {readOnly ? null : (
                  <XStack gap={space.sm}>
                    {dirty ? (
                      <YStack flexShrink={0}>
                        <Button
                          label={tCommon('cancel')}
                          variant="secondary"
                          disabled={saving}
                          onPress={() => reset()}
                        />
                      </YStack>
                    ) : null}
                    <YStack f={1}>
                      <Button
                        label={t('form.submit')}
                        icon="save-outline"
                        loading={saving}
                        disabled={!dirty}
                        onPress={() => void saveAddress()}
                      />
                    </YStack>
                  </XStack>
                )}
              </YStack>
            </Card>
          </YStack>

          {canSeeTax ? (
            <YStack gap={space.sm} onLayout={layoutOf(ACCOUNT_SECTION.TAX)}>
              <SectionHead title={tTax('title')} hint={tTax('subtitle')} />
              {/* Nhúng thẳng biểu mẫu — đúng `SellerTaxSection` của web `OwnerProfilePage`. */}
              <OwnerTaxSection />
            </YStack>
          ) : null}

          {canSeePlan ? (
            <YStack gap={space.sm} onLayout={layoutOf(ACCOUNT_SECTION.PLAN)}>
              <SectionHead title={t('sections.plan')} hint={t('sections.planHint')} />
              {/* Nhúng `SubscriptionWorkspace` như web — tiêu đề là của section, không header thứ hai. */}
              <SubscriptionWorkspace />
            </YStack>
          ) : null}

          <YStack gap={space.sm} onLayout={layoutOf(ACCOUNT_SECTION.LOGIN)}>
            <SectionHead title={tHub('sections.login')} hint={tHub('sections.loginHint')} />
            <PersonalProfileCard
              profile={profile}
              subtitle={identity.name}
              tenant={user?.tenant ?? null}
              editable
              loginOnly
            />
          </YStack>

          <AccountSecuritySections
            onPasswordLayout={layoutOf(ACCOUNT_SECTION.PASSWORD)}
            onDeleteLayout={layoutOf(ACCOUNT_SECTION.DELETE)}
          />

          <AppVersion />
        </YStack>
      </Screen>
    </>
  );
}

/**
 * Section "Thông tin khai thuế" nhúng trong Hồ sơ chủ xe — bản native của `SellerTaxSection`
 * (web): chỉ biểu mẫu, đủ trạng thái tải/lỗi. Thuế ĐÃ khấu trừ ở màn Số dư & rút tiền.
 */
function OwnerTaxSection() {
  const tTax = useTranslations('Account.tax');
  const profileQuery = useSellerProfile();
  if (profileQuery.isLoading) return <MiniRowsSkeleton />;
  if (profileQuery.isError || !profileQuery.data) {
    return (
      <ScreenError
        error={profileQuery.error}
        title={tTax('loadError')}
        onRetry={() => void profileQuery.refetch()}
      />
    );
  }
  return <SellerTaxForm profile={profileQuery.data} />;
}
