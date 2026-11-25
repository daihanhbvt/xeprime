import SafetyCertificateOutlined from '@ant-design/icons-svg/es/asn/SafetyCertificateOutlined';
import { useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, type LayoutChangeEvent, type ScrollView } from 'react-native';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import {
  isEstablishedPackageShop,
  isPackageShopTrack,
  PERMISSION,
  PLAN_FEATURE,
  TENANT_STATUS,
  TENANT_STATUS_META,
  type TenantStatus,
  toLocalVnPhone,
} from '@xeprime/types';
import { guessAddressLine } from '@xeprime/domain';
import {
  shopProfileWithContactSchema,
  type ShopProfileWithContactValues,
} from '@xeprime/validators';
import { AntIcon } from '@/components/icons/AntIcon';
import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ShopProfileSkeleton } from '@/components/ui/Skeleton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePartnerAppConfig } from '@/features/app-config/use-partner-app-config';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { usePartnerProfileRefresh } from '@/hooks/use-partner-profile-refresh';
import { metaColor } from '@/lib/status-meta';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { ROUTES, SHOP_SECTION, type ShopSection } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, market, radius, space } from '@/theme/tokens';
import type { MyShop, UpdateShopProfileInput } from './api';
import { ShopBranchesCard } from './components/ShopBranchesCard';
import {
  ShopDisplayCard,
  ShopDisplaySheet,
  ShopLegalCard,
  ShopLegalSheet,
} from './components/ShopInfoCards';
import { ShopOwnerCard } from './components/ShopOwnerCard';
import { ShopPlanCard } from './components/ShopPlanCard';
import { ShopProfileChecklist } from './components/ShopProfileChecklist';
import { ShopStatusBanner } from './components/ShopStatusBanner';
import { ShopTaxCard } from './components/ShopTaxCard';
import { ShopWelcomeBanner } from './components/ShopWelcomeBanner';
import { useVehiclesPage } from '@/features/vehicles/hooks/use-vehicles';
import { useMyShop, useUpdateShopProfile } from './hooks/use-shop';

/** Logo đầu trang 54px (`Avatar size={54}` của `ShopWorkspace` web). */
const HEAD_LOGO = 54;
/** Viên vai cao 40 (`.roleChip` web). */
const ROLE_CHIP_HEIGHT = 40;

/** Dải chào chỉ hỏi "đã có xe nào chưa" — MỘT bản ghi là đủ để trả lời, đúng cỡ web hỏi. */
const WELCOME_VEHICLE_PAGE = { page: 1, limit: 1 };

/**
 * Giá trị khởi tạo của form.
 *
 * Tỉnh/thành lấy từ CHI NHÁNH MẶC ĐỊNH trước; hai cột trên hồ sơ chỉ là bản sao dự phòng cho dữ
 * liệu cũ (`syncProfileFromDefaultBranch` ở backend). Đọc ngược lại sẽ hiện tỉnh cũ ngay sau khi
 * chủ shop vừa đổi chi nhánh — hai nguồn tỉnh lệch nhau là đúng thứ SHP-02 phải tránh.
 *
 * SĐT đổi về dạng `09…` để nhập/đọc; backend lưu `0…` (ADR 0082) và tự chuẩn hoá lại khi nhận.
 */
export function toValues(shop: MyShop): ShopProfileWithContactValues {
  const p = shop.profile;
  return {
    /*
     * Tên hiển thị CHÍNH LÀ `tenants.name` từ PR #151 (một nguồn — `profile.displayName` chỉ giữ cho
     * tương thích). Liên hệ đọc từ GIAN HÀNG (`shop.phone/email`), không từ tài khoản chủ.
     */
    displayName: shop.name,
    phone: shop.phone ? toLocalVnPhone(shop.phone) : '',
    email: shop.email ?? '',
    bio: p.bio ?? '',
    // Bản định dạng của web editor - chỉ để form đủ trường; `toPatch` không gửi nó lên.
    bioHtml: p.bioHtml ?? '',
    provinceCode: shop.defaultBranch?.provinceCode ?? p.provinceCode ?? '',
    wardCode: shop.defaultBranch?.wardCode ?? p.wardCode ?? '',
    /*
     * Hồ sơ CŨ chưa tách phần "số nhà, đường": đoán từ chuỗi hiển thị bằng cách cắt các cụm trông
     * như đơn vị hành chính. GỢI Ý cho ô nhập — chủ shop nhìn và sửa trước khi lưu.
     */
    addressLine: guessAddressLine(shop.defaultBranch?.address ?? p.address),
    placeId: null,
    latitude: null,
    longitude: null,
    locationSource: null,
    businessLicenseNo: p.businessLicenseNo ?? '',
    logoUrl: p.logoUrl ?? null,
    coverUrl: p.coverUrl ?? null,
  };
}

