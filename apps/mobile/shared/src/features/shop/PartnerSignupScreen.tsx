import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useQueryClient } from '@tanstack/react-query';
import { REGISTRATION_TRACK, TENANT_TYPE, type RegistrationTrack } from '@xeprime/types';
import { partnerSignupSchema, type PartnerSignupValues } from '@xeprime/validators';
import { AddressFields } from '@/components/form/AddressFields';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Screen } from '@/components/layout/Screen';
import { BackArrow } from '@/components/ui/BackArrow';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { FieldAppearanceProvider } from '@/components/ui/Field';
import { TextField } from '@/components/ui/TextField';
import { setAccountPassword, type CurrentUser } from '@/features/auth/api';
import { useCurrentUser, useRegister } from '@/features/auth/hooks/use-auth';
import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { LegalConsentCheckbox } from '@/features/legal/components/LegalConsentCheckbox';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { uploadImageToR2, type PickedImage } from '@/lib/r2-image-upload';
import { queryKeys } from '@/queries/query-keys';
import { useColors } from '@/theme/ThemeProvider';
import { layout } from '@/theme/layout';
import { fontWeight, space, typeScale } from '@/theme/tokens';
import { tenantsApi, uploadsApi, type MyShop } from './api';
import { PartnerAccountFields } from './components/PartnerAccountFields';
import { PartnerTrackChooser } from './components/PartnerTrackChooser';
import { ShopLogoPicker } from './components/ShopLogoPicker';

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
 * ĐĂNG KÝ ĐỐI TÁC trong app XePrime Partner — bản native của web `PartnerRegisterView`:
 *
 *  1. CHỌN TUYẾN TRƯỚC ("Chủ xe" / "Gian hàng") — dùng lại màn chọn cách cho thuê.
 *  2. MỘT FORM cho tuyến đã chọn (`PartnerSignupForm`).
 *
 * Dùng cho cả người CHƯA đăng nhập (`/register`) lẫn tài khoản đối tác chưa có gian hàng
 * (`/manage/register`) — khi đã có phiên, form chỉ còn phần hồ sơ của tuyến, như web.
 */
export function PartnerSignupScreen({
  initialTrack = null,
  lockTrack = false,
  onExit,
}: {
  initialTrack?: RegistrationTrack | null;
  /**
   * Tuyến đã được chọn TRƯỚC khi vào app (mở từ app XePrime kèm `?next=`) — không mời đổi tuyến,
   * đúng web ẩn "Đổi cách cho thuê" khi tới từ site khách (`source=market`). Nút lui khi đó là `onExit`.
   */
  lockTrack?: boolean;
  /**
   * Lối lui khỏi luồng đăng ký (về Đăng nhập): mũi tên của màn chọn tuyến khi CHƯA có phiên, và của
   * form khi `lockTrack`. Vắng = không có mũi tên ở đó. Đã đăng nhập mà chưa có gian hàng thì không
   * có màn nào để lui về (người dùng chốt 20/11/2026).
   */
  onExit?: () => void;
}) {
  const { data: user } = useCurrentUser();
  const [track, setTrack] = useState<RegistrationTrack | null>(initialTrack);

  /*
   * Figma "Signup - Plan" / "Signup - Personal" không có dòng "Đã có tài khoản? Đăng nhập" hay
   * "Đăng xuất" (người dùng chốt bỏ 20/11/2026) - lối ra duy nhất là mũi tên lui.
   */
  if (!track) {
    return <PartnerTrackChooser onChoose={setTrack} {...(!user && onExit ? { onBack: onExit } : {})} />;
  }

  return (
    <PartnerSignupForm
      track={track}
      onBack={lockTrack && initialTrack ? onExit : () => setTrack(null)}
    />
  );
}

/**
 * MỘT FORM — tài khoản (họ tên, SĐT + OTP, email liên hệ, mật khẩu) + hồ sơ của tuyến, cùng schema với
 * web (`partnerSignupSchema`). Email là email LIÊN HỆ của gian hàng — chỉ đi vào `POST /tenants`,
 * không gắn vào tài khoản. Hai lời gọi trên dây (`/auth/mobile/register` sau khi SĐT đã qua bước "Xác thực",
 * rồi `POST /tenants` kèm `registrationTrack`), một bước với người dùng: bước 2 hỏng thì phiên đã
 * có, lần bấm sau chỉ chạy lại bước 2 — không bao giờ tạo tài khoản thứ hai.
 *
 * Xong: `useEnterApp` đưa vào đúng khu theo scope MỚI — hoa hồng ⇒ Tổng quan của khu quản lý
 * (không chạy wizard đăng xe, như web); gói ⇒ màn chờ kích hoạt (`PackageWaitingPanel`, app không
 * bán gói).
 */
