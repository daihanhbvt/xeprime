import { useEffect, useRef, useState, type ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useQueryClient } from '@tanstack/react-query';
import { REGISTRATION_TRACK, TENANT_TYPE, type RegistrationTrack } from '@xeprime/types';
import { partnerSignupSchema, type PartnerSignupValues } from '@xeprime/validators';
import { AddressFields } from '@/components/form/AddressFields';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import type { CurrentUser } from '@/features/auth/api';
import { AuthSwitchLink } from '@/features/auth/components/AuthSwitchLink';
import { useCurrentUser, useRegister } from '@/features/auth/hooks/use-auth';
import { useEnterApp } from '@/features/auth/hooks/use-enter-app';
import { LegalConsentCheckbox } from '@/features/legal/components/LegalConsentCheckbox';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { ListYourVehicleScreen } from '@/features/list-vehicle/ListYourVehicleScreen';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { queryKeys } from '@/queries/query-keys';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import { tenantsApi } from './api';
import { PartnerAccountFields } from './components/PartnerAccountFields';

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
  onSwitchToLogin,
  footer,
}: {
  initialTrack?: RegistrationTrack | null;
  /** Có ⇒ hiện "Đã có tài khoản? Đăng nhập" (chỉ khi chưa có phiên). */
  onSwitchToLogin?: () => void;
  /** Đuôi riêng của màn chọn tuyến (vd. Đăng xuất cho người đã đăng nhập). */
  footer?: ReactNode;
}) {
  const t = useTranslations('ShopOnboarding');
  const { data: user } = useCurrentUser();
  const [track, setTrack] = useState<RegistrationTrack | null>(initialTrack);

  const loginHint =
    !user && onSwitchToLogin ? (
      <AuthSwitchLink
        prompt={t('signup.hasAccount')}
        actionLabel={t('signup.login')}
        onPress={onSwitchToLogin}
      />
    ) : null;

  if (!track) {
    return (
      <ListYourVehicleScreen
        showBack={false}
        onChoose={setTrack}
        footer={
          <>
            {loginHint}
            {footer}
          </>
        }
      />
    );
  }

  return (
    <PartnerSignupForm track={track} onChangeTrack={() => setTrack(null)} loginHint={loginHint} />
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
  onChangeTrack,
  loginHint,
}: {
  track: RegistrationTrack;
  onChangeTrack: () => void;
  loginHint?: ReactNode;
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
  /** Chưa có phiên ⇒ form tạo luôn tài khoản (DỮ LIỆU của schema, `.when`). */
  const withAccount = !user;

  const resolver = useValidationResolver<PartnerSignupValues>(
    partnerSignupSchema,
    'ShopOnboarding.validation',
  );
  const { control, handleSubmit, setValue, getValues } = useForm<PartnerSignupValues>({
    resolver,
    defaultValues: {
      withAccount,
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
    if (!user) return;
    if (!getValues('name').trim()) setValue('name', user.displayName ?? '');
    if (!getValues('phone').trim() && user.phone) setValue('phone', user.phone);
    if (!getValues('email').trim() && user.email) setValue('email', user.email);
  }, [withAccount, user, setValue, getValues]);

  const submitValues = async (values: PartnerSignupValues) => {
    if (busy.current) return;
    /*
     * Tạo tài khoản mà SĐT CHƯA xác thực: mở sheet nhập mã (gửi mã như nút "Xác thực"). Đúng mã thì
     * `PartnerAccountFields` gọi `submit` và form tự gửi tiếp — người dùng chỉ bấm một lần.
     */
    if (values.withAccount && !values.phoneVerified) {
      verifyRef.current?.();
      return;
    }
    busy.current = true;
    setPending(true);
    try {
      if (values.withAccount) {
        await registerAccount.mutateAsync({
          displayName: values.displayName.trim(),
          phone: values.phone.trim(),
          password: values.password,
          code: values.otpCode,
        });
      }
      // Tuyến hoa hồng tạo tài khoản mới: họ tên CHÍNH LÀ tên hồ sơ chủ xe — không hỏi lại.
      const name = values.name.trim() || values.displayName.trim() || user?.displayName || '';
      const shop = await tenantsApi.register({
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
      });
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
  const submit = () => void handleSubmit(submitValues)();

  const contactFields = (
    <>
      <TextField
        control={control}
        name="phone"
        required
        label={t('signup.fields.phone.label')}
        placeholder={t('signup.fields.phone.placeholder')}
        icon="call-outline"
        keyboardType="phone-pad"
        autoComplete="tel"
      />
      <TextField
        control={control}
        name="email"
        required
        label={t('signup.fields.email.label')}
        placeholder={t('signup.fields.email.placeholder')}
        icon="mail-outline"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
    </>
  );

  return (
    <>
      <AppHeader onBack={onChangeTrack} />
      <Screen
        edges={['left', 'right', 'bottom']}
        footer={
          <YStack gap={space.xs}>
            <Button
              label={t(`signup.submit.${track}`)}
              icon={isPackageTrack ? 'storefront-outline' : 'person-add-outline'}
              onPress={submit}
              loading={pending}
              disabled={submitBlocked}
            />
            {loginHint}
          </YStack>
        }
      >
        <YStack gap={space.lg} pb={space.md}>
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.h2} fow={fontWeight.bold}>
              {t(`signup.title.${track}`)}
            </Text>
            <Text col={colors.textMuted} fos={fontSize.body}>
              {t(`signup.subtitle.${track}`)}
            </Text>
          </YStack>

          {withAccount ? (
            <Card>
              <YStack gap={space.md}>
                <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                  {t('signup.accountSection')}
                </Text>
                <PartnerAccountFields control={control} verifyRef={verifyRef} onVerified={submit} />
              </YStack>
            </Card>
          ) : (
            <Callout tone="success">{t('signup.accountReady')}</Callout>
          )}

          <Card>
            <YStack gap={space.md}>
              <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
                {t(`signup.profileSection.${track}`)}
              </Text>
              {isPackageTrack || !withAccount ? (
                <TextField
                  control={control}
                  name="name"
                  required
                  label={
                    isPackageTrack
                      ? t('form.fields.name.label')
                      : t('signup.fields.ownerName.label')
                  }
                  placeholder={
                    isPackageTrack
                      ? t('form.fields.name.placeholder')
                      : t('signup.fields.ownerName.placeholder')
                  }
                  icon={isPackageTrack ? 'storefront-outline' : 'person-outline'}
                />
              ) : null}
              <AddressFields
                control={control}
                names={ADDRESS_FIELD_NAMES}
                pin={ADDRESS_PIN_NAMES}
                required
                provinceRequired
                prefillRememberedProvince
              />
              {withAccount ? null : contactFields}
            </YStack>
          </Card>

          {withAccount ? (
            <LegalConsentCheckbox
              checked={consented}
              onToggle={() => setConsented((agreed) => !agreed)}
            />
          ) : (
            <LegalConsentNote place="shop" />
          )}
        </YStack>
      </Screen>
    </>
  );
}