/**
 * Hồ sơ gian hàng (SHP-02) — bản native của `/manage/shop`.
 *
 * Route chỉ lo bốn việc: quyền, dữ liệu, mutation và các trạng thái chưa-có-dữ-liệu. Toàn bộ
 * phần phụ thuộc "form có thay đổi chưa / còn thiếu gì" nằm trong `ProfileForm` — hai câu hỏi mà
 * chỉ form trả lời được.
 *
 * Hai trục quyền TÁCH BẠCH, không gộp: `tenant.view` để xem, `tenant.update` để lưu.
 *
 * Không còn nút "Gửi xác minh" (24/09/2026): nền tảng tạm ngừng xác minh gian hàng, và màn duyệt
 * của nền tảng chỉ nhận phiếu XE — một phiếu xác minh gửi lúc này không có ai xử lý. Một phiếu chờ
 * CŨ cũng không còn khoá hồ sơ (backend đã gỡ khoá ở `TenantsService.updateProfile`). Web gỡ
 * cùng lúc ở cả `/manage/shop` lẫn `/account/registration`.
 */
/**
 * `header` — VỎ điều hướng của khu đang đứng.
 *
 * Cùng màn này phục vụ hai khu: khu quản lý (`/manage/shop`) và khu khách
 * (`/account/registration`, nơi chủ xe tuyến hoa hồng sửa hồ sơ gian hàng của mình — họ KHÔNG
 * vào khu quản lý được, ADR 0038 điều 4). Chỉ cái đầu trang khác nhau; luật lưu và quyền thì
 * giống hệt, nên clone màn là hai chỗ phải sửa mỗi lần đổi luật.
 *
 * Mặc định là đầu trang khu quản lý — nơi màn này ra đời.
 */
