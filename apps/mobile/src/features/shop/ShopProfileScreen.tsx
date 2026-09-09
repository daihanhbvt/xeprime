import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  TENANT_STATUS,
  TENANT_STATUS_SUBMITTABLE,
  toLocalVnPhone,
  type TenantStatus,
} from '@xeprime/types';
import { shopProfileSchema, type ShopProfileValues } from '@xeprime/validators';
import { Screen } from '@/components/layout/Screen';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { FormSection } from '@/components/ui/FormSection';
import { InlineAction } from '@/components/ui/InlineAction';
import { SelectField } from '@/components/ui/SelectField';
import { ShopProfileSkeleton } from '@/components/ui/Skeleton';
import { TextField } from '@/components/ui/TextField';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useTenantScope } from '@/features/auth/hooks/use-tenant-scope';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useNavigateOnce } from '@/hooks/use-navigate-once';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { colors, fontSize, space } from '@/theme/tokens';
import type { MyShop, UpdateShopProfileInput } from './api';
import { ShopIdentityCard } from './components/ShopIdentityCard';
import { ShopProfileChecklist } from './components/ShopProfileChecklist';
import { ShopStatusBanner } from './components/ShopStatusBanner';
import { useMyShop, useSubmitShopReview, useUpdateShopProfile } from './hooks/use-shop';

