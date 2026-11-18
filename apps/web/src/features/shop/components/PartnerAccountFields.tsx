'use client';

import {
  CheckCircleFilled,
  LockOutlined,
  MailOutlined,
  PhoneOutlined,
  UserOutlined,
} from '@ant-design/icons';
import { Alert, Button, Form, Input } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState, type RefObject } from 'react';
import { useController, useWatch, type Control, type FieldValues, type Path } from 'react-hook-form';
import { PHONE_VERIFICATION_PURPOSE, sanitizePhoneInput, VN_MOBILE_PHONE_PATTERN } from '@xeprime/types';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { OtpCodeInput } from '@/features/phone-verification/components/OtpCodeInput';
import { formatOtpCooldown } from '@/features/phone-verification/format-cooldown';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { useContactVerify } from '@/features/account/hooks/use-contact-verify';
import { CONTACT_CHANNEL } from '@/features/account/types';
import { useErrorMessage } from '@/i18n/use-error-message';
import styles from './ShopRegistration.module.css';

/** Các ô tài khoản đối tác mà form gọi phải có (cùng tên với `partnerSignupSchema`). */
export interface PartnerAccountFieldValues extends FieldValues {
  displayName: string;
  phone: string;
  otpCode: string;
  phoneVerified: boolean;
  email: string;
  password: string;
  confirmPassword: string;
}

interface PartnerAccountFieldsProps<T extends PartnerAccountFieldValues> {
  control: Control<T>;
  /** Tự focus ô họ tên. Mặc định bật. */
  autoFocus?: boolean;
  /**
   * Form gọi `verifyRef.current()` khi người dùng bấm đăng ký mà SĐT CHƯA xác thực: gửi mã và mở
   * popup y như nút "Xác thực". Lượt mở này mang cờ "tự gửi tiếp": nhập đúng mã ⇒ `onVerified()`
   * để form gửi luôn; đóng popup thì huỷ cờ.
   */
  verifyRef?: RefObject<(() => void) | null>;
  onVerified?: () => void;
  /**
   * Tài khoản ĐÃ có (vào bằng Google/Facebook) nhưng chưa có SĐT xác minh: không hỏi họ tên, mã
   * OTP gắn số vào CHÍNH tài khoản đang đăng nhập (`/users/me/phone/*`) thay vì purpose `register`.
   */
  attachToAccount?: boolean;
  /** Hiện hai ô mật khẩu. Mặc định bật; tài khoản Google đã có mật khẩu thì tắt. */
  askPassword?: boolean;
}

const isOtpCodeComplete = (code: string | undefined): boolean => /^[0-9]{6}$/.test(code ?? '');

/**
 * PHẦN TÀI KHOẢN của form đăng ký đối tác một trang (`PartnerSignupForm`) — họ tên · email liên hệ ·
 * SĐT (xác thực) · mật khẩu + nhập lại. Email KHÔNG đi vào tài khoản — nó là email liên hệ của
 * gian hàng (`POST /tenants`).
 *
 * ## Xác thực trước, đăng ký sau (như luồng đặt xe)
 *
 * Nhập SĐT → "Xác thực" (gửi mã, purpose `register`) → popup nhập mã 6 số → đủ 6 số là tự
 * `verify-otp`. Đúng mã ⇒ popup đóng, `phoneVerified = true`, SĐT hiện thành chữ kèm tích xanh; nút đăng
 * ký của form chỉ mở khi đã xác thực, và server đối chiếu lại chính mã đó trong lượt đăng ký (ADR 0060). Xác thực xong
 * thì SĐT hiện thành chữ kèm tích xanh, không sửa được nữa.
 *
 * Trả về các ô liền nhau (fragment) để nơi gọi tự đặt vào lưới của mình.
 */