export function ShopProfileScreen({
  header,
  intro,
  welcome = false,
  variant = 'settings',
  section,
}: {
  header?: ReactNode;
  /**
   * Khối cần CUỘN TỚI khi mở — bản native của `?section=` trên trang Cửa hàng web. Liên kết "Tài
   * khoản nhận tiền"/"Thông tin khai thuế" của tuyến hoa hồng đổi sang đây khi gian hàng tuyến gói
   * mở chúng (`partnerPathRedirect`).
   */
  section?: ShopSection;
  intro?: ReactNode;
  /**
   * Vừa thanh toán lượt gói đầu tiên xong — bật DẢI CHÀO một lần (ADR 0040).
   *
   * Không mở hay khoá gì: cổng logo thật nằm ở `submitForPublicReview`. Route đọc nó từ tham số
   * điều hướng, và kịch bản xấu nhất là ai đó thấy một dòng chào không dành cho mình.
   */
  welcome?: boolean;
  /**
   * BỀ MẶT đang dựng màn này — web tách nó thành HAI component, app dùng lại một.
   *
   * - `settings` (mặc định) = `ShopWorkspace` của web, trang Cửa hàng ở cổng quản lý: đủ năm
   *   khối, gồm Chủ gian hàng · Tài khoản nhận tiền · Gói & hạn mức.
   * - `profileForm` = `ShopProfileWorkspace` của web, phần nhúng trong "Hồ sơ chủ xe" ở khu
   *   tài khoản: CHỈ hai nhóm ô của hồ sơ (hiển thị + địa chỉ/pháp lý) kèm dải trạng thái và
   *   checklist.
   *
   * Ba khối kia không thuộc về màn đăng ký, và không chỉ vì bố cục: người đứng ở đó là chủ xe
   * TUYẾN HOA HỒNG, còn "Quản lý thông tin đăng nhập" và "Tài khoản nhận tiền" đều dẫn vào cổng
   * quản lý — nơi họ không vào được (ADR 0027/0028). Một nút chắc chắn dẫn tới màn từ chối còn
   * tệ hơn là không có nút.
   */
  variant?: 'settings' | 'profileForm';
} = {}) {
  const t = useTranslations('Shop');
  const tRegistration = useTranslations('Account.registration');
  const navigateOnce = useNavigateOnce();
  const shell = header ?? <ManagePageHeader title={t('page.title')} />;
  const permissions = usePermissions();
  const { tenant } = useTenantScope();

  const canView = permissions.has(PERMISSION.TENANT_VIEW);
  const canEdit = permissions.has(PERMISSION.TENANT_UPDATE);

  const query = useMyShop(canView && Boolean(tenant));

  if (!permissions.isLoading && !canView) {
    return (
      <>
        {shell}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('page.forbidden.title')}
            description={t('page.forbidden.description')}
            actionLabel={t('page.forbidden.backHome')}
            onAction={() => navigateOnce(ROUTES.manage.home())}
          />
        </Screen>
      </>
    );
  }

  /*
   * Đã đăng nhập, có quyền, nhưng KHÔNG thuộc gian hàng nào: đây là trạng thái HỢP LỆ, không
   * phải lỗi. Lối đi tiếp là đăng ký gian hàng — cùng câu chữ với `NoTenantState` bên web.
   */
  if (!permissions.isLoading && canView && !tenant) {
    return <NoTenantState shell={shell} />;
  }

  if (query.isError && !query.data) {
    return (
      <>
        {shell}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={query.error}
            /*
              Câu của KHU đang đứng: màn "Hồ sơ chủ xe" bên web nói "Không tải được hồ sơ chủ xe"
              (`Account.registration.loadError`), trang Cửa hàng nói về gian hàng.
            */
            title={variant === 'profileForm' ? tRegistration('loadError') : t('page.loadError')}
            onRetry={() => void query.refetch()}
          />
        </Screen>
      </>
    );
  }

  if (!query.data) {
    return (
      <>
        {shell}
        {/* `padded={false}`: khung chờ vẽ luôn ảnh bìa TRÀN VIỀN như bản thật. */}
        <Screen edges={['left', 'right', 'bottom']} padded={false}>
          <ShopProfileSkeleton />
        </Screen>
      </>
    );
  }

  return (
    <ProfileForm
      shell={shell}
      intro={intro}
      shop={query.data}
      canEdit={canEdit}
      /*
       * Dải chào chỉ dành cho gian hàng ĐÃ đi qua cửa gói và trả tiền — không cho một chủ xe
       * tuyến hoa hồng bắt được tham số từ một link chia sẻ.
       */
      welcome={welcome && isEstablishedPackageShop(tenant)}
      variant={variant}
      {...(section ? { section } : {})}
    />
  );
}

function NoTenantState({ shell }: { shell: ReactNode }) {
  const t = useTranslations('Shop.noTenant');
  const navigateOnce = useNavigateOnce();

  return (
    <>
      {shell}
      <Screen edges={['left', 'right', 'bottom']} scroll={false}>
        <ScreenMessage
          icon="storefront-outline"
          title={t('title')}
          description={t('description')}
          actionLabel={t('register')}
          onAction={() => navigateOnce(ROUTES.manage.onboarding())}
        />
      </Screen>
    </>
  );
}

/**
 * NHÓM Ô của trang Thông tin cửa hàng — mỗi tấm "Cập nhật" lưu đúng nhóm của nó (web
 * `SHOP_PROFILE_GROUP`, `shop-profile-form.ts`): một lượt lưu địa chỉ không viết lại tên hiển thị.
 */
const SHOP_PROFILE_GROUP = {
  DISPLAY: 'display',
  LEGAL: 'legal',
  MEDIA: 'media',
} as const;
type ShopProfileGroup = (typeof SHOP_PROFILE_GROUP)[keyof typeof SHOP_PROFILE_GROUP];

const SHOP_PROFILE_GROUP_FIELDS = {
  [SHOP_PROFILE_GROUP.DISPLAY]: ['displayName', 'phone', 'email', 'bio'],
  [SHOP_PROFILE_GROUP.LEGAL]: ['provinceCode', 'wardCode', 'addressLine', 'businessLicenseNo'],
  [SHOP_PROFILE_GROUP.MEDIA]: ['logoUrl', 'coverUrl'],
} as const satisfies Record<ShopProfileGroup, readonly (keyof ShopProfileWithContactValues)[]>;

/**
 * Thân request của MỘT nhóm — chuỗi rỗng = gỡ (DTO `ValidateIf(hasText)`); mã xã rỗng KHÔNG gửi (DTO `@Length(5, 5)`).
 *
 * `bio` CHỈ gửi khi người dùng thật sự sửa ô đó: server gỡ bản định dạng (`bioHtml`) mỗi khi nhận
 * `bio` không kèm `bioHtml`, nên gửi lại nguyên văn chữ thuần lúc chỉ đổi tên là xoá mất phần định
 * dạng gian hàng đã soạn ở web.
 */
