import { useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import type { ReactNode } from 'react';
import { useTranslations } from 'use-intl';
import {
  canSubmitShopVerification,
  isEstablishedPackageShop,
  isPackageShopTrack,
  PERMISSION,
  SHOP_VERIFICATION,
  TENANT_STATUS,
  type ShopVerification,
  type TenantStatus,
} from '@xeprime/types';
import { guessAddressLine } from '@xeprime/domain';
import { shopProfileSchema, type ShopProfileValues } from '@xeprime/validators';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { FormSection } from '@/components/ui/FormSection';
import { InlineAction } from '@/components/ui/InlineAction';
import { AddressFields } from '@/components/form/AddressFields';
import { ShopProfileSkeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { space } from '@/theme/tokens';
import type { MyShop, UpdateShopProfileInput } from './api';
import { ShopIdentityCard } from './components/ShopIdentityCard';
import { ShopProfileChecklist } from './components/ShopProfileChecklist';
import { ShopStatusBanner } from './components/ShopStatusBanner';
import { ShopWelcomeBanner } from './components/ShopWelcomeBanner';
import { useVehiclesPage } from '@/features/vehicles/hooks/use-vehicles';
import { useMyShop, useSubmitShopReview, useUpdateShopProfile } from './hooks/use-shop';

/** Tên trường địa chỉ trong `shopProfileSchema` — hằng ngoài component, định danh ổn định. */
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

/** Dải chào chỉ hỏi "đã có xe nào chưa" — MỘT bản ghi là đủ để trả lời, đúng cỡ web hỏi. */
const WELCOME_VEHICLE_PAGE = { page: 1, limit: 1 };

/** Giá trị form → thân request. Dùng cho CẢ hai đường ra: lưu, và lưu-rồi-gửi-duyệt. */
function toBody(v: ShopProfileValues): UpdateShopProfileInput {
  return {
    displayName: v.displayName,
    bio: v.bio,
    // Chỉ gửi MÃ + phần chi tiết — tên tỉnh/xã và chuỗi hiển thị do server ghép, rồi chuyển tiếp
    // cho chi nhánh mặc định (writer duy nhất của địa chỉ vận hành).
    provinceCode: v.provinceCode,
    /*
     * Chuỗi RỖNG không được gửi: DTO khai `@IsOptional()` kèm `@Length(5, 5)`, mà `@IsOptional`
     * chỉ bỏ qua `null`/`undefined`. Từ ADR 0042 form không còn ô Xã/phường, nên hồ sơ chưa từng
     * khai mã xã sẽ luôn rơi vào nhánh này — thiếu dòng này thì nút Lưu chết với một lỗi độ dài
     * trỏ vào một ô không tồn tại trên màn.
     */
    wardCode: v.wardCode || undefined,
    addressLine: v.addressLine,
    taxCode: v.taxCode,
    businessLicenseNo: v.businessLicenseNo,
    logoUrl: v.logoUrl ?? '',
    coverUrl: v.coverUrl ?? '',
  };
}

/**
 * Giá trị khởi tạo của form.
 *
 * Tỉnh/thành lấy từ CHI NHÁNH MẶC ĐỊNH trước; hai cột trên hồ sơ chỉ là bản sao dự phòng cho dữ
 * liệu cũ (`syncProfileFromDefaultBranch` ở backend). Đọc ngược lại sẽ hiện tỉnh cũ ngay sau khi
 * chủ shop vừa đổi chi nhánh — hai nguồn tỉnh lệch nhau là đúng thứ SHP-02 phải tránh.
 *
 * SĐT đổi về dạng `09…` để nhập/đọc; backend lưu `84…` và tự chuẩn hoá lại khi nhận.
 */
function toValues(shop: MyShop): ShopProfileValues {
  const p = shop.profile;
  return {
    displayName: p.displayName ?? '',
    bio: p.bio ?? '',
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
    taxCode: p.taxCode ?? '',
    businessLicenseNo: p.businessLicenseNo ?? '',
    logoUrl: p.logoUrl ?? null,
    coverUrl: p.coverUrl ?? null,
  };
}

/**
 * Hồ sơ gian hàng + gửi duyệt (SHP-02) — bản native của `/manage/shop`.
 *
 * Route chỉ lo bốn việc: quyền, dữ liệu, mutation và các trạng thái chưa-có-dữ-liệu. Toàn bộ
 * phần phụ thuộc "form có thay đổi chưa / còn thiếu gì" nằm trong `ProfileForm` — hai câu hỏi mà
 * chỉ form trả lời được.
 *
 * Ba trục quyền TÁCH BẠCH, không gộp: `tenant.view` để xem, `tenant.update` để lưu,
 * `tenant.submit_review` để gửi duyệt. Và "không có quyền" KHÁC "gian hàng đang chờ duyệt" —
 * cái sau khoá form vì backend từ chối ghi (`INVALID_STATUS_TRANSITION`), không phải vì vai trò.
 */
/**
 * `header` — VỎ điều hướng của khu đang đứng.
 *
 * Cùng màn này phục vụ hai khu: khu quản lý (`/manage/shop`) và khu khách
 * (`/account/registration`, nơi chủ xe tuyến hoa hồng sửa hồ sơ gian hàng của mình — họ KHÔNG
 * vào khu quản lý được, ADR 0038 điều 4). Chỉ cái đầu trang khác nhau; luật lưu, luật gửi
 * duyệt và quyền thì giống hệt, nên clone màn là hai chỗ phải sửa mỗi lần đổi luật.
 *
 * Mặc định là đầu trang khu quản lý — nơi màn này ra đời.
 */
export function ShopProfileScreen({
  header,
  intro,
  welcome = false,
}: {
  header?: ReactNode;
  intro?: ReactNode;
  /**
   * Vừa thanh toán lượt gói đầu tiên xong — bật DẢI CHÀO một lần (ADR 0040).
   *
   * Không mở hay khoá gì: cổng logo thật nằm ở `submitForPublicReview`. Route đọc nó từ tham số
   * điều hướng, và kịch bản xấu nhất là ai đó thấy một dòng chào không dành cho mình.
   */
  welcome?: boolean;
} = {}) {
  const t = useTranslations('Shop');
  const shell = header ?? <ManageHeader />;
  const permissions = usePermissions();
  const { tenant } = useTenantScope();

  const canView = permissions.has(PERMISSION.TENANT_VIEW);
  const canEdit = permissions.has(PERMISSION.TENANT_UPDATE);
  const canSubmit = permissions.has(PERMISSION.TENANT_SUBMIT_REVIEW);

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
            title={t('page.loadError')}
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
      canSubmit={canSubmit}
      /*
       * Dải chào chỉ dành cho gian hàng ĐÃ đi qua cửa gói và trả tiền — không cho một chủ xe
       * tuyến hoa hồng bắt được tham số từ một link chia sẻ.
       */
      welcome={welcome && isEstablishedPackageShop(tenant)}
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

function ProfileForm({
  shell,
  intro,
  shop,
  canEdit,
  canSubmit,
  welcome,
}: {
  shell: ReactNode;
  /** Khối của khu gọi, đặt TRÊN biểu mẫu — tiến trình đăng ký ở khu khách, không có gì ở Manage. */
  intro?: ReactNode;
  shop: MyShop;
  canEdit: boolean;
  canSubmit: boolean;
  /** Đã lọc theo tuyến ở nơi gọi — ở đây chỉ còn là "có dựng dải chào hay không". */
  welcome: boolean;
}) {
  const t = useTranslations('Shop');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const navigateOnce = useNavigateOnce();

  const { tenant } = useTenantScope();
  const updateProfile = useUpdateShopProfile();
  const submitReview = useSubmitShopReview();
  const [confirmOpen, setConfirmOpen] = useState(false);
  /**
   * Hàm mở tấm chọn ảnh LOGO, do `ShopIdentityCard` đặt vào — CTA của dải chào gọi nó.
   *
   * Web cuộn tới ô logo rồi `focus()` vào nút mở hộp chọn file; native không có DOM để hỏi, nên
   * khối sở hữu tấm chọn phải tự đưa tay ra. Chỉ có `welcome` cần tới, và chỉ ở một nhánh.
   */
  const logoPicker = useRef<(() => void) | null>(null);

  /*
   * Chỉ cần BIẾT có xe nào chưa — dải chào đổi câu theo đó. Trang đầu là đủ để trả lời, nên không
   * kéo bộ lọc của màn danh sách vào một màn không có ô lọc nào.
   *
   * `enabled` theo `welcome`: gian hàng không ở trong khoảnh khắc vừa-thanh-toán thì không phải
   * trả một lượt gọi danh sách xe cho một dải không dựng.
   */
  const vehicles = useVehiclesPage(WELCOME_VEHICLE_PAGE, welcome);
  /*
   * ĐANG TẢI tính là CÓ xe — mặc định im lặng, đúng như web.
   *
   * Trong lúc lượt đếm còn bay, `data` rỗng; coi đó là "chưa có xe" sẽ nháy đúng dòng "Sẵn sàng rồi
   * · Đăng xe đầu tiên" vào mặt một gian hàng mười xe. Dải này vốn được thiết kế để im khi không có
   * gì để nói, nên im cũng là câu trả lời đúng cho "chưa biết". `isLoading` là `false` với query bị
   * tắt, nên cổng `enabled: welcome` vẫn nguyên tác dụng.
   */
  const hasVehicle = vehicles.isLoading || (vehicles.data?.items.length ?? 0) > 0;

  const resolver = useValidationResolver<ShopProfileValues>(shopProfileSchema, 'Shop.validation');
  /*
   * `values` (không phải `defaultValues`): sau khi lưu, query trả hồ sơ mới và form phải theo —
   * nếu không, "Huỷ bỏ" mời người dùng hoàn tác thứ đã lưu xong rồi.
   */
  const { control, handleSubmit, reset, formState, getValues } = useForm<ShopProfileValues>({
    resolver,
    values: toValues(shop),
  });

  const status = shop.status as TenantStatus;
  /*
   * Backend cũng từ chối ghi khi đang chờ XÁC MINH (`SHOP_VERIFICATION_PENDING`). Khoá ở đây để
   * người dùng biết TRƯỚC khi gõ, chứ không phải sau khi bấm Lưu.
   *
   * Điều kiện đọc từ trục xác minh, không từ `tenants.status`: từ ADR 0036 cột đó không còn mang
   * nghĩa "đang chờ duyệt", nên hỏi nó là hỏi nhầm chỗ và ô nhập sẽ mở ra đúng lúc phải khoá.
   */
  const pendingReview = shop.verification === SHOP_VERIFICATION.PENDING;
  const readOnly = pendingReview || !canEdit;
  const readOnlyReason = pendingReview
    ? t('form.lockedWhilePending')
    : canEdit
      ? null
      : t('form.readOnly');

  const dirty = formState.isDirty && !readOnly;
  /** Hồ sơ ở chặng "chưa gửi / bị trả về" — chỉ khi đó checklist và nút Gửi xác minh mới có nghĩa. */
  const submittable = canSubmitShopVerification(shop.verification as ShopVerification);
  const saving = updateProfile.isPending;
  const submitting = submitReview.isPending || updateProfile.isPending;

  const save = handleSubmit((v) =>
    updateProfile.mutate(toBody(v), {
      onSuccess: () => toast.showSuccess(t('form.saved')),
      onError: (err) => toast.showError(errorMessage(err)),
    }),
  );

  /**
   * Bấm "Gửi duyệt" chạy VALIDATE TRƯỚC, rồi mới hỏi xác nhận.
   *
   * Không có bước này thì nút sáng ngay cả khi họ tên và SĐT chủ gian hàng còn trống, và người
   * duyệt nhận một hồ sơ không liên hệ được với ai. Thứ tự cũng có chủ ý — hỏi "gửi nhé?" rồi
   * mới báo "thiếu 2 mục" là bắt người dùng đi qua một hộp thoại vô ích.
   */
  const askSubmitReview = handleSubmit(
    () => setConfirmOpen(true),
    (errors) => toast.showError(t('status.incomplete', { count: Object.keys(errors).length })),
  );

  /**
   * Gửi duyệt = (lưu nốt nếu còn dở) → gửi.
   *
   * Backend snapshot hồ sơ TỪ DATABASE, nên gửi thẳng khi form còn thay đổi chưa lưu sẽ đưa cho
   * người duyệt đúng bản cũ mà chủ shop vừa sửa xong và tưởng đã gửi đi.
   */
  const confirmSubmitReview = () => {
    setConfirmOpen(false);
    const send = () =>
      submitReview.mutate(undefined, {
        onSuccess: () => toast.showSuccess(t('status.submitted')),
        onError: (err) => toast.showError(errorMessage(err)),
      });

    if (!dirty) return send();
    updateProfile.mutate(toBody(getValues()), {
      onSuccess: send,
      onError: (err) => toast.showError(errorMessage(err)),
    });
  };

  const editable = !readOnly && !saving;

  return (
    <>
      {shell}
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        /*
          Hành động Lưu neo ở ĐÁY MÀN và LUÔN có mặt khi form sửa được — mờ đi cho tới khi thật
          sự có thay đổi, đúng như `ShopProfileWorkspace` bên web.

          Bản trước ẩn cả thanh cho tới lúc form dirty. Với một chủ xe tuyến hoa hồng đã được
          duyệt, màn "Hồ sơ chủ xe" khi đó KHÔNG CÒN CÁI NÚT NÀO: hồ sơ đang `active` nên dải
          trạng thái cũng không có nút gửi duyệt, và người dùng đọc màn đó ra là một trang chỉ
          để xem. Một nút mờ nói "sửa đi rồi lưu được"; không có nút thì không nói gì cả.

          "Đặt lại" thì vẫn chỉ mọc khi có thay đổi — nó là thao tác HOÀN TÁC, và một nút hoàn
          tác thường trực mời người ta bấm vào thứ chẳng có gì để hoàn.

          Neo ở đáy chứ không đặt cuối trang: biểu mẫu này dài bốn khối, sửa một ô ở khối đầu mà
          phải cuộn hết phần còn lại mới lưu được là bắt người dùng đi một quãng vô ích.
        */
        footer={
          readOnly ? null : (
            <XStack gap={space.sm}>
              {dirty ? (
                <YStack flexShrink={0}>
                  <Button
                    label={t('form.reset')}
                    icon="refresh-outline"
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
                  disabled={!dirty}
                  loading={saving}
                  onPress={() => void save()}
                />
              </YStack>
            </XStack>
          )
        }
      >
        {/*
          Chỉ gian hàng ĐANG HOẠT ĐỘNG mới có lối sang trang công khai — y như web, vì liên kết
          tới một trang 404 là một hành động giả.
        */}
        <ShopIdentityCard
          control={control}
          fallbackName={shop.name}
          status={status}
          description={t('page.subtitle')}
          editable={editable}
          logoPickerRef={logoPicker}
          {...(status === TENANT_STATUS.ACTIVE
            ? { onViewPublicPage: () => navigateOnce(ROUTES.explore.shopDetail(shop.slug)) }
            : {})}
        />

        <YStack px={layout.screenX} pt={layout.section} gap={layout.section} pb={layout.section}>
          {/*
            Khối của khu gọi — tiến trình đăng ký ở khu khách, không có gì ở khu quản lý. Đặt TRÊN
            dải trạng thái: người mới đăng ký cần biết mình đang ở bước nào trước khi đọc một câu
            về việc gửi duyệt.
          */}
          {intro}

          {/*
            Dải chào sau lượt thanh toán gói đầu tiên (ADR 0040). Tự im lặng khi không còn gì để
            nói — xem `ShopWelcomeBanner`, "hình dạng thứ ba".
          */}
          {welcome ? (
            <ShopWelcomeBanner
              missingLogo={!shop.profile.logoUrl}
              hasVehicle={hasVehicle}
              onPickLogo={() => logoPicker.current?.()}
            />
          ) : null}

          <ShopStatusBanner
            shop={shop}
            canSubmit={canSubmit}
            submitting={submitting}
            onSubmit={() => void askSubmitReview()}
          />

          {/*
            Checklist chỉ ở chặng chưa gửi / bị trả về. Hồ sơ đang chờ duyệt hay đã hoạt động thì
            nó không còn nói gì mới — người dùng đâu sửa được nữa.
          */}
          {submittable ? (
            <ShopProfileChecklist
              control={control}
              ownerAccount={shop.ownerAccount}
              /*
               * Logo là mục CHẶN với gian hàng TUYẾN GÓI (ADR 0040 điều 7): thiếu nó thì
               * `submitForPublicReview` từ chối thật. Chủ xe tuyến hoa hồng không bị cổng đó chạm
               * tới — bắt một người có một chiếc xe phải có logo gian hàng là dựng lại đúng rào cản
               * mà ADR 0036 vừa gỡ.
               */
              logoRequired={isPackageShopTrack(tenant)}
            />
          ) : null}

          {readOnlyReason ? <Callout tone="info">{readOnlyReason}</Callout> : null}

          {/* Khối CÔNG KHAI — thứ khách nhìn thấy trên marketplace. */}
          <FormSection title={t('form.display.title')} icon="storefront-outline">
            <TextField
              control={control}
              name="displayName"
              label={t('form.display.displayName.label')}
              placeholder={t('form.display.displayName.placeholder')}
              required
              editable={editable}
            />
            <TextField
              control={control}
              name="bio"
              label={t('form.display.bio.label')}
              placeholder={t('form.display.bio.placeholder')}
              multiline
              rows={3}
              maxLength={2000}
              editable={editable}
            />
          </FormSection>

          {/*
            KHÔNG còn khối "chủ gian hàng" (16/09/2026): ba cột `tenant_profiles.owner_*` đã
            drop, và danh tính chủ đọc từ tài khoản (`MyShopDto.ownerAccount`). Nó đổi qua đúng
            luồng của nó — tên ở hồ sơ cá nhân, email/SĐT qua xác minh OTP — chứ không phải qua
            một form mà bất kỳ ai có `tenant.update` cũng ghi được (ADR 0038 điều 3).
          */}

          <FormSection title={t('form.address.title')} icon="location-outline">
            {/*
              Địa chỉ ở đây là địa chỉ của CHI NHÁNH MẶC ĐỊNH: đổi nó là backend dời chi nhánh đó
              và đồng bộ lại vị trí công khai của mọi xe thuộc nó. Không có nguồn địa chỉ thứ hai
              nào ở client.
            */}
            <AddressFields
              control={control}
              names={ADDRESS_FIELD_NAMES}
              pin={ADDRESS_PIN_NAMES}
              required
              disabled={!editable}
            />
            {/*
              Lối sang màn Chi nhánh là một LIÊN KẾT CHỮ, không phải nút.

              `Button` mang theo hộp cao 48dp và lề ngang 16 kể cả ở biến thể ghost — cho một
              dòng chữ phụ chen giữa hai ô nhập thì đó là một khoảng trống cắt ngang khối, và nó
              đọc ra ngang hàng với hành động chính của cả biểu mẫu. `InlineAction` giữ vùng chạm
              44pt bằng `hitSlop`, không bằng kích thước vẽ ra.

              Bọc `XStack` để vùng chạm ôm đúng chữ: trong `YStack` thì `Pressable` giãn hết bề
              ngang thẻ, và chạm vào khoảng trắng bên phải cũng điều hướng.
            */}
            <XStack>
              <InlineAction
                label={t('form.address.province.branchLink')}
                onPress={() => navigateOnce(ROUTES.manage.shopBranches())}
              />
            </XStack>
            <TextField
              control={control}
              name="taxCode"
              label={t('form.address.taxCode.label')}
              placeholder={t('form.address.taxCode.placeholder')}
              editable={editable}
            />
            <TextField
              control={control}
              name="businessLicenseNo"
              label={t('form.address.businessLicenseNo.label')}
              placeholder={t('form.address.businessLicenseNo.placeholder')}
              editable={editable}
            />
          </FormSection>

          {/*
            KHÔNG còn khối "tài khoản nhận tiền" ở đây: nó sống ở `bank_accounts`
            (`/shop/bank-accounts`) — nơi lệnh rút thật sự đọc. Bốn ô text cũ ghi vào chỗ không
            đồng tiền nào chạy tới.
          */}
        </YStack>
      </Screen>

      <AlertDialog
        open={confirmOpen}
        title={t('status.submitConfirm.title')}
        message={
          dirty
            ? t('status.submitConfirm.descriptionWithSave')
            : t('status.submitConfirm.description')
        }
        confirmLabel={t('status.submitConfirm.ok')}
        cancelLabel={tActions('cancel')}
        loading={submitting}
        onConfirm={confirmSubmitReview}
        onCancel={() => setConfirmOpen(false)}
      />
    </>
  );
}
