import { useEffect, useRef, useState, type RefObject } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { useController, useWatch, type Control, type FieldValues } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { VN_PHONE_PATTERN, type PhoneVerificationPurpose } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import { usePhoneVerify } from '../hooks/use-phone-verify';
import { OtpCodeInput } from './OtpCodeInput';

const isOtpCodeComplete = (code: string | undefined): boolean => /^[0-9]{6}$/.test(code ?? '');

/**
 * Ô SĐT "XÁC THỰC TRƯỚC, GỬI SAU" của form đăng ký đối tác (app XePrime Partner — bản native của ô SĐT
 * trong web `PartnerAccountFields`). Đăng ký tài khoản KHÁCH thì theo luồng web: điền form → gửi mã →
 * bước nhập mã (`OtpCodeStep`).
 *
 * nhập SĐT → "Xác thực" (gửi mã `purpose`) → sheet nhập mã 6 số → đủ 6 số là tự `verify-otp`.
 * Đúng mã ⇒ sheet đóng, `verifiedName = true`, mã giữ ở `codeName`, SĐT hiện thành chữ kèm tích
 * xanh. Form gửi CHÍNH mã đó kèm `POST /auth/register` và server đối chiếu lại (ADR 0060).
 *
 * Số đã có tài khoản ở realm của app ⇒ `send-otp` trả `PHONE_TAKEN` ngay lúc bấm "Xác thực", trước
 * khi tốn tin nhắn. Realm do server suy từ app gọi (`clientApp`), nên cùng một số vẫn đăng ký được
 * ở app còn lại — đó là một tài khoản khác (ADR 0053).
 *
 * Sửa SĐT sau khi đã xác thực không được: số đã chốt hiện thành chữ.
 *
 * Form có thể mở lượt xác thực từ NÚT GỬI của nó (`verifyRef.current()`) khi người dùng bấm gửi mà
 * chưa xác thực: lượt đó mang cờ "tự gửi tiếp" — đúng mã ⇒ `onVerified()`; đóng sheet thì huỷ cờ.
 */
