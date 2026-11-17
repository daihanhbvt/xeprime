import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  STOREFRONT_KIND,
  storefrontIdentity,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type TenantStatus,
} from '@xeprime/types';
import {
  shopProfileWithContactSchema,
  type ShopProfileWithContactValues,
} from '@xeprime/validators';
import { Screen } from '@/components/layout/Screen';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { ScreenError } from '@/components/state/ScreenError';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Avatar } from '@/components/ui/Avatar';
import { InfoCard } from '@/components/ui/InfoCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { ProfileSkeleton } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { InlineAction } from '@/components/ui/InlineAction';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import type { MyShop } from '@/features/shop/api';
import { ShopProfileChecklist } from '@/features/shop/components/ShopProfileChecklist';
import { ShopLegalCard, ShopLegalSheet } from '@/features/shop/components/ShopInfoCards';
import { ShopTaxCard } from '@/features/shop/components/ShopTaxCard';
import { ShopStatusBanner } from '@/features/shop/components/ShopStatusBanner';
import { useMyShop, useUpdateShopProfile } from '@/features/shop/hooks/use-shop';
import { toValues as shopFormValues } from '@/features/shop/ShopProfileScreen';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { metaColor } from '@/lib/status-meta';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { ROUTES, SHOP_SECTION, type ShopSection } from '@/navigation/routes';
import { VatInvoiceSection } from '@/features/shop/components/VatInvoiceSection';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import type { UserProfile } from './api';
import { OwnerInfoForm } from './components/OwnerInfoForm';
import { SubscriptionWorkspace } from '@/features/subscription/SubscriptionScreen';
import { useMyProfile } from './hooks/use-account';
import { usePartnerProfileRefresh } from '@/hooks/use-partner-profile-refresh';


/**
 * HỒ SƠ CHỦ XE — trang Thông tin `/manage/shop` của CHỦ xe tuyến hoa hồng, mặt tiền CÁ NHÂN (ADR
 * 0085 điều 2; web `ShopWorkspace` với `ownerProfile`). Route `/manage/shop` dựng màn này thay cho
 * hồ sơ gian hàng khi người xem là chủ xe tuyến hoa hồng có `tenant.view`.
 *
 * Thứ tự: Thông tin chủ xe (ảnh bắt buộc · họ tên · giới thiệu) · Địa chỉ nhận xe · Hoá đơn VAT ·
 * Thông tin khai thuế · Gói & hạn mức (sau cờ quảng bá gói). Đăng nhập · mật khẩu · xoá tài khoản
 * KHÔNG ở đây nữa — chúng ở "Tài khoản & bảo mật" (`/manage/account`) như mọi tài khoản partner.
 *
 * ## MỘT danh tính (ADR 0054)
 *
 * Với chủ xe cá nhân khách thấy đúng TÀI KHOẢN của họ (`storefrontIdentity`, cùng hàm API dùng ở
 * chợ/chuyến/hợp đồng). Trang này vì thế KHÔNG có ô tên/SĐT/email/logo/ảnh bìa của gian hàng.
 *
 * ## Khác web ở VỎ
 *
 * Khai thuế là MÀN riêng đã có sẵn trên app (`/manage/tax`) — ở đây là dòng dẫn đi. Gói không có màn
 * riêng: khối "Gói & hạn mức" nhúng `SubscriptionWorkspace` (chỉ đọc, không thanh toán). `?section=` cuộn tới
 * khối tương ứng như `useScrollToSection` bên web.
 */