/** Giá trị form → thân request. Dùng cho CẢ hai đường ra: lưu, và lưu-rồi-gửi-duyệt. */
function toBody(v: ShopProfileValues): UpdateShopProfileInput {
  return {
    displayName: v.displayName,
    bio: v.bio,
    address: v.address,
    // Chỉ gửi MÃ tỉnh — tên do server tra ra, và nó chuyển tiếp cho chi nhánh mặc định.
    provinceCode: v.provinceCode,
    taxCode: v.taxCode,
    businessLicenseNo: v.businessLicenseNo,
    bankName: v.bankName,
    bankAccountNo: v.bankAccountNo,
    bankAccountName: v.bankAccountName,
    logoUrl: v.logoUrl ?? '',
    coverUrl: v.coverUrl ?? '',
    ownerFullName: v.ownerFullName,
    ownerPhone: v.ownerPhone,
    ownerEmail: v.ownerEmail,
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
    address: p.address ?? '',
    provinceCode: shop.defaultBranch?.provinceCode ?? p.provinceCode ?? '',
    taxCode: p.taxCode ?? '',
    businessLicenseNo: p.businessLicenseNo ?? '',
    bankName: p.bankName ?? '',
    bankAccountNo: p.bankAccountNo ?? '',
    bankAccountName: p.bankAccountName ?? '',
    logoUrl: p.logoUrl ?? null,
    coverUrl: p.coverUrl ?? null,
    ownerFullName: p.ownerFullName ?? '',
    ownerPhone: p.ownerPhone ? toLocalVnPhone(p.ownerPhone) : '',
    ownerEmail: p.ownerEmail ?? '',
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
export function ShopProfileScreen() {
  const t = useTranslations('Shop');
  const permissions = usePermissions();
  const { tenant } = useTenantScope();

  const canView = permissions.has(PERMISSION.TENANT_VIEW);
  const canEdit = permissions.has(PERMISSION.TENANT_UPDATE);
  const canSubmit = permissions.has(PERMISSION.TENANT_SUBMIT_REVIEW);

  const query = useMyShop(canView && Boolean(tenant));

  if (!permissions.isLoading && !canView) {
    return (
      <>
        <ManageHeader />
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
    return <NoTenantState />;
  }

  if (query.isError && !query.data) {
    return (
      <>
        <ManageHeader />
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
        <ManageHeader />
        {/* `padded={false}`: khung chờ vẽ luôn ảnh bìa TRÀN VIỀN như bản thật. */}
        <Screen edges={['left', 'right', 'bottom']} padded={false}>
          <ShopProfileSkeleton />
        </Screen>
      </>
    );
  }

  return <ProfileForm shop={query.data} canEdit={canEdit} canSubmit={canSubmit} />;
}

function NoTenantState() {
  const t = useTranslations('Shop.noTenant');
  const navigateOnce = useNavigateOnce();

  return (
    <>
      <ManageHeader />
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
  shop,
  canEdit,
  canSubmit,
}: {
  shop: MyShop;
  canEdit: boolean;
  canSubmit: boolean;
}) {
  const t = useTranslations('Shop');
  const tActions = useTranslations('Common.actions');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const provinces = useProvinceOptions();
  const navigateOnce = useNavigateOnce();

  const updateProfile = useUpdateShopProfile();
  const submitReview = useSubmitShopReview();
  const [confirmOpen, setConfirmOpen] = useState(false);

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
   * Backend cũng từ chối ghi khi đang chờ duyệt (`INVALID_STATUS_TRANSITION`). Khoá ở đây để
   * người dùng biết TRƯỚC khi gõ, chứ không phải sau khi bấm Lưu.
   */
  const pendingReview = status === TENANT_STATUS.PENDING_REVIEW;
  const readOnly = pendingReview || !canEdit;
  const readOnlyReason = pendingReview
    ? t('form.lockedWhilePending')
    : canEdit
      ? null
      : t('form.readOnly');

  const dirty = formState.isDirty && !readOnly;
  /** Hồ sơ ở chặng "chưa gửi / bị trả về" — chỉ khi đó checklist và nút Gửi duyệt mới có nghĩa. */
  const submittable = TENANT_STATUS_SUBMITTABLE.includes(status);
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
      <ManageHeader />
      <Screen
        edges={['left', 'right', 'bottom']}
        padded={false}
        /*
          Hành động Lưu neo ở ĐÁY MÀN, và chỉ mọc ra khi form thật sự có thay đổi.

          Biểu mẫu này dài bốn khối: một nút nằm cuối trang nghĩa là sửa một ô ở khối đầu rồi
          phải cuộn qua toàn bộ phần còn lại mới lưu được. Thanh đáy cũng thay luôn nhãn "Chưa
          lưu" trước đây — chính sự xuất hiện của nó đã là câu đó, nói thêm một lần nữa thì cả
          hai cùng mờ đi.
        */
        footer={
          !readOnly && dirty ? (
            <XStack gap={space.sm}>
              <YStack f={1}>
                <Button
                  label={t('form.reset')}
                  variant="secondary"
                  disabled={saving}
                  onPress={() => reset()}
                />
              </YStack>
              <YStack f={2}>
                <Button
                  label={t('form.submit')}
                  icon="save-outline"
                  loading={saving}
                  onPress={() => void save()}
                />
              </YStack>
            </XStack>
          ) : null
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
          {...(status === TENANT_STATUS.ACTIVE
            ? { onViewPublicPage: () => navigateOnce(ROUTES.explore.shopDetail(shop.slug)) }
            : {})}
        />

        <YStack px={layout.screenX} pt={layout.section} gap={layout.section} pb={layout.section}>
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
          {submittable ? <ShopProfileChecklist control={control} /> : null}

          {readOnlyReason ? <Callout tone="info">{readOnlyReason}</Callout> : null}

          {provinces.isError ? (
            <Callout tone="warning" title={t('form.address.province.loadError')}>
              <YStack gap={space.sm}>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {errorMessage(provinces.error)}
                </Text>
                <Button label={tActions('retry')} variant="secondary" onPress={provinces.refetch} />
              </YStack>
            </Callout>
          ) : null}

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

          {/* Khối NỘI BỘ — chỉ đội ngũ XePrime đọc, khách không thấy. */}
          <FormSection title={t('form.owner.title')} icon="person-outline">
            <TextField
              control={control}
              name="ownerFullName"
              label={t('form.owner.fullName.label')}
              placeholder={t('form.owner.fullName.placeholder')}
              required
              autoComplete="name"
              editable={editable}
            />
            <TextField
              control={control}
              name="ownerPhone"
              label={t('form.owner.phone.label')}
              placeholder={t('form.owner.phone.placeholder')}
              required
              keyboardType="phone-pad"
              autoComplete="tel"
              editable={editable}
            />
            <TextField
              control={control}
              name="ownerEmail"
              label={t('form.owner.email.label')}
              placeholder={t('form.owner.email.placeholder')}
              keyboardType="email-address"
              autoCapitalize="none"
              autoComplete="email"
              editable={editable}
            />
            <Callout tone="info" title={t('form.owner.privacy.title')}>
              {t('form.owner.privacy.body')}
            </Callout>
          </FormSection>

          <FormSection title={t('form.address.title')} icon="location-outline">
            <TextField
              control={control}
              name="address"
              label={t('form.address.address.label')}
              placeholder={t('form.address.address.placeholder')}
              editable={editable}
            />
            {/*
              Tỉnh/thành ở đây là tỉnh của CHI NHÁNH MẶC ĐỊNH: đổi nó là backend dời chi nhánh đó
              và đồng bộ lại vị trí công khai của mọi xe thuộc nó. Không có nguồn tỉnh thứ hai
              nào ở client.
            */}
            <SelectField
              control={control}
              name="provinceCode"
              label={t('form.address.province.label')}
              options={provinces.options}
              required
              /*
               * Ô chọn ĐANG chờ tải, đang lỗi, hay rỗng thì đều là điều khiển CHẾT — cho phép mở
               * ra không có gì để chọn hay chọn nhầm ngay lúc bàn giao dữ liệu. Cả ba nhánh này
               * VÀ chế độ chỉ-xem (`!editable`) chung một chỗ chặn, không tách ra `editable={}`
               * mà `SelectField` không có.
               */
              disabled={
                !editable ||
                provinces.isLoading ||
                provinces.isError ||
                provinces.options.length === 0
              }
              placeholder={
                provinces.isLoading
                  ? t('form.address.province.loading')
                  : t('form.address.province.placeholder')
              }
              hint={t('form.address.province.help')}
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

          <FormSection title={t('form.bank.title')} icon="card-outline">
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('form.bank.hint')}
            </Text>
            <TextField
              control={control}
              name="bankName"
              label={t('form.bank.bankName.label')}
              placeholder={t('form.bank.bankName.placeholder')}
              editable={editable}
            />
            <TextField
              control={control}
              name="bankAccountNo"
              label={t('form.bank.accountNo.label')}
              placeholder={t('form.bank.accountNo.placeholder')}
              editable={editable}
            />
            <TextField
              control={control}
              name="bankAccountName"
              label={t('form.bank.accountName.label')}
              placeholder={t('form.bank.accountName.placeholder')}
              editable={editable}
            />
          </FormSection>
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
