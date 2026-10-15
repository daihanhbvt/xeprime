'use client';

import {
  CheckOutlined,
  InfoCircleOutlined,
  MailOutlined,
  PhoneOutlined,
  SafetyOutlined,
  ShopOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { type FormEvent, useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  REGISTRATION_TRACK,
  TENANT_TYPE,
  type RegistrationTrack,
} from '@xeprime/types';
import { partnerSignupSchema, type PartnerSignupValues } from '@xeprime/validators';
import { AddressField } from '@/components/form/AddressField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { TextField } from '@/components/form/TextField';
import { useAuthCache } from '@/features/auth/hooks/use-auth-actions';
import { LegalConsentNote } from '@/features/legal/components/LegalConsentNote';
import { useCurrentUser } from '@/hooks/use-current-user';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { fetchCurrentUser, registerWithPassword } from '@/services/auth.service';
import { queryKeys } from '@/services/query-keys';
import { registerShop } from '../api';
import { PartnerAccountFields } from './PartnerAccountFields';
import styles from './ShopRegistration.module.css';

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
 * Bước 1 xong mà bước 2 hỏng: phiên ĐÃ có, nên lần render sau `withAccount = false` — phần tài
 * khoản biến mất, giá trị đã gõ còn nguyên, bấm lại chỉ chạy bước 2. Không bao giờ tạo tài khoản
 * thứ hai; một tài khoản đối tác đã có gian hàng thì server trả 409 (ADR 0053).
 */
export function PartnerSignupForm({ track, onCreated }: PartnerSignupFormProps) {
  const t = useTranslations('ShopOnboarding');
  const queryClient = useQueryClient();
  const { refreshAfterAuth } = useAuthCache();
  const errorMessage = useErrorMessage();
  const { data: user } = useCurrentUser();
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);

  const isPackageTrack = track === REGISTRATION_TRACK.PACKAGE;
  /** Chưa có phiên ⇒ form tạo luôn tài khoản. Đây là DỮ LIỆU của schema (`.when`). */
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

  /** Mở lượt xác thực SĐT của `PartnerAccountFields` (gửi mã + popup) từ nút đăng ký. */
  const verifyRef = useRef<(() => void) | null>(null);

  /*
   * Phiên đến (đăng nhập sẵn nạp xong, hoặc bước 1 vừa tạo tài khoản): bỏ phần tài khoản, điền
   * sẵn những ô còn trống từ tài khoản — KHÔNG ghi đè thứ người dùng đã gõ.
   */
  useEffect(() => {
    setValue('withAccount', withAccount);
    if (!user) return;
    if (!getValues('name').trim()) setValue('name', user.displayName ?? '');
    if (!getValues('phone').trim() && user.phone) setValue('phone', user.phone);
    if (!getValues('email').trim() && user.email) setValue('email', user.email);
  }, [withAccount, user, setValue, getValues]);

  const submit = async (values: PartnerSignupValues) => {
    if (busy.current) return;
    /*
     * Tạo tài khoản mà SĐT CHƯA xác thực: không chặn nút — mở popup nhập mã (gửi mã như nút
     * "Xác thực"). Nhập đúng mã thì `PartnerAccountFields` gọi `continueSubmit` và form tự gửi tiếp.
     */
    if (values.withAccount && !values.phoneVerified) {
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
      }
      // Tuyến hoa hồng tạo tài khoản mới: họ tên CHÍNH LÀ tên hồ sơ chủ xe — không hỏi lại.
      const name = (values.name.trim() || values.displayName.trim()).trim();
      const shop = await registerShop({
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
      });
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
  const onSubmit = (event: FormEvent<HTMLFormElement>) => void handleSubmit(submit)(event);
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
      help={t('signup.fields.phone.help')}
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
      <aside className={styles.intro}>
        <span className={styles.introIcon} aria-hidden="true">
          <ShopOutlined />
        </span>
        <h2 className={styles.introTitle}>{t(`signup.title.${track}`)}</h2>
        <p className={styles.introText}>{t(`signup.subtitle.${track}`)}</p>
        <div className={styles.tips}>
          <p className={styles.tipsTitle}>
            <InfoCircleOutlined aria-hidden="true" />
            {t('tips.title')}
          </p>
          <ul className={styles.tipsList}>
            <li>
              <CheckOutlined aria-hidden="true" />
              <span>{t('tips.accuracy')}</span>
            </li>
            <li>
              <CheckOutlined aria-hidden="true" />
              <span>{t('tips.editable')}</span>
            </li>
          </ul>
        </div>
      </aside>

      <Form
        component={false}
        layout="vertical"
        size="large"
        colon={false}
        requiredMark={trailingRequiredMark}
      >
        <form className={styles.form} onSubmit={onSubmit} noValidate>
          {error ? <Alert type="error" showIcon title={error} className={styles.alert} /> : null}

          {withAccount ? (
            <>
              <h3 className={styles.sectionTitle}>{t('signup.accountSection')}</h3>
              <div className={styles.grid}>
                <PartnerAccountFields
                  control={control}
                  verifyRef={verifyRef}
                  onVerified={continueSubmit}
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
              <TextField
                control={control}
                name="name"
                label={
                  isPackageTrack ? t('form.fields.name.label') : t('signup.fields.ownerName.label')
                }
                placeholder={
                  isPackageTrack
                    ? t('form.fields.name.placeholder')
                    : t('signup.fields.ownerName.placeholder')
                }
                prefix={isPackageTrack ? <ShopOutlined /> : <UserOutlined />}
                required
              />
            ) : null}
            <AddressField
              control={control}
              names={ADDRESS_FIELD_NAMES}
              pin={ADDRESS_PIN_NAMES}
              required
              provinceRequired
              prefillRememberedProvince
            />
            {withAccount ? null : contactFields}
          </div>

          <p className={styles.privacy}>
            <SafetyOutlined className={styles.privacyIcon} aria-hidden="true" />
            <strong className={styles.privacyTitle}>{t('privacy.title')}</strong>
            <span>{t('privacy.body')}</span>
          </p>

          <Button
            type="primary"
            htmlType="submit"
            block
            size="large"
            icon={<ShopOutlined />}
            className={styles.submit}
            loading={pending}
          >
            {t(`signup.submit.${track}`)}
          </Button>

          <LegalConsentNote place="shop" className={styles.consent} />
        </form>
      </Form>
    </section>
  );
}
