import { useMemo, useState, type ReactNode } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { Text, YStack } from 'tamagui';
import { buildRegisterSchema, type RegisterValues } from '@xeprime/validators';
import { useAuthSchemaLabels } from '../use-auth-schema-labels';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { PHONE_VERIFICATION_PURPOSE } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { TextField } from '@/components/ui/TextField';
import { checkRegistration, type CurrentUser } from '@/features/auth/api';
import { useRegister } from '@/features/auth/hooks/use-auth';
import { OtpCodeStep } from '@/features/phone-verification/components/OtpCodeStep';
import { usePhoneVerify } from '@/features/phone-verification/hooks/use-phone-verify';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';

/**
 * Đăng ký tài khoản — bản native của nhánh đăng ký trong `AuthPanel` của web, CÙNG luồng (ADR 0060):
 *
 *  1. Bốn ô: SĐT · họ tên · mật khẩu · nhập lại (cùng `registerSchema`).
 *  2. "Tạo tài khoản" → gửi mã `purpose=register` tới SĐT. Số đã có tài khoản ở app này ⇒ server từ
 *     chối ngay (`PHONE_TAKEN`), trước khi tốn tin nhắn. Môi trường nhận mã test thì không gửi SMS.
 *  3. Bước "Xác minh số điện thoại": nhập 6 số → `POST /auth/mobile/register { …, code }`. "Sửa thông
 *     tin" quay lại form, giữ nguyên thứ đã điền.
 *
 * `confirmPassword` KHÔNG được gửi lên: nó là ràng buộc của form, không phải của API.
 */
export function RegisterForm({
  onSuccess,
  consent,
  blocked = false,
  onStepChange,
}: {
  onSuccess: (user: CurrentUser) => void;
  /**
   * Khối cam kết đặt NGAY TRÊN nút gửi — màn đăng ký nhét ô tick điều khoản vào đây. State của nó
   * thuộc về MÀN, vì cùng cái tick đó còn chặn hai nút mạng xã hội nằm ngoài form.
   */
  consent?: ReactNode;
  /** Chặn gửi vì một điều kiện NGOÀI form — hiện có đúng một: chưa tick đồng ý điều khoản. */
  blocked?: boolean;
  /** Báo màn biết form đang ở bước nhập mã — màn ẩn phần mạng xã hội như web. */
  onStepChange?: (inCodeStep: boolean) => void;
}) {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const register = useRegister();
  const registerOtp = usePhoneVerify(PHONE_VERIFICATION_PURPOSE.REGISTER);

  /** Thông tin đăng ký ĐANG CHỜ MÃ. `null` ⇒ còn ở bước điền form. Chỉ sống trong bộ nhớ. */
  const [registration, setRegistration] = useState<RegisterValues | null>(null);
  const [code, setCode] = useState('');
  const [sending, setSending] = useState(false);

  /*
   * Dựng lại schema khi ngôn ngữ đổi — LUẬT ở `@xeprime/validators`, chỉ câu chữ đi vào từ đây.
   * `useMemo` vì `yupResolver` nhận object mới mỗi nhịp thì RHF xác thực lại toàn form sau từng
   * phím gõ.
   */
  const labels = useAuthSchemaLabels();
  const schema = useMemo(() => buildRegisterSchema(labels), [labels]);

  const {
    control,
    handleSubmit,
    formState: { isValid },
  } = useForm<RegisterValues>({
    mode: 'onChange',
    resolver: yupResolver(schema),
    defaultValues: { displayName: '', phone: '', password: '', confirmPassword: '' },
  });

  const toCodeStep = (values: RegisterValues | null) => {
    setRegistration(values);
    onStepChange?.(values !== null);
  };

  /** Bước 1: gửi mã rồi sang bước nhập mã. */
  const startRegistration = async (values: RegisterValues) => {
    if (sending) return;
    setSending(true);
    try {
      // Kiểm HẾT ở bước này rồi mới sang bước mã — kể cả ở môi trường nhận mã test (không gửi SMS).
      await checkRegistration({
        displayName: values.displayName,
        phone: values.phone.trim(),
        password: values.password,
      });
      if (!registerOtp.testCodeEnabled) await registerOtp.sendAsync(values.phone.trim());
      setCode('');
      toCodeStep(values);
    } catch (error) {
      // Trùng số, gửi SMS lỗi, cooldown… — báo ngay, ở lại form.
      toast.showError(errorMessage(error));
    } finally {
      setSending(false);
    }
  };
  // `handleSubmit` gọi lúc bấm — không dựng callback đọc state lúc render.
  const onSubmit = () => void handleSubmit(startRegistration)();

  /** Bước 2: tạo tài khoản kèm mã. Sai mã thì ở lại bước mã. */
  const confirmRegistration = (submitted: string) => {
    if (!registration || register.isPending) return;
    register.mutate(
      {
        displayName: registration.displayName,
        phone: registration.phone.trim(),
        password: registration.password,
        code: submitted,
      },
      {
        onSuccess,
        onError: (error) => {
          setCode('');
          toast.showError(errorMessage(error));
        },
      },
    );
  };

  /** Quay lại form — giữ nguyên thứ đã điền; mã đã gửi vẫn tính cooldown ở server. */
  const editRegistration = () => {
    toCodeStep(null);
    setCode('');
    registerOtp.reset();
  };

  if (registration) {
    return (
      <YStack gap={space.md}>
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold}>
            {t('register.verifyTitle')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('register.verifySub')}
          </Text>
        </YStack>
        {registerOtp.error ? (
          <Callout tone="danger">{errorMessage(registerOtp.error)}</Callout>
        ) : null}
        <OtpCodeStep
          phone={registration.phone.trim()}
          verify={registerOtp}
          code={code}
          onCodeChange={setCode}
          onSubmit={confirmRegistration}
          submitLabel={t('register.verifySubmit')}
          submitting={register.isPending}
          onEdit={editRegistration}
          editLabel={t('register.editInfo')}
        />
      </YStack>
    );
  }

  return (
    <YStack gap={space.md}>
      <TextField
        control={control}
        name="phone"
        required
        label={t('register.phone')}
        placeholder={t('register.phonePlaceholder')}
        hint={t('register.phoneHint')}
        icon="call-outline"
        autoCapitalize="none"
        autoComplete="tel"
        keyboardType="phone-pad"
        editable={!sending}
      />

      <TextField
        control={control}
        name="displayName"
        required
        label={t('register.displayName')}
        placeholder={t('register.fullNamePlaceholder')}
        icon="person-outline"
        autoComplete="name"
        editable={!sending}
      />

      <TextField
        control={control}
        name="password"
        required
        label={t('register.password')}
        placeholder={t('register.passwordPlaceholderApp')}
        hint={t('passwordRule')}
        icon="lock-closed-outline"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        editable={!sending}
      />

      <TextField
        control={control}
        name="confirmPassword"
        required
        label={t('register.confirmPassword')}
        placeholder={t('register.confirmPasswordPlaceholder')}
        icon="lock-closed-outline"
        secureTextEntry
        autoCapitalize="none"
        autoComplete="new-password"
        returnKeyType="go"
        onSubmitEditing={onSubmit}
        editable={!sending}
      />

      {consent}

      <Button
        label={t('register.submit')}
        icon="person-add-outline"
        onPress={onSubmit}
        loading={sending}
        disabled={!isValid || blocked}
      />
    </YStack>
  );
}