export function VerifiedPhoneField({
  control,
  phoneName,
  codeName,
  verifiedName,
  purpose,
  label,
  placeholder,
  hint,
  disabled = false,
  verifyRef,
  onVerified,
}: {
  /*
   * KHÔNG generic theo form của nơi gọi: `Path<T>` trên một `T` generic làm TypeScript dựng kiểu
   * template literal tới mức sập ("Map maximum size exceeded"). Nơi gọi ép `control` một lần.
   */
  control: Control<FieldValues>;
  phoneName: string;
  codeName: string;
  verifiedName: string;
  purpose: PhoneVerificationPurpose;
  label: string;
  placeholder: string;
  /** Gợi ý khi SĐT chưa hợp lệ; hợp lệ rồi thì mời bấm "Xác thực". */
  hint?: string;
  disabled?: boolean;
  verifyRef?: RefObject<(() => void) | null>;
  onVerified?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Auth.otp');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const otp = usePhoneVerify(purpose);
  const { field: codeField } = useController({ control, name: codeName });
  const { field: verifiedField, fieldState: verifiedState } = useController({
    control,
    name: verifiedName,
  });
  const [sheetOpen, setSheetOpen] = useState(false);
  /** Lượt xác thực do nút GỬI của form mở — đúng mã thì form tự gửi tiếp (`onVerified`). */
  const continueAfterVerify = useRef(false);
  const phone = String(useWatch({ control, name: phoneName }) ?? '').trim();
  const phoneValid = VN_PHONE_PATTERN.test(phone);
  const code = String(codeField.value ?? '');
  const verified = verifiedField.value === true;

  const setVerified = verifiedField.onChange;
  const setCode = codeField.onChange;
  const resetOtp = otp.reset;

  // Sửa SĐT ⇒ mã và trạng thái xác thực thuộc số cũ, làm lại từ đầu.
  const lastPhone = useRef(phone);
  useEffect(() => {
    if (phone === lastPhone.current) return;
    lastPhone.current = phone;
    resetOtp();
    if (code) setCode('');
    if (verified) setVerified(false);
  }, [phone, resetOtp, code, setCode, verified, setVerified]);

  /** "Xác thực": gửi mã (trừ khi vừa gửi và còn đếm ngược) rồi mở sheet nhập mã. */
  const startVerify = async (fromSubmit = false) => {
    continueAfterVerify.current = fromSubmit;
    if (otp.status === 'code_sent' && otp.cooldown > 0) {
      setSheetOpen(true);
      return;
    }
    try {
      await otp.sendAsync(phone);
      setCode('');
      setSheetOpen(true);
    } catch (error) {
      toast.showError(errorMessage(error));
    }
  };

  const resend = async () => {
    try {
      await otp.sendAsync(phone);
      setCode('');
    } catch (error) {
      toast.showError(errorMessage(error));
    }
  };

  const verifyCode = (value: string) => {
    if (!isOtpCodeComplete(value)) return;
    otp.verify(phone, value, {
      onSuccess: () => {
        setVerified(true);
        setSheetOpen(false);
        if (continueAfterVerify.current) {
          continueAfterVerify.current = false;
          onVerified?.();
        }
      },
      onError: (error) => toast.showError(errorMessage(error)),
    });
  };

  const closeSheet = () => {
    continueAfterVerify.current = false;
    setSheetOpen(false);
  };

  // Cho form mở lượt xác thực từ nút gửi. Gán trong effect — không ghi ref lúc render.
  useEffect(() => {
    if (!verifyRef) return;
    verifyRef.current = () => void startVerify(true);
    return () => {
      verifyRef.current = null;
    };
  });

  return (
    <>
      {verified ? (
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {label} *
          </Text>
          <XStack ai="center" gap={space.sm} minHeight={44}>
            <Ionicons name="call-outline" size={iconSize.md} color={colors.textMuted} />
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {phone}
            </Text>
            <XStack ai="center" gap={space.xs}>
              <Ionicons name="checkmark-circle" size={iconSize.md} color={colors.success} />
              <Text col={colors.success} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('verified')}
              </Text>
            </XStack>
          </XStack>
        </YStack>
      ) : (
        <YStack gap={space.xs}>
          <TextField
            control={control}
            name={phoneName}
            required
            label={label}
            placeholder={placeholder}
            hint={phoneValid ? t('verifyHelp') : hint}
            icon="call-outline"
            keyboardType="phone-pad"
            autoComplete="tel"
            editable={!disabled}
          />
          {verifiedState.error?.message ? (
            <Text col={colors.danger} fos={fontSize.label}>
              {verifiedState.error.message}
            </Text>
          ) : null}
          <Button
            label={t('verify')}
            icon="shield-checkmark-outline"
            variant="secondary"
            loading={otp.sending && !sheetOpen}
            disabled={!phoneValid || disabled}
            onPress={() => void startVerify()}
          />
        </YStack>
      )}

      <BottomSheet
        open={sheetOpen}
        onClose={closeSheet}
        title={t('dialogTitle')}
        footer={
          <Button
            label={t('verify')}
            icon="shield-checkmark-outline"
            loading={otp.verifying}
            disabled={!isOtpCodeComplete(code)}
            onPress={() => verifyCode(code)}
          />
        }
      >
        <YStack gap={space.md}>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('codeSentTo')}
            <Text col={colors.text} fow={fontWeight.semibold}>
              {` ${phone}`}
            </Text>
          </Text>
          <OtpCodeInput
            value={code}
            onChange={(next) => {
              setCode(next);
              if (isOtpCodeComplete(next)) verifyCode(next);
            }}
            disabled={otp.verifying}
            autoFocus
          />
          <XStack jc="center">
            <Button
              label={otp.cooldown > 0 ? t('resendIn', { seconds: otp.cooldown }) : t('resend')}
              variant="ghost"
              block={false}
              loading={otp.sending}
              disabled={otp.cooldown > 0}
              onPress={() => void resend()}
            />
          </XStack>
        </YStack>
      </BottomSheet>
    </>
  );
}
