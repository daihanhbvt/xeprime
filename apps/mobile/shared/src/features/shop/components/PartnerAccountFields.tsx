import type { RefObject } from 'react';
import type { Control, FieldValues, Path } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { TextField } from '@/components/ui/TextField';
import { VerifiedPhoneField } from '@/features/phone-verification/components/VerifiedPhoneField';

/** Các ô tài khoản đối tác mà form chứa nó phải có (như web `PartnerAccountFieldValues`). */
export interface PartnerAccountFieldValues extends FieldValues {
  displayName: string;
  phone: string;
  otpCode: string;
  phoneVerified: boolean;
  email: string;
  password: string;
  confirmPassword: string;
}

/**
 * PHẦN TÀI KHOẢN ĐỐI TÁC — họ tên · email liên hệ · SĐT (xác thực) · mật khẩu + nhập lại. Bản
 * native của web `PartnerAccountFields`, cùng luồng XÁC THỰC TRƯỚC, ĐĂNG KÝ SAU: ô SĐT là
 * `VerifiedPhoneField` (mã `register`). Chưa xác thực mà bấm đăng ký thì sheet nhập mã mở ra, đúng
 * mã là form tự gửi tiếp; server đối chiếu lại chính mã đó trong lượt đăng ký (ADR 0060).
 */
export function PartnerAccountFields<T extends PartnerAccountFieldValues>({
  control,
  verifyRef,
  onVerified,
}: {
  control: Control<T>;
  /** Nút đăng ký mở lượt xác thực SĐT khi chưa xác thực — xem `VerifiedPhoneField`. */
  verifyRef?: RefObject<(() => void) | null>;
  onVerified?: () => void;
}) {
  const name = (key: keyof PartnerAccountFieldValues & string) => key as Path<T>;
  const t = useTranslations('ShopOnboarding');

  return (
    <>
      <TextField
        control={control}
        name={name('displayName')}
        required
        label={t('signup.fields.displayName.label')}
        placeholder={t('signup.fields.displayName.placeholder')}
        icon="person-outline"
        autoComplete="name"
      />
      <TextField
        control={control}
        name={name('email')}
        required
        label={t('signup.fields.email.label')}
        placeholder={t('signup.fields.email.placeholder')}
        icon="mail-outline"
        keyboardType="email-address"
        autoCapitalize="none"
        autoComplete="email"
      />
      <VerifiedPhoneField
        control={control as unknown as Control<FieldValues>}
        phoneName="phone"
        codeName="otpCode"
        verifiedName="phoneVerified"
        purpose={PHONE_VERIFICATION_PURPOSE.REGISTER}
        label={t('signup.fields.phone.label')}
        placeholder={t('signup.fields.phone.placeholder')}
        hint={t('signup.fields.phone.help')}
        verifyRef={verifyRef}
        onVerified={onVerified}
      />
      <TextField
        control={control}
        name={name('password')}
        required
        label={t('signup.fields.password.label')}
        placeholder={t('signup.fields.password.placeholder')}
        icon="lock-closed-outline"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
      />
      <TextField
        control={control}
        name={name('confirmPassword')}
        required
        label={t('signup.fields.confirmPassword.label')}
        placeholder={t('signup.fields.confirmPassword.placeholder')}
        icon="lock-closed-outline"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
      />
    </>
  );
}