export function OwnerProfileScreen({ section }: { section?: ShopSection }) {
  const t = useTranslations('Account.ownerHub');
  const permissions = usePermissions();
  const profile = useMyProfile();
  // Màn này chỉ dựng khi có `tenant.view` (xem route `/manage/shop`).
  const shop = useMyShop(permissions.has(PERMISSION.TENANT_VIEW));
  const pull = usePartnerProfileRefresh();

  if (profile.data && shop.data) {
    return (
      <OwnerProfileSections
        profile={profile.data}
        shop={shop.data}
        canEdit={permissions.has(PERMISSION.TENANT_UPDATE)}
        refreshing={profile.isRefetching || pull.refreshing}
        onRefresh={() => {
          void profile.refetch();
          // Hồ sơ gian hàng + khối "Gói & hạn mức" + danh sách gói theo cờ quảng bá.
          pull.onRefresh();
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
  section?: ShopSection;
  refreshing: boolean;
  onRefresh: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Account.ownerHub');
  const tNav = useTranslations('Navigation');
  const tVat = useTranslations('Shop.vatInvoice');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const updateShop = useUpdateShopProfile();
  const navigateOnce = useNavigateOnce();

  /*
   * Hai section đi theo đúng quyền mà API của chúng gác — thiếu quyền thì vắng khỏi trang:
   *  - khai thuế → `seller_profile.view`; gói → `subscription.view`.
   */
  const canSeeTax = permissions.has(PERMISSION.SELLER_PROFILE_VIEW);
  // Khối tài khoản & hạn mức chỉ có khi nền tảng bật cờ (mặc định tắt — quy định store).
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const canSeePlan = isPlanPromotionEnabled && permissions.has(PERMISSION.SUBSCRIPTION_VIEW);
  const readOnly = !canEdit;

  /* ---------- Địa chỉ nhận xe — form của hồ sơ gian hàng, chỉ phần địa chỉ ---------- */
  const resolver = useValidationResolver<ShopProfileWithContactValues>(
    shopProfileWithContactSchema,
    'Shop.validation',
  );
  const { control, handleSubmit, reset } = useForm<ShopProfileWithContactValues>({
    resolver,
    values: shopFormValues(shop),
    resetOptions: { keepDirtyValues: true },
  });
  const saving = updateShop.isPending;

  const [editingAddress, setEditingAddress] = useState(false);
  const closeAddress = () => {
    reset();
    setEditingAddress(false);
  };
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
        onSuccess: () => {
          toast.showSuccess(t('form.saved'));
          setEditingAddress(false);
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  });

  /* ---------- Cuộn tới `?section=` — MỘT lần mỗi lần màn được focus ---------- */
  const scrollRef = useRef<ScrollView | null>(null);
  const columnY = useRef<number | null>(null);
  const sectionY = useRef<Partial<Record<ShopSection, number>>>({});
  const scrolled = useRef(false);
  /*
   * `?section=tax|plan` mà người xem không có quyền (section không dựng) thì rơi về đầu trang, như
   * mọi giá trị lạ — y như web.
   */
  const target =
    section === SHOP_SECTION.TAX && !canSeeTax
      ? undefined
      : section === SHOP_SECTION.PLAN && !canSeePlan
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
  const onSectionLayout = useCallback(
    (key: ShopSection, event: LayoutChangeEvent) => {
      sectionY.current[key] = event.nativeEvent.layout.y;
      scrollToSection();
    },
    [scrollToSection],
  );

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
          {/*
            Đầu trang mặt tiền CÁ NHÂN (web `ShopWorkspace` personal): ảnh TRÒN của chính chủ xe ·
            họ tên · trạng thái · dòng phụ, rồi "Xem trang chủ xe" khi đang hoạt động.
          */}
          <YStack gap={space.md}>
            <XStack ai="center" gap={12}>
              <Avatar name={identity.name} url={identity.avatarUrl ?? null} size={54} gradient />
              <YStack f={1} minWidth={0}>
                <XStack ai="center" gap={space.sm} flexWrap="wrap">
                  <Text
                    col={colors.text}
                    fos={fontSize.lead}
                    lineHeight={30}
                    fow={fontWeight.semibold}
                    flexShrink={1}
                  >
                    {identity.name}
                  </Text>
                  <StatusBadge
                    label={domainLabel('tenantStatus', shop.status)}
                    color={metaColor(TENANT_STATUS_META, shop.status as TenantStatus)}
                  />
                </XStack>
                <Text col={colors.placeholder} fos={fontSize.body} lineHeight={20}>
                  {t('pageSubtitle')}
                </Text>
              </YStack>
            </XStack>
            {shop.status === TENANT_STATUS.ACTIVE ? (
              <XStack>
                <Button
                  label={t('viewPublicPage')}
                  icon="open-outline"
                  variant="secondary"
                  size="md"
                  shape="square"
                  block={false}
                  onPress={() => void Linking.openURL(`${resolveWebBaseUrl()}/shops/${shop.slug}`)}
                />
              </XStack>
            ) : null}
          </YStack>

          <ShopStatusBanner shop={shop} />
          {readOnly ? <Callout tone="info">{t('readOnly')}</Callout> : null}

          {/* Màn hẹp: "Thông tin chủ xe" (cột phải web) lên ĐẦU — thứ khách thấy; checklist ngay dưới. */}
          <YStack
            gap={space.md}
            onLayout={(event: LayoutChangeEvent) => onSectionLayout(SHOP_SECTION.PROFILE, event)}
          >
            <InfoCard title={t('sections.profile')} hint={t('sections.profileHint')}>
              <OwnerInfoForm profile={profile} shop={shop} canEditBio={canEdit} />
            </InfoCard>
            {readOnly ? null : (
              <ShopProfileChecklist
                control={control}
                ownerAccount={shop.ownerAccount}
                kind={STOREFRONT_KIND.PERSONAL}
                ownerAvatarUrl={profile.avatarUrl ?? null}
                logoRequired
              />
            )}
          </YStack>

          {/* "Địa chỉ nhận xe" — thẻ chỉ đọc + tấm sửa "Cập nhật" (web `ShopLegalCard` kind=PERSONAL). */}
          <YStack
            onLayout={(event: LayoutChangeEvent) => onSectionLayout(SHOP_SECTION.LEGAL, event)}
          >
            <ShopLegalCard
              shop={shop}
              kind={STOREFRONT_KIND.PERSONAL}
              {...(readOnly ? {} : { onEdit: () => setEditingAddress(true) })}
            />
          </YStack>

          {canSeeTax ? (
            <ShopTaxCard
              onLayout={(event: LayoutChangeEvent) => onSectionLayout(SHOP_SECTION.TAX, event)}
            />
          ) : null}

          {/*
            Hoá đơn VAT — MỘT thiết lập cho mọi xe (ADR 0059). Chủ xe cá nhân không có màn
            "Chính sách thuê" của gian hàng, nên nó ở đây; lưu ngay khi bấm, không qua nút lưu địa chỉ.
          */}
          <YStack
            onLayout={(event: LayoutChangeEvent) =>
              onSectionLayout(SHOP_SECTION.VAT_INVOICE, event)
            }
          >
            <InfoCard title={tVat('title')} hint={tVat('subtitle')}>
              <VatInvoiceSection canEdit={canEdit} renderHead={() => null} />
            </InfoCard>
          </YStack>

          {canSeePlan ? (
            <YStack
              gap={space.sm}
              onLayout={(event: LayoutChangeEvent) => onSectionLayout(SHOP_SECTION.PLAN, event)}
            >
              <InfoCard title={t('sections.appPlan')} hint={t('sections.appPlanHint')}>
                <SubscriptionWorkspace />
              </InfoCard>
            </YStack>
          ) : null}

          {/*
            Đăng nhập · mật khẩu · xoá tài khoản rời trang này (ADR 0085 điều 2) — dòng dẫn sang
            "Tài khoản & bảo mật", đúng web `ShopWorkspace` (`onOpenSecurity`).
          */}
          <InlineAction
            label={tNav('manage.security')}
            onPress={() => navigateOnce(ROUTES.manage.account())}
          />
        </YStack>
      </Screen>

      {readOnly ? null : (
        <ShopLegalSheet
          open={editingAddress}
          control={control}
          saving={saving}
          kind={STOREFRONT_KIND.PERSONAL}
          onCancel={closeAddress}
          onSubmit={() => void saveAddress()}
        />
      )}
    </>
  );
}

