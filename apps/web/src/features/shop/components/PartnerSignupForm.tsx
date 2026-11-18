'use client';

import {
  ArrowRightOutlined,
  MailOutlined,
  PhoneOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Checkbox, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { type FormEvent, type ReactNode, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { REGISTRATION_TRACK, TENANT_TYPE, type RegistrationTrack } from '@xeprime/types';
import { partnerSignupSchema, type PartnerSignupValues } from '@xeprime/validators';
import { AddressField } from '@/components/form/AddressField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { TextField } from '@/components/form/TextField';
import { useAuthCache } from '@/features/auth/hooks/use-auth-actions';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { fetchCurrentUser, registerWithPassword, setPassword } from '@/services/auth.service';
import { queryKeys } from '@/services/query-keys';
import { presignShopMedia, uploadImage } from '@/services/upload';
import { registerShop, updateShopProfile } from '../api';
import type { MyShop } from '../types';
import { PartnerAccountFields } from './PartnerAccountFields';
import { PartnerSignupIntro } from './PartnerSignupIntro';
import { ShopLogoPicker, type PickedLogo } from './ShopLogoPicker';
import styles from './ShopRegistration.module.css';

/** `id` nút chọn logo - nút đăng ký đặt tiêu điểm vào đây khi còn thiếu logo. */
const LOGO_TRIGGER_ID = 'partner-signup-logo';

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

interface PartnerSignupFormProps {
  /** Tuyến đã chọn ở bước trước — đi lên server bằng `registrationTrack` (ADR 0040 điều 1). */
  track: RegistrationTrack;
  /** Gian hàng/hồ sơ chủ xe đã tạo — nơi gọi quyết định đi đâu tiếp. */
  onCreated: (track: RegistrationTrack) => void;
  /** Link "Đổi cách cho thuê" đặt đầu cột giới thiệu (bỏ khi đến từ site khách). */
  back?: ReactNode;
}

/**
 * ĐĂNG KÝ ĐỐI TÁC MỘT FORM — tài khoản + hồ sơ người cho thuê trong cùng một lần điền (site
 * partner `/register?track=`). Họ tên, SĐT chỉ hỏi MỘT lần và đi vào cả tài khoản lẫn
 * `POST /tenants`. Email (bắt buộc) là email LIÊN HỆ của gian hàng — chỉ đi vào `POST /tenants`,
 * KHÔNG gắn vào tài khoản (đăng nhập vẫn bằng SĐT/mật khẩu hoặc Google).
 *
 * ## Hai bước trên dây, một bước với người dùng — và thử lại an toàn
 *
 * 1. Chưa có phiên ⇒ `POST /auth/register { phone, displayName, password, code }` (realm `partner`).
 *    SĐT phải qua bước "Xác thực" TRƯỚC đó, ngay trong form (`PartnerAccountFields`: Xác thực →
 *    nhập mã, purpose `register`); nút đăng ký chỉ mở khi đã có tích xanh, và server đối chiếu lại
 *    chính mã đó trong lượt đăng ký (ADR 0060) nên gọi API thẳng cũng không lách được.
 * 2. `POST /tenants` kèm `registrationTrack`.
 *
 * Có phiên nhưng chưa có SĐT xác minh (vào bằng Google/Facebook) ⇒ cùng phần tài khoản, trừ họ
 * tên: mã OTP gắn số vào tài khoản đang đăng nhập (`/users/me/phone/*`), bước 1 thành
 * `POST /auth/password/set` nếu tài khoản chưa có mật khẩu.
 *
 * Bước 1 xong mà bước 2 hỏng: phiên ĐÃ có, nên lần render sau `withAccount = false` — phần tài
 * khoản biến mất, giá trị đã gõ còn nguyên, bấm lại chỉ chạy bước 2. Không bao giờ tạo tài khoản
 * thứ hai; một tài khoản đối tác đã có gian hàng thì server trả 409 (ADR 0053).
 *
 * ## Logo gian hàng - bắt buộc ở tuyến gói (ADR 0103)
 *
 * 3. Tuyến gói: tải logo lên (`presignShopMedia` - chỉ ký được khi gian hàng đã có) rồi
 *    `PATCH /tenants/current/profile { logoUrl }`.
 *
 * Bước 3 hỏng thì gian hàng ĐÃ có: bấm lại bỏ qua bước 2 (`createdShop`) và chỉ tải lại logo. Người
 * dùng rời trang lúc đó vẫn bị trang onboarding đòi logo trước khi chọn gói, nên không có gian hàng
 * tuyến gói nào đi tiếp mà thiếu logo. Tuyến hoa hồng KHÔNG có ô này (ADR 0040 điều 7).
 */
export function PartnerSignupForm({ track, onCreated, back }: PartnerSignupFormProps) {
  const t = useTranslations('ShopOnboarding');
  const queryClient = useQueryClient();
  const { refreshAfterAuth } = useAuthCache();
  const errorMessage = useErrorMessage();
  const { data: user } = useCurrentUser();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const [agreed, setAgreed] = useState(false);
  const [consentError, setConsentError] = useState(false);
  const [logo, setLogo] = useState<PickedLogo | null>(null);
  const [logoMissing, setLogoMissing] = useState(false);
  /** Gian hàng đã tạo ở một lượt trước mà bước logo hỏng - lượt sau không tạo lại (409). */
  const createdShop = useRef<MyShop | null>(null);

  const isPackageTrack = track === REGISTRATION_TRACK.PACKAGE;
  const needsLogo = isPackageTrack && logo == null;
  /** Chưa có phiên ⇒ form tạo luôn tài khoản. Đây là DỮ LIỆU của schema (`.when`). */
  const withAccount = !user;

  /*
   * Có phiên nhưng tài khoản CHƯA có SĐT xác minh (vào bằng Google/Facebook): form hỏi SĐT ở ô
   * "Xác thực" + mật khẩu y như luồng thường, chỉ khác là không tạo tài khoản mới mà gắn vào tài
   * khoản đang đăng nhập. CHỐT theo ID tài khoản: xác minh xong `/auth/me` làm mới thành
   * `phoneVerified = true`, và phần tài khoản không được biến mất giữa lúc người dùng đang điền.
   * (Điều chỉnh state lúc render — mẫu "lưu giá trị trước đó" của React, không cần effect.)
   */
  const [attachFor, setAttachFor] = useState<string | null>(null);
  if (user && !user.phoneVerified && attachFor !== user.id) setAttachFor(user.id);
  const attachToAccount = user != null && attachFor === user.id;
  /** Đã `POST /auth/password/set` trong lượt trước (rồi `POST /tenants` hỏng) — không đặt lại. */
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

  /** Mở lượt xác thực SĐT của `PartnerAccountFields` (gửi mã + popup) từ nút đăng ký. */
  const verifyRef = useRef<(() => void) | null>(null);

  /*
   * Phiên đến (đăng nhập sẵn nạp xong, hoặc bước 1 vừa tạo tài khoản): bỏ phần tài khoản, điền
   * sẵn những ô còn trống từ tài khoản — KHÔNG ghi đè thứ người dùng đã gõ.
   */
  useEffect(() => {
    setValue('withAccount', withAccount);
    setValue('needsPassword', needsPassword);
    if (!user) return;
    if (!getValues('name').trim()) setValue('name', user.displayName ?? '');
    if (!getValues('phone').trim() && user.phone) setValue('phone', user.phone);
    if (!getValues('email').trim() && user.email) setValue('email', user.email);
  }, [withAccount, needsPassword, user, setValue, getValues]);

  const submit = async (values: PartnerSignupValues) => {
    if (busy.current) return;
    // Tuyến gói: chưa có logo thì chưa gửi gì lên server (ADR 0103).
    if (needsLogo) {
      setLogoMissing(true);
      document.getElementById(LOGO_TRIGGER_ID)?.focus();
      return;
    }
    // Ô "Tôi đồng ý…" của bản vẽ: chưa tích thì chưa gửi gì lên server.
    if (!agreed) {
      setConsentError(true);
      return;
    }
    /*
     * Tạo tài khoản mà SĐT CHƯA xác thực: không chặn nút — mở popup nhập mã (gửi mã như nút
     * "Xác thực"). Nhập đúng mã thì `PartnerAccountFields` gọi `continueSubmit` và form tự gửi tiếp.
     */
    if ((values.withAccount || attachToAccount) && !values.phoneVerified) {
      verifyRef.current?.();
      return;
    }
    busy.current = true;
    setPending(true);
    setError(null);
    try {
      if (values.withAccount) {
        const created = await registerWithPassword({
          displayName: values.displayName.trim(),
          phone: values.phone.trim(),
          password: values.password,
          code: values.otpCode,
        });
        await refreshAfterAuth(created);
      } else if (values.needsPassword) {
        // SĐT đã gắn vào tài khoản lúc xác thực (`/users/me/phone/verify`); còn mật khẩu.
        await setPassword(values.password);
        setPasswordSet(true);
        setValue('needsPassword', false);
      }
      // Tuyến hoa hồng tạo tài khoản mới: họ tên CHÍNH LÀ tên hồ sơ chủ xe — không hỏi lại.
      const name = (values.name.trim() || values.displayName.trim()).trim();
      let shop =
        createdShop.current ??
        (await registerShop({
          name,
          registrationTrack: track,
          tenantType: TENANT_TYPE.INDIVIDUAL,
          provinceCode: values.provinceCode,
          wardCode: values.wardCode || undefined,
          addressLine: values.addressLine.trim() || undefined,
          placeId: values.placeId ?? undefined,
          latitude: values.latitude ?? undefined,
          longitude: values.longitude ?? undefined,
          locationSource: values.locationSource ?? undefined,
          phone: values.phone.trim(),
          email: values.email.trim(),
        }));
      createdShop.current = shop;
      if (logo && !shop.profile?.logoUrl) {
        try {
          const logoUrl = await uploadImage(logo.file, presignShopMedia);
          shop = await updateShopProfile({ logoUrl });
        } catch (err) {
          // Gian hàng đã có - nói đúng điều đó; bấm lại chỉ tải lại logo.
          setError(t('signup.logoUploadFailed', { error: errorMessage(err) }));
          return;
        }
      }
      /*
       * Nạp scope MỚI (đã có gian hàng) TRƯỚC khi điều hướng: trang đích (`/onboarding`, wizard đăng
       * xe) đọc `/auth/me` từ cache — scope cũ "chưa có gian hàng" sẽ đá người dùng NGƯỢC về
       * `/register?track=` rồi lại sang (bóng bàn chuyển trang). Ghi thẳng vào cache, KHÔNG
       * `invalidateQueries(auth)`: cache cập nhật đồng bộ, không mở thêm lượt hỏi nền nào.
       *
       * `onCreated` và `setQueryData` chạy trong CÙNG một nhịp (React gộp hai cập nhật) ⇒ nơi gọi
       * điều hướng theo lựa chọn này, không theo phép suy "đã có gian hàng ⇒ về trang chủ".
       */
      const fresh = await fetchCurrentUser().catch(() => null);
      onCreated(track);
      queryClient.setQueryData(queryKeys.shop.current(), shop);
      if (fresh) queryClient.setQueryData(queryKeys.auth.me(), fresh);
      else void queryClient.invalidateQueries({ queryKey: queryKeys.auth.me() });
      void queryClient.invalidateQueries({ queryKey: queryKeys.branches.all });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      busy.current = false;
      setPending(false);
    }
  };

  // `handleSubmit` gọi trong event handler: callback đọc `busy` (ref) không bị coi là đọc lúc render.
  const onSubmit = (event: FormEvent<HTMLFormElement>) => {
    // Báo thiếu logo CÙNG LÚC với lỗi của các ô khác, không đợi schema qua hết mới nói.
    if (needsLogo) setLogoMissing(true);
    void handleSubmit(submit)(event);
  };
  /** Đúng mã ở popup mở từ nút đăng ký ⇒ gửi tiếp, người dùng không phải bấm lần nữa. */
  const continueSubmit = () => void handleSubmit(submit)();

  const phoneField = (
    <TextField
      control={control}
      name="phone"
      label={t('signup.fields.phone.label')}
      type="tel"
      placeholder={t('signup.fields.phone.placeholder')}
      autoComplete="tel"
      prefix={<PhoneOutlined />}
      // Chỉ hiện khi tài khoản đã có SĐT xác minh: ô này là SĐT LIÊN HỆ gian hàng, không phải số đăng nhập.
      help={t('form.fields.phone.shopHelp')}
      required
    />
  );

  const emailField = (
    <TextField
      control={control}
      name="email"
      label={t('signup.fields.email.label')}
      type="email"
      placeholder={t('signup.fields.email.placeholder')}
      autoComplete="email"
      prefix={<MailOutlined />}
      required
    />
  );

  const contactFields = (
    <>
      {phoneField}
      {emailField}
    </>
  );

  const showProfileName = isPackageTrack || !withAccount;

  return (
    <section className={styles.card}>
      <PartnerSignupIntro track={track} back={back} />

      <Form
        component={false}
        layout="vertical"
        size="large"
        colon={false}
        requiredMark={trailingRequiredMark}
      >
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          <header className={styles.formHead}>
            <h1 className={styles.formTitle}>{t('signup.formTitle')}</h1>
            <p className={styles.formSub}>{t('signup.formSub')}</p>
          </header>

          {error ? <Alert type="error" showIcon title={error} className={styles.alert} /> : null}

          {withAccount || attachToAccount ? (
            <>
              <h3 className={styles.sectionTitle}>{t('signup.accountSection')}</h3>
              <div className={styles.grid}>
                <PartnerAccountFields
                  control={control}
                  verifyRef={verifyRef}
                  onVerified={continueSubmit}
                  attachToAccount={attachToAccount}
                  askPassword={withAccount || needsPassword}
                />
              </div>
            </>
          ) : (
            <Alert
              type="success"
              showIcon
              title={t('signup.accountReady')}
              className={styles.alert}
            />
          )}

          <h3 className={styles.sectionTitle}>{t(`signup.profileSection.${track}`)}</h3>
          <div className={styles.grid}>
            {showProfileName ? (
              // Figma `24382:85090`: "Tên gian hàng" rộng hết hàng.
              <div className={styles.fieldFull}>
                <TextField
                  control={control}
                  name="name"
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
                  prefix={isPackageTrack ? <ShopOutlined /> : <UserOutlined />}
                  required
                />
              </div>
            ) : null}
            {isPackageTrack ? (
              <ShopLogoPicker
                id={LOGO_TRIGGER_ID}
                value={logo}
                onChange={(next) => {
                  setLogo(next);
                  if (next) setLogoMissing(false);
                }}
                error={logoMissing && !logo ? t('signup.fields.logo.required') : null}
                disabled={pending}
              />
            ) : null}
            <div className={styles.addressGrid}>
              <AddressField
                control={control}
                names={ADDRESS_FIELD_NAMES}
                pin={ADDRESS_PIN_NAMES}
                required
                provinceRequired
                prefillRememberedProvince
              />
            </div>
            {withAccount || attachToAccount ? null : contactFields}
          </div>

          <div className={styles.consentRow}>
            <Checkbox
              checked={agreed}
              onChange={(event) => {
                setAgreed(event.target.checked);
                if (event.target.checked) setConsentError(false);
              }}
            >
              <LegalConsentNote place="shopCheck" as="span" className={styles.consentText} />
            </Checkbox>
            {consentError ? (
              <p className={styles.consentError} role="alert">
                {t('signup.consentRequired')}
              </p>
            ) : null}
          </div>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            icon={<ArrowRightOutlined />}
            iconPlacement="end"
            className={styles.submit}
            loading={pending}
          >
            {t(`signup.submit.${track}`)}
          </Button>
          <p className={styles.footnote}>{t('signup.footnote')}</p>
        </form>
      </Form>
    </section>
  );
}