function toPatch(
  v: ShopProfileWithContactValues,
  group: ShopProfileGroup,
  bioChanged: boolean,
): UpdateShopProfileInput {
  switch (group) {
    case SHOP_PROFILE_GROUP.DISPLAY:
      return {
        displayName: v.displayName,
        phone: v.phone,
        email: v.email,
        ...(bioChanged ? { bio: v.bio } : {}),
      };
    case SHOP_PROFILE_GROUP.LEGAL:
      return {
        provinceCode: v.provinceCode,
        wardCode: v.wardCode || undefined,
        addressLine: v.addressLine,
        businessLicenseNo: v.businessLicenseNo,
      };
    case SHOP_PROFILE_GROUP.MEDIA:
      return { logoUrl: v.logoUrl ?? '', coverUrl: v.coverUrl ?? '' };
  }
}

function ProfileForm({
  shell,
  intro,
  shop,
  canEdit,
  welcome,
  section,
}: {
  shell: ReactNode;
  section?: ShopSection;
  /** Khối của khu gọi, đặt TRÊN các thẻ. */
  intro?: ReactNode;
  shop: MyShop;
  canEdit: boolean;
  /** Đã lọc theo tuyến ở nơi gọi — ở đây chỉ còn là "có dựng dải chào hay không". */
  welcome: boolean;
  /** Giữ chữ ký cũ; trang chỉ còn MỘT bố cục (`ShopWorkspace` web). */
  variant: 'settings' | 'profileForm';
}) {
  const colors = useColors();
  const pull = usePartnerProfileRefresh();
  const t = useTranslations('Shop');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();
  const domainLabel = useDomainLabel();
  const { tenant } = useTenantScope();
  const permissions = usePermissions();
  const branches = useFeature(PLAN_FEATURE.BRANCHES);
  const updateProfile = useUpdateShopProfile();
  const [editing, setEditing] = useState<ShopProfileGroup | null>(null);

  /*
   * Cuộn tới thẻ được yêu cầu (`?section=`) — MỘT lần mỗi lần màn được focus, khi đã đo được vị trí.
   * Toạ độ thẻ tương đối với cột nội dung, nên cộng hai lớp.
   */
  const scrollRef = useRef<ScrollView | null>(null);
  /** Hàm mở bộ chọn logo do thẻ hiển thị trao lên - dải chào "Tải logo" gọi nó (web bấm hộ nút logo). */
  const openLogoPicker = useRef<(() => void) | null>(null);
  const onLogoPickerReady = useCallback((open: () => void) => {
    openLogoPicker.current = open;
  }, []);
  const columnY = useRef<number | null>(null);
  const sectionY = useRef<Partial<Record<ShopSection, number>>>({});
  const scrolled = useRef(false);
  const scrollToSection = useCallback(() => {
    if (!section || scrolled.current) return;
    const y = sectionY.current[section];
    if (columnY.current === null || y === undefined) return;
    scrolled.current = true;
    scrollRef.current?.scrollTo({ y: Math.max(0, columnY.current + y - space.md), animated: true });
  }, [section]);
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
  const measure = useCallback(
    (key: ShopSection) => (event: LayoutChangeEvent) => {
      sectionY.current[key] = event.nativeEvent.layout.y;
      scrollToSection();
    },
    [scrollToSection],
  );

  const vehicles = useVehiclesPage(WELCOME_VEHICLE_PAGE, welcome);
  const hasVehicle = vehicles.isLoading || (vehicles.data?.items.length ?? 0) > 0;

  const resolver = useValidationResolver<ShopProfileWithContactValues>(
    shopProfileWithContactSchema,
    'Shop.validation',
  );
  const form = useForm<ShopProfileWithContactValues>({
    resolver,
    values: toValues(shop),
    resetOptions: { keepDirtyValues: true },
  });
  const dirtyFields = form.formState.dirtyFields;
  const mediaDirty = Boolean(dirtyFields.logoUrl || dirtyFields.coverUrl);

  const status = shop.status as TenantStatus;
  const saving = updateProfile.isPending;
  const readOnlyReason = canEdit ? null : t('form.readOnly');

  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const canSeePlan = isPlanPromotionEnabled && permissions.has(PERMISSION.SUBSCRIPTION_VIEW);
  const canSeeTax = permissions.has(PERMISSION.SELLER_PROFILE_VIEW);
  // Web `ShopWorkspace`: `!personal && BRANCH_VIEW && cờ branches visible` - màn này là bản GIAN
  // HÀNG (bản cá nhân là `OwnerProfileScreen`), không gác thêm theo tuyến.
  const canSeeBranches = permissions.has(PERMISSION.BRANCH_VIEW) && branches.isVisible;

  /** Trả các ô của MỘT nhóm về bản đã lưu — đóng tấm sửa, hoặc "Hủy" của ảnh. */
  function resetGroup(group: ShopProfileGroup) {
    const saved = toValues(shop);
    for (const field of SHOP_PROFILE_GROUP_FIELDS[group]) {
      form.resetField(field, { defaultValue: saved[field] });
    }
  }

  async function saveGroup(group: ShopProfileGroup) {
    // Một lượt đang bay thì không gửi lượt thứ hai.
    if (saving) return;
    const valid = await form.trigger([...SHOP_PROFILE_GROUP_FIELDS[group]]);
    if (!valid) return;
    const values = form.getValues();
    try {
      await updateProfile.mutateAsync(toPatch(values, group, form.getFieldState('bio').isDirty));
    } catch (err) {
      // Giữ nguyên tấm + giá trị đang sửa để sửa và gửi lại.
      toast.showError(errorMessage(err));
      return;
    }
    toast.showSuccess(t('form.saved'));
    // Bản vừa lưu thành mốc "chưa sửa" của nhóm — nhóm khác đang sửa dở không bị đụng.
    for (const field of SHOP_PROFILE_GROUP_FIELDS[group]) {
      form.resetField(field, { defaultValue: values[field] });
    }
    setEditing(null);
  }

  function closeSheet() {
    if (editing) resetGroup(editing);
    setEditing(null);
  }

  const roleKey = tenant?.roleKey;
  const isActive = status === TENANT_STATUS.ACTIVE;

  /** Cuộn tới thẻ Chi nhánh NGAY trên trang - web cuộn theo `?section=branches`. */
  const scrollToBranches = () => {
    const y = sectionY.current[SHOP_SECTION.BRANCHES];
    if (columnY.current === null || y === undefined) return;
    scrollRef.current?.scrollTo({
      y: Math.max(0, columnY.current + y - space.md),
      animated: true,
    });
  };

  return (
    <>
      {shell}
      <Screen
        edges={['left', 'right', 'bottom']}
        scrollRef={scrollRef}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
      >
        <YStack gap={layout.section} onLayout={onColumnLayout}>
          {/*
            Đầu trang (design `23999:111044`, `ShopWorkspace.module.css` `.header`): logo VUÔNG 54
            bo 12 nền vàng chuyển · tên 20/30 đậm vừa + viên trạng thái cùng dòng · dòng phụ 14 xám;
            rồi viên vai (đen, chữ vàng, cao 40 bo 12) + nút viền "Xem gian hàng" cao 40.
          */}
          <YStack gap={space.md}>
            <XStack ai="center" gap={12}>
              <Avatar
                name={shop.name}
                url={shop.profile.logoUrl ?? null}
                size={HEAD_LOGO}
                square
                gradient
              />
              <YStack f={1} minWidth={0}>
                <XStack ai="center" gap={space.sm} flexWrap="wrap">
                  <Text
                    col={colors.text}
                    fos={fontSize.lead}
                    lineHeight={30}
                    fow={fontWeight.semibold}
                    flexShrink={1}
                  >
                    {shop.name}
                  </Text>
                  <Pill
                    label={domainLabel('tenantStatus', status)}
                    tone={pillToneOfStatusColor(metaColor(TENANT_STATUS_META, status))}
                  />
                </XStack>
                <Text col={colors.placeholder} fos={fontSize.body} lineHeight={20}>
                  {t('page.subtitle')}
                </Text>
              </YStack>
            </XStack>
            {roleKey || isActive ? (
              <XStack ai="center" gap={12} flexWrap="wrap">
                {roleKey ? (
                  <XStack
                    ai="center"
                    gap={6}
                    h={ROLE_CHIP_HEIGHT}
                    px={12}
                    br={radius.control}
                    bg={market.inverse}
                  >
                    <AntIcon icon={SafetyCertificateOutlined} size={14} color={colors.goldOnDark} />
                    <Text col={colors.goldOnDark} fos={fontSize.body} lineHeight={20} fow={fontWeight.medium}>
                      {domainLabel('tenantRole', roleKey)}
                    </Text>
                  </XStack>
                ) : null}
                {isActive ? (
                  <Button
                    label={t('page.viewPublicPage')}
                    icon="open-outline"
                    variant="secondary"
                    size="md"
                    shape="square"
                    block={false}
                    onPress={() => void Linking.openURL(`${resolveWebBaseUrl()}/${shop.slug}`)}
                  />
                ) : null}
              </XStack>
            ) : null}
          </YStack>

          {intro}
          {welcome ? (
            <ShopWelcomeBanner
              missingLogo={!shop.profile.logoUrl}
              hasVehicle={hasVehicle}
              onPickLogo={() => {
                scrollRef.current?.scrollTo({ y: 0, animated: true });
                openLogoPicker.current?.();
              }}
            />
          ) : null}
          <ShopStatusBanner shop={shop} />
          {readOnlyReason ? <Callout tone="info">{readOnlyReason}</Callout> : null}

          {/* Màn hẹp: "Thông tin hiển thị" lên ĐẦU — thứ khách thấy (S1); checklist ngay dưới (S12). */}
          <YStack onLayout={measure(SHOP_SECTION.PROFILE)} gap={space.md}>
            <ShopDisplayCard
              shop={shop}
              control={form.control}
              canEdit={canEdit}
              mediaDirty={mediaDirty}
              saving={saving}
              onEdit={() => setEditing(SHOP_PROFILE_GROUP.DISPLAY)}
              onMediaCancel={() => resetGroup(SHOP_PROFILE_GROUP.MEDIA)}
              onMediaSave={() => void saveGroup(SHOP_PROFILE_GROUP.MEDIA)}
              onLogoPickerReady={onLogoPickerReady}
            />
            {canEdit ? (
              <ShopProfileChecklist
                control={form.control}
                ownerAccount={shop.ownerAccount}
                logoRequired={isPackageShopTrack(tenant)}
              />
            ) : null}
          </YStack>

          <ShopOwnerCard
            owner={shop.ownerAccount}
            onOpenSecurity={() => navigateOnce(ROUTES.manage.account())}
          />

          <YStack onLayout={measure(SHOP_SECTION.LEGAL)}>
            <ShopLegalCard
              shop={shop}
              {...(canEdit ? { onEdit: () => setEditing(SHOP_PROFILE_GROUP.LEGAL) } : {})}
              {...(canSeeBranches
                ? {
                    // Web: link "Quản lý" cuộn tới thẻ Chi nhánh NGAY trên trang (`?section=branches`).
                    onManageBranches: scrollToBranches,
                  }
                : {})}
            />
          </YStack>

          {canSeeTax ? <ShopTaxCard onLayout={measure(SHOP_SECTION.TAX)} /> : null}

          {canSeeBranches ? <ShopBranchesCard onLayout={measure(SHOP_SECTION.BRANCHES)} /> : null}

          {/*
            Gói & hạn mức — sau cờ của nền tảng (app không bán gói, quy định store). Thân màn gói nằm
            trong một thẻ, đúng `ShopPlanSection` web.
          */}
          {canSeePlan ? <ShopPlanCard onLayout={measure(SHOP_SECTION.PLAN)} /> : null}
        </YStack>
      </Screen>

      {canEdit ? (
        <>
          <ShopDisplaySheet
            open={editing === SHOP_PROFILE_GROUP.DISPLAY}
            control={form.control}
            saving={saving}
            hasFormattedBio={Boolean(shop.profile.bioHtml)}
            onCancel={closeSheet}
            onSubmit={() => void saveGroup(SHOP_PROFILE_GROUP.DISPLAY)}
          />
          <ShopLegalSheet
            open={editing === SHOP_PROFILE_GROUP.LEGAL}
            control={form.control}
            saving={saving}
            onCancel={closeSheet}
            onSubmit={() => void saveGroup(SHOP_PROFILE_GROUP.LEGAL)}
            {...(canSeeBranches
              ? {
                  // Đóng tấm (bỏ phần đang sửa dở như "Hủy") rồi cuộn tới thẻ Chi nhánh.
                  onManageBranches: () => {
                    closeSheet();
                    scrollToBranches();
                  },
                }
              : {})}
          />
        </>
      ) : null}
    </>
  );
}