export function PartnerSignupForm({
  track,
  onBack,
}: {
  track: RegistrationTrack;
  /** Mũi tên lui: đổi tuyến (mặc định) hoặc thoát khi tuyến bị khoá. Vắng = không có nút lui. */
  onBack?: (() => void) | undefined;
}) {
  const colors = useColors();
  const t = useTranslations('ShopOnboarding');
  const queryClient = useQueryClient();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const enterApp = useEnterApp();
  const { data: user } = useCurrentUser();
  const registerAccount = useRegister();
  const [consented, setConsented] = useState(false);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);

  const isPackageTrack = track === REGISTRATION_TRACK.PACKAGE;
  /*
   * Logo gian hàng - bắt buộc ở tuyến gói (ADR 0103, web `PartnerSignupForm`). Ảnh giữ ở máy cho tới
   * khi gian hàng có (đường ký URL ảnh gian hàng cần gian hàng), rồi `PATCH /tenants/current/profile`.
   * Bước logo hỏng thì gian hàng ĐÃ có: bấm lại bỏ qua `POST /tenants` (`createdShop`) và chỉ tải lại
   * logo. Rời màn lúc đó vẫn bị màn chờ đòi logo. Tuyến hoa hồng KHÔNG có ô này (ADR 0040 điều 7).
   */
  const [logo, setLogo] = useState<PickedImage | null>(null);
  const [logoMissing, setLogoMissing] = useState(false);
  const createdShop = useRef<MyShop | null>(null);
  const needsLogo = isPackageTrack && logo == null;
  /** Chưa có phiên ⇒ form tạo luôn tài khoản (DỮ LIỆU của schema, `.when`). */
  const withAccount = !user;

  /*
   * Có phiên nhưng CHƯA có SĐT xác minh (vào bằng Google/Facebook/Apple): hỏi SĐT + mật khẩu y như
   * luồng thường, gắn vào tài khoản đang đăng nhập. Chốt theo ID tài khoản để phần tài khoản không
   * biến mất khi `/auth/me` làm mới thành `phoneVerified = true` giữa lúc đang điền (bản web cùng mẫu).
   */
  const [attachFor, setAttachFor] = useState<string | null>(null);
  if (user && !user.phoneVerified && attachFor !== user.id) setAttachFor(user.id);
  const attachToAccount = user != null && attachFor === user.id;
  /** Đã đặt mật khẩu ở lượt trước (rồi bước tạo hồ sơ hỏng) — không đặt lại. */
  const [passwordSet, setPasswordSet] = useState(false);
  const needsPassword = attachToAccount && !user.hasPassword && !passwordSet;

  const resolver = useValidationResolver<PartnerSignupValues>(
    partnerSignupSchema,
    'ShopOnboarding.validation',
  );
  const { control, handleSubmit, setValue, getValues } = useForm<PartnerSignupValues>({
    resolver,
    defaultValues: {
      withAccount,
      needsPassword,
      registrationTrack: track,
      displayName: '',
      password: '',
      confirmPassword: '',
      name: user?.displayName ?? '',
      provinceCode: '',
      wardCode: '',
      addressLine: '',
      placeId: null,
      latitude: null,
      longitude: null,
      locationSource: null,
      phone: user?.phone ?? '',
      email: user?.email ?? '',
      otpCode: '',
      phoneVerified: false,
    },
  });

  /** Chưa tick đồng ý điều khoản thì chưa gửi được. SĐT chưa xác thực KHÔNG khoá nút — xem `submitValues`. */
  const submitBlocked = withAccount && !consented;
  /** Mở lượt xác thực SĐT (gửi mã + sheet) từ nút đăng ký. */
  const verifyRef = useRef<(() => void) | null>(null);

  // Phiên đến (sẵn có, hoặc bước 1 vừa tạo tài khoản): bỏ phần tài khoản, điền sẵn ô còn trống.
  useEffect(() => {
    setValue('withAccount', withAccount);
    setValue('needsPassword', needsPassword);
    if (!user) return;
    if (!getValues('name').trim()) setValue('name', user.displayName ?? '');
    if (!getValues('phone').trim() && user.phone) setValue('phone', user.phone);
    if (!getValues('email').trim() && user.email) setValue('email', user.email);
  }, [withAccount, needsPassword, user, setValue, getValues]);

  const submitValues = async (values: PartnerSignupValues) => {
    if (busy.current) return;
    // Tuyến gói: chưa có logo thì chưa gửi gì lên server (ADR 0103).
    if (needsLogo) {
      setLogoMissing(true);
      return;
    }
    /*
     * Tạo tài khoản mà SĐT CHƯA xác thực: mở sheet nhập mã (gửi mã như nút "Xác thực"). Đúng mã thì
     * `PartnerAccountFields` gọi `submit` và form tự gửi tiếp — người dùng chỉ bấm một lần.
     */
    if ((values.withAccount || attachToAccount) && !values.phoneVerified) {
      verifyRef.current?.();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      if (createdShop.current) {
        // Lượt trước đã tạo xong tài khoản + gian hàng, chỉ hỏng ở bước logo.
      } else if (values.withAccount) {
        await registerAccount.mutateAsync({
          displayName: values.displayName.trim(),
          phone: values.phone.trim(),
          password: values.password,
          code: values.otpCode,
        });
      } else if (values.needsPassword) {
        // SĐT đã gắn vào tài khoản lúc xác thực (`/users/me/phone/verify`); còn mật khẩu.
        await setAccountPassword(values.password);
        setPasswordSet(true);
        setValue('needsPassword', false);
      }
      // Tuyến hoa hồng tạo tài khoản mới: họ tên CHÍNH LÀ tên hồ sơ chủ xe — không hỏi lại.
      const name = values.name.trim() || values.displayName.trim() || user?.displayName || '';
      let shop =
        createdShop.current ??
        (await tenantsApi.register({
        name,
        registrationTrack: track,
        tenantType: TENANT_TYPE.INDIVIDUAL,
        provinceCode: values.provinceCode,
        ...(values.wardCode ? { wardCode: values.wardCode } : {}),
        ...(values.addressLine.trim() ? { addressLine: values.addressLine.trim() } : {}),
        ...(values.placeId ? { placeId: values.placeId } : {}),
        ...(values.latitude != null && values.longitude != null
          ? { latitude: values.latitude, longitude: values.longitude }
          : {}),
        ...(values.locationSource ? { locationSource: values.locationSource } : {}),
        phone: values.phone.trim(),
        email: values.email.trim(),
      }));
      createdShop.current = shop;
      if (logo && !shop.profile?.logoUrl) {
        try {
          const logoUrl = await uploadImageToR2(logo, uploadsApi.shopMedia);
          shop = await tenantsApi.updateProfile({ logoUrl });
        } catch (error) {
          // Gian hàng đã có - nói đúng điều đó; bấm lại chỉ tải lại logo. Vẫn nạp hồ sơ + phiên mới:
          // rời màn rồi quay lại thì màn chờ đòi logo (`ShopLogoRequiredCard`), không gọi
          // `POST /tenants` lần hai (một tài khoản một gian hàng).
          toast.showError(t('signup.logoUploadFailed', { error: errorMessage(error) }));
          queryClient.setQueryData(queryKeys.shop.current(), shop);
          void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
          return;
        }
      }
      queryClient.setQueryData(queryKeys.shop.current(), shop);
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
      // Scope MỚI (đã có gian hàng) trước khi vào app — scope cũ sẽ đưa ngược về màn đăng ký.
      await queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
      enterApp(queryClient.getQueryData<CurrentUser>(queryKeys.auth.me()));
    } catch (error) {
      toast.showError(errorMessage(error));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  // `handleSubmit` gọi lúc bấm: callback đọc `busy` (ref) không bị coi là đọc lúc render.
  const submit = () => {
    // Báo thiếu logo CÙNG LÚC với lỗi của các ô khác (web `onSubmit`).
    if (needsLogo) setLogoMissing(true);
    void handleSubmit(submitValues)();
  };

  const contactFields = (
    <>
      <TextField
        control={control}
        name="phone"
        required
        label={t('signup.fields.phone.label')}
        placeholder={t('signup.partnerApp.phonePlaceholder')}
        icon="call-outline"
        keyboardType="phone-pad"
        autoComplete="tel"
        // Số LIÊN HỆ gian hàng, không phải số đăng nhập (web `form.fields.phone.shopHelp`).
        hint={t('form.fields.phone.shopHelp')}
      />
      <TextField
        control={control}
        name="email"
        required
        label={t('signup.fields.email.label')}
        placeholder={t('signup.partnerApp.emailPlaceholder')}
        icon="mail-outline"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
    </>
  );

  /** Chữ ô địa chỉ theo nguyên văn Figma (khoá riêng của app, web giữ `Address.*`). */
  const addressLabels = useMemo(
    () => ({
      province: t('signup.partnerApp.provinceLabel'),
      ward: t('signup.partnerApp.wardLabel'),
      wardPlaceholder: t('signup.partnerApp.wardPlaceholder'),
      addressLine: t('signup.partnerApp.addressLineLabel'),
      addressLinePlaceholder: t('signup.partnerApp.addressLinePlaceholder'),
    }),
    [t],
  );

  /** Tiêu đề khối 18/28 (Figma "Vehicle Specifications Header"). */
  const sectionTitle = (text: string) => (
    <Text
      col={colors.text}
      fos={typeScale.heading.fontSize}
      lh={typeScale.heading.lineHeight}
      fow={fontWeight.semibold}
      accessibilityRole="header"
    >
      {text}
    </Text>
  );

  /*
    Figma Partner-XePrime "Signup - Personal" (`24464:24953`): mũi tên lui 24 · "Tạo tài khoản đối
    tác" 20/30 + lời dẫn 14/20 · hai khối phẳng trên nền trang ("Thông tin tài khoản", "Khu vực cho
    thuê"/"Thông tin gian hàng") tiêu đề 18/28, khe ô 12, khe khối 24 · ô đồng ý · nút gradient cao 44
    có mũi tên sau chữ · chú thích 14/20 căn giữa. Bộ ô `v2` cho mọi ô bên trong (kể cả địa chỉ, SĐT).
    Mũi tên lui riêng một hàng + tiêu đề trong nội dung như bản vẽ (người dùng chốt 20/11/2026, thay
    thanh trên của 19/11); không có dòng "Đã có tài khoản? Đăng nhập".

    Nút "Đăng ký & …" là hành động DUY NHẤT của màn ⇒ DÍNH ĐÁY (`Screen footer`, người dùng chốt
    20/11/2026); chú thích "Sau khi đăng ký…" ở cuối nội dung. Ẩn thanh đáy khi bàn phím mở để ô
    đang gõ không bị che.
  */
  return (
    <Screen
      padded={false}
      hideFooterWhileTyping
      footer={
        <Button
          label={isPackageTrack ? t('signup.submit.packageApp') : t(`signup.submit.${track}`)}
          variant="gradient"
          size="lg"
          icon="arrow-forward"
          iconEnd
          onPress={submit}
          loading={pending}
          disabled={submitBlocked}
        />
      }
    >
      <FieldAppearanceProvider value="v2">
        <YStack gap={space.xl} px={layout.padXLg} py={space.lg}>
          {onBack ? <BackArrow onPress={onBack} /> : null}
          <YStack gap={2}>
            <Text
              col={colors.text}
              fos={FORM_TITLE.fontSize}
              lh={FORM_TITLE.lineHeight}
              fow={fontWeight.bold}
              accessibilityRole="header"
            >
              {t('signup.formTitle')}
            </Text>
            <Text col={colors.placeholder} fos={typeScale.body.fontSize} lh={typeScale.body.lineHeight}>
              {t('signup.formSub')}
            </Text>
          </YStack>

          {withAccount || attachToAccount ? (
            <YStack gap={space.md}>
              {sectionTitle(t('signup.accountSection'))}
              <PartnerAccountFields
                control={control}
                verifyRef={verifyRef}
                onVerified={submit}
                attachToAccount={attachToAccount}
                askPassword={withAccount || needsPassword}
              />
            </YStack>
          ) : (
            <Callout tone="success">{t('signup.accountReady')}</Callout>
          )}

          <YStack gap={space.md}>
            {sectionTitle(t(`signup.profileSection.${track}`))}
            {isPackageTrack || !withAccount ? (
              <TextField
                control={control}
                name="name"
                required
                label={
                  isPackageTrack ? t('form.fields.name.label') : t('signup.fields.ownerName.label')
                }
                placeholder={
                  isPackageTrack
                    ? t('form.fields.name.placeholder')
                    : t('signup.fields.ownerName.placeholder')
                }
                icon={isPackageTrack ? 'storefront-outline' : 'person-outline'}
              />
            ) : null}
            {isPackageTrack ? (
              <ShopLogoPicker
                value={logo}
                onChange={(next) => {
                  setLogo(next);
                  if (next) setLogoMissing(false);
                }}
                error={logoMissing && !logo ? t('signup.fields.logo.required') : null}
                disabled={pending}
              />
            ) : null}
            <AddressFields
              control={control}
              names={ADDRESS_FIELD_NAMES}
              pin={ADDRESS_PIN_NAMES}
              required
              provinceRequired
              prefillRememberedProvince
              labels={addressLabels}
            />
            {withAccount || attachToAccount ? null : contactFields}
          </YStack>

          {withAccount ? (
            <LegalConsentCheckbox
              size="md"
              // Câu của đối tác như web `PartnerSignupForm` (`consent.shopCheck`) + Figma `24464:25550`.
              statement="shop"
              checked={consented}
              onToggle={() => setConsented((agreed) => !agreed)}
            />
          ) : (
            <LegalConsentNote place="shop" />
          )}

          <Text
            col={colors.textPlaceholder}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            ta="center"
          >
            {t('signup.footnote')}
          </Text>
        </YStack>
      </FieldAppearanceProvider>
    </Screen>
  );
}

/** Figma `20px/Bold` - tiêu đề "Tạo tài khoản đối tác" (`24464:25296`). */
const FORM_TITLE = { fontSize: 20, lineHeight: 30 } as const;

