import { LinearGradient } from 'expo-linear-gradient';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { Linking, StyleSheet, type LayoutChangeEvent, type ScrollView } from 'react-native';
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
import { LineIcon } from '@/components/icons/LineIcon';
import { Screen } from '@/components/layout/Screen';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ShopProfileSkeleton } from '@/components/ui/Skeleton';
import { Pill, pillToneOfStatusColor } from '@/components/ui/Pill';
import { statusTone } from '@/components/ui/StatusBadge';
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
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES, SHOP_SECTION, type ShopSection } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, gradients, iconSize, radius, space, typeScale } from '@/theme/tokens';
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

/** Logo đầu trang 54 bo 8 có viền (Figma `24231:113121`). */
const HEAD_LOGO = 54;
const HEAD_LOGO_RADIUS = 8;
/** Chấm trạng thái 8 viền trắng 1.2 ở góc logo (`24231:113141`, đặt tại x 46 · y 45). */
const STATUS_DOT = 8;
const STATUS_DOT_RING = 1.2;
const STATUS_DOT_RIGHT = HEAD_LOGO - 46 - STATUS_DOT;
const STATUS_DOT_BOTTOM = HEAD_LOGO - 45 - STATUS_DOT;
/** Thẻ đầu trang (`24231:112115`): đệm 16, khe 12. */
const HEAD_PAD = 16;
const HEAD_GAP = 12;
/** Viên vai cao 40, đệm 12, bo tròn hết (`24231:113146`). */
const ROLE_CHIP_HEIGHT = 40;
/** Hướng dải viên vai (106deg ≈ trái → phải, hơi chéo xuống). */
const ROLE_GRADIENT_START = { x: 0, y: 0.36 } as const;
const ROLE_GRADIENT_END = { x: 1, y: 0.64 } as const;

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
  const tNav = useTranslations('Navigation.public');
  const tRegistration = useTranslations('Account.registration');
  const navigateOnce = useNavigateOnce();
  const router = useRouter();
  const goBack = useCallback(() => goBackOr(router, ROUTES.manage.more()), [router]);
  /*
   * Figma Partner "Quản lý gian hàng" (`24231:112113`): mũi tên quay lại + tiêu đề "Quản lý gian
   * hàng" - đúng tên dòng mở màn này ở menu tài khoản. Không có mục để quay về thì về menu "Thêm".
   */
  const shell = header ?? <ManagePageHeader title={tNav('manageShop')} onBack={goBack} />;
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
  const tActions = useTranslations('Common.actions');
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

  const statusColor = metaColor(TENANT_STATUS_META, status);

  return (
    <>
      {shell}
      <Screen
        edges={['left', 'right', 'bottom']}
        scrollRef={scrollRef}
        refreshing={pull.refreshing}
        onRefresh={pull.onRefresh}
        /*
         * Footer cố định "Hủy · Lưu thay đổi" (Figma "Footer cố định" `24231:112208`) - CHỈ khi có
         * logo/ảnh bìa chưa lưu (người dùng chốt 26/11/2026). Các nhóm khác lưu qua tấm sửa của nó.
         */
        {...(canEdit
          ? {
              footer: (
                <XStack gap={HEAD_GAP}>
                  <YStack flexShrink={0}>
                    <Button
                      label={tActions('cancel')}
                      variant="neutral"
                      shape="square"
                      disabled={saving || !mediaDirty}
                      onPress={() => resetGroup(SHOP_PROFILE_GROUP.MEDIA)}
                    />
                  </YStack>
                  <YStack flexGrow={1} flexShrink={1} flexBasis="auto">
                    <Button
                      label={tActions('saveChanges')}
                      lineIcon="tick"
                      variant="gradient"
                      shape="square"
                      loading={saving}
                      disabled={!mediaDirty}
                      onPress={() => void saveGroup(SHOP_PROFILE_GROUP.MEDIA)}
                    />
                  </YStack>
                </XStack>
              ),
            }
          : {})}
      >
        <YStack gap={layout.section} onLayout={onColumnLayout}>
          {/*
            Đầu trang (Figma `24231:112115`): thẻ trắng viền xám; logo VUÔNG 54 bo 8 có chấm trạng
            thái ở góc · tên 16/24 đậm vừa · dòng phụ 14/20 xám; rồi viên vai (dải đen, Shield Star +
            chữ vàng, cao 40 bo tròn) + nút viền "Xem gian hàng" (Foreign) cao 40. Gian hàng KHÔNG ở
            trạng thái hoạt động thì vẫn có viên chữ cạnh tên (người dùng chốt 26/11/2026).
          */}
          <YStack
            gap={HEAD_GAP}
            p={HEAD_PAD}
            br={radius.card}
            bw={1}
            bc={colors.border}
            bg={colors.surface}
          >
            <XStack ai="center" gap={HEAD_GAP}>
              <YStack
                w={HEAD_LOGO}
                h={HEAD_LOGO}
                accessible
                accessibilityLabel={domainLabel('tenantStatus', status)}
              >
                <Avatar
                  name={shop.name}
                  url={shop.profile.logoUrl ?? null}
                  size={HEAD_LOGO}
                  square
                  squareRadius={HEAD_LOGO_RADIUS}
                  bordered
                  gradient
                />
                <YStack
                  pos="absolute"
                  r={STATUS_DOT_RIGHT - STATUS_DOT_RING}
                  b={STATUS_DOT_BOTTOM - STATUS_DOT_RING}
                  w={STATUS_DOT + STATUS_DOT_RING * 2}
                  h={STATUS_DOT + STATUS_DOT_RING * 2}
                  br={radius.pill}
                  bw={STATUS_DOT_RING}
                  bc={colors.surface}
                  bg={statusTone(statusColor, colors).fg}
                />
              </YStack>
              <YStack f={1} minWidth={0} gap={4}>
                <XStack ai="center" gap={space.sm} flexWrap="wrap">
                  <Text
                    col={colors.text}
                    fos={typeScale.title.fontSize}
                    lh={typeScale.title.lineHeight}
                    fow={fontWeight.semibold}
                    flexShrink={1}
                  >
                    {shop.name}
                  </Text>
                  {isActive ? null : (
                    <Pill label={domainLabel('tenantStatus', status)} tone={pillToneOfStatusColor(statusColor)} />
                  )}
                </XStack>
                <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
                  {t('page.subtitle')}
                </Text>
              </YStack>
            </XStack>
            {roleKey || isActive ? (
              <XStack ai="center" gap={HEAD_GAP} flexWrap="wrap">
                {roleKey ? (
                  <XStack
                    ai="center"
                    gap={6}
                    h={ROLE_CHIP_HEIGHT}
                    px={12}
                    br={radius.pill}
                    ov="hidden"
                  >
                    <LinearGradient
                      colors={gradients.roleChipDark.colors}
                      locations={gradients.roleChipDark.locations}
                      start={ROLE_GRADIENT_START}
                      end={ROLE_GRADIENT_END}
                      style={StyleSheet.absoluteFill}
                    />
                    <LineIcon name="shield-star" size={iconSize.lg} color={colors.goldOnDark} />
                    <Text
                      col={colors.goldOnDark}
                      fos={typeScale.body.fontSize}
                      lh={typeScale.body.lineHeight}
                      fow={fontWeight.medium}
                    >
                      {domainLabel('tenantRole', roleKey)}
                    </Text>
                  </XStack>
                ) : null}
                {isActive ? (
                  <Button
                    label={t('page.viewPublicPage')}
                    lineIcon="foreign"
                    variant="neutral"
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
              saving={saving}
              onEdit={() => setEditing(SHOP_PROFILE_GROUP.DISPLAY)}
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
              look="figma"
              {...(canEdit ? { onEdit: () => setEditing(SHOP_PROFILE_GROUP.LEGAL) } : {})}
              {...(canSeeBranches
                ? {
                    // Web: link "Quản lý" cuộn tới thẻ Chi nhánh NGAY trên trang (`?section=branches`).
                    onManageBranches: scrollToBranches,
                  }
                : {})}
            />
          </YStack>

          {canSeeTax ? <ShopTaxCard look="figma" onLayout={measure(SHOP_SECTION.TAX)} /> : null}

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
            /* Không còn lối "Quản lý chi nhánh" trong tấm (người dùng chốt 27/11/2026). */
            noticesAsToast
            helpInTitle
          />
        </>
      ) : null}
    </>
  );
}