export function PartnerAccountFields<T extends PartnerAccountFieldValues>({
  control,
  autoFocus = true,
  verifyRef,
  onVerified,
  attachToAccount = false,
  askPassword = true,
}: PartnerAccountFieldsProps<T>) {
  const t = useTranslations('ShopOnboarding');
  const errorMessage = useErrorMessage();
  const name = (key: keyof PartnerAccountFieldValues & string) => key as Path<T>;

  const registerOtp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.REGISTER);
  const accountOtp = useContactVerify(CONTACT_CHANNEL.PHONE);
  /** Một mặt chung cho hai đường OTP — phần còn lại của component không cần biết đang dùng đường nào. */
  const otp = attachToAccount
    ? {
        codeSent: accountOtp.step === 'code',
        cooldown: accountOtp.cooldown,
        sending: accountOtp.sending,
        verifying: accountOtp.verifying,
        sendAsync: accountOtp.sendAsync,
        verifyAsync: (_phone: string, code: string) => accountOtp.verifyAsync(code),
        reset: accountOtp.reset,
      }
    : {
        codeSent: registerOtp.status === 'code_sent',
        cooldown: registerOtp.cooldown,
        sending: registerOtp.sending,
        verifying: registerOtp.verifying,
        sendAsync: registerOtp.sendAsync,
        verifyAsync: registerOtp.verifyAsync,
        reset: registerOtp.reset,
      };
  const { field: phoneField, fieldState: phoneState } = useController({
    control,
    name: name('phone'),
  });
  // Tách `ref` ra: React Compiler coi cả object có `.ref` là ref và cấm đọc lúc render.
  const { ref: phoneInputRef, ...phoneInput } = phoneField;
  const { field: otpField } = useController({ control, name: name('otpCode') });
  const { field: verifiedField, fieldState: verifiedState } = useController({
    control,
    name: name('phoneVerified'),
  });
  const [dialogOpen, setDialogOpen] = useState(false);
  const [otpError, setOtpError] = useState<string | null>(null);
  /** Lượt xác thực do nút ĐĂNG KÝ mở — đúng mã thì form tự gửi tiếp (`onVerified`). */
  const continueAfterVerify = useRef(false);

  const phone = String(useWatch({ control, name: name('phone') }) ?? '').trim();
  const phoneValid = VN_MOBILE_PHONE_PATTERN.test(phone.trim());
  const code = String(otpField.value ?? '');
  const verified = verifiedField.value === true;

  const setVerified = verifiedField.onChange;
  const setCode = otpField.onChange;
  const resetOtp = otp.reset;

  // Sửa SĐT ⇒ mã và trạng thái xác thực thuộc số cũ, làm lại từ đầu.
  const lastPhone = useRef(phone);
  useEffect(() => {
    if (phone === lastPhone.current) return;
    lastPhone.current = phone;
    resetOtp();
    setOtpError(null);
    if (code) setCode('');
    if (verified) setVerified(false);
  }, [phone, resetOtp, code, setCode, verified, setVerified]);

  /** "Xác thực": gửi mã (trừ khi vừa gửi và còn đếm ngược) rồi mở popup nhập mã. */
  const startVerify = async (fromSubmit = false) => {
    continueAfterVerify.current = fromSubmit;
    setOtpError(null);
    if (otp.codeSent && otp.cooldown > 0) {
      setDialogOpen(true);
      return;
    }
    try {
      await otp.sendAsync(phone);
      setCode('');
      setDialogOpen(true);
    } catch (err) {
      setOtpError(errorMessage(err));
    }
  };

  const resend = async () => {
    setOtpError(null);
    try {
      await otp.sendAsync(phone);
      setCode('');
    } catch (err) {
      setOtpError(errorMessage(err));
    }
  };

  const verifyCode = async (value: string) => {
    if (!isOtpCodeComplete(value)) return;
    setOtpError(null);
    try {
      await otp.verifyAsync(phone, value);
      setVerified(true);
      setDialogOpen(false);
      if (continueAfterVerify.current) {
        continueAfterVerify.current = false;
        onVerified?.();
      }
    } catch (err) {
      setOtpError(errorMessage(err));
    }
  };

  const closeDialog = () => {
    continueAfterVerify.current = false;
    setDialogOpen(false);
  };

  // Cho form gọi lượt xác thực từ nút đăng ký. Gán trong effect — không ghi ref lúc render.
  useEffect(() => {
    if (!verifyRef) return;
    verifyRef.current = () => void startVerify(true);
    return () => {
      verifyRef.current = null;
    };
  });

  const phoneHelp =
    phoneState.error?.message ??
    (!dialogOpen ? otpError : null) ??
    verifiedState.error?.message ??
    // Figma Partner-XePrime `24382:23516`: ô SĐT không có dòng gợi ý — chỉ hiện lỗi.
    null;
  const phoneError = Boolean(phoneState.error || (!dialogOpen && otpError) || verifiedState.error);

  return (
    <>
      {attachToAccount ? null : (
        <TextField
          control={control}
          name={name('displayName')}
          label={t('signup.fields.displayName.label')}
          placeholder={t('signup.fields.displayName.placeholder')}
          autoComplete="name"
          prefix={<UserOutlined />}
          required
          autoFocus={autoFocus}
        />
      )}
      <TextField
        control={control}
        name={name('email')}
        label={t('signup.fields.email.label')}
        type="email"
        placeholder={t('signup.fields.email.placeholder')}
        autoComplete="email"
        prefix={<MailOutlined />}
        required
      />

      <Form.Item
        className={styles.fieldOwnRow}
        label={t('signup.fields.phone.label')}
        required
        htmlFor={verified ? undefined : 'partner-signup-phone'}
        validateStatus={phoneError ? 'error' : verified ? 'success' : undefined}
        help={phoneHelp}
      >
        {verified ? (
          <div className={styles.verifiedPhone}>
            <PhoneOutlined aria-hidden="true" className={styles.verifiedPhoneIcon} />
            <span className={styles.verifiedPhoneNumber}>{phone}</span>
            <span className={styles.verifiedTag}>
              <CheckCircleFilled aria-hidden="true" />
              {t('signup.fields.otpCode.verified')}
            </span>
          </div>
        ) : (
          <div className={styles.otpRow}>
            <Input
              id="partner-signup-phone"
              ref={phoneInputRef}
              name={phoneInput.name}
              value={String(phoneInput.value ?? '')}
              onChange={(event) => phoneInput.onChange(sanitizePhoneInput(event.target.value))}
              onBlur={phoneInput.onBlur}
              type="tel"
              autoComplete="tel"
              placeholder={t('signup.fields.phone.placeholder')}
              prefix={<PhoneOutlined />}
              status={phoneError ? 'error' : undefined}
            />
            <Button
              className={styles.otpSend}
              loading={otp.sending && !dialogOpen}
              disabled={!phoneValid}
              onClick={() => void startVerify()}
            >
              {t('signup.fields.otpCode.sendOtp')}
            </Button>
          </div>
        )}
      </Form.Item>

      {askPassword ? (
        <>
          <TextField
            control={control}
            name={name('password')}
            label={t('signup.fields.password.label')}
            type="password"
            placeholder={t('signup.fields.password.placeholder')}
            autoComplete="new-password"
            prefix={<LockOutlined />}
            required
          />
          <TextField
            control={control}
            name={name('confirmPassword')}
            label={t('signup.fields.confirmPassword.label')}
            type="password"
            placeholder={t('signup.fields.confirmPassword.placeholder')}
            autoComplete="new-password"
            prefix={<LockOutlined />}
            required
          />
        </>
      ) : null}

      <ResponsiveDialog
        open={dialogOpen}
        onClose={closeDialog}
        title={t('signup.fields.otpCode.dialogTitle')}
        size="sm"
        footer={
          <div className={styles.otpDialogFooter}>
            <Button onClick={closeDialog} disabled={otp.verifying}>
              {t('signup.fields.otpCode.cancel')}
            </Button>
            <Button
              type="primary"
              loading={otp.verifying}
              disabled={!isOtpCodeComplete(code)}
              onClick={() => void verifyCode(code)}
            >
              {t('signup.fields.otpCode.verify')}
            </Button>
          </div>
        }
      >
        <div className={styles.otpDialogBody}>
          <p className={styles.otpDialogLead}>
            {t('signup.fields.otpCode.codeSentTo')} <strong>{phone}</strong>
          </p>
          <OtpCodeInput
            value={code}
            onChange={(next) => setCode(next)}
            onComplete={(full) => void verifyCode(full)}
            disabled={otp.verifying}
            autoFocus
          />
          {otpError ? <Alert type="error" showIcon title={otpError} /> : null}
          <div className={styles.otpDialogResend}>
            <Button
              type="link"
              size="small"
              loading={otp.sending}
              disabled={otp.cooldown > 0}
              onClick={() => void resend()}
            >
              {otp.cooldown > 0
                ? t('signup.fields.otpCode.resendInTime', { time: formatOtpCooldown(otp.cooldown) })
                : t('signup.fields.otpCode.resend')}
            </Button>
          </div>
        </div>
      </ResponsiveDialog>
    </>
  );
}
