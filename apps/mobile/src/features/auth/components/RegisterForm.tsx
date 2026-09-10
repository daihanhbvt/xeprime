import { useMemo, type ReactNode } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { YStack } from 'tamagui';
import { buildRegisterSchema, type RegisterValues } from '@xeprime/validators';
import { useAuthSchemaLabels } from '../use-auth-schema-labels';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { type CurrentUser } from '@/features/auth/api';
import { useRegister } from '@/features/auth/hooks/use-auth';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';

/**
 * Bốn ô của `RegisterForm` bên web (`AuthPanel.tsx`), cùng `registerSchema`, cùng endpoint —
 * chỉ khác envelope phiên (ADR 0017).
 *
 * `confirmPassword` KHÔNG được gửi lên: nó là ràng buộc của form, không phải của API. Web cũng
 * cắt nó ở đúng chỗ này.
 */
export function RegisterForm({
  onSuccess,
  consent,
  blocked = false,
}: {
  onSuccess: (user: CurrentUser) => void;
  /**
   * Khối cam kết đặt NGAY TRÊN nút gửi — màn đăng ký nhét ô tick điều khoản vào đây.
   *
   * Là một khe nhận nội dung chứ không phải một ô tick dựng sẵn: state của nó thuộc về MÀN, vì
   * cùng cái tick đó còn chặn hai nút mạng xã hội nằm ngoài form (xem {@link blocked}). Form chỉ
   * biết chỗ ĐẶT nó — sát nút bấm, nơi người dùng nhìn khi tự hỏi vì sao nút chưa sáng.
   */
  consent?: ReactNode;
  /**
   * Chặn gửi vì một điều kiện NGOÀI form — hiện có đúng một: chưa tick đồng ý điều khoản.
   *
   * Ô tick sống ở MÀN chứ không ở đây, và đó là chủ đích: nó chặn cả đăng ký bằng mạng xã hội,
   * thứ cũng tạo tài khoản. Để ô tick bên trong form thì hai nút Google/Facebook ngay dưới thành
   * một đường vòng tạo tài khoản mà không đồng ý gì cả.
   *
   * KHÔNG đưa vào `registerSchema`: schema là hợp đồng dùng chung với web
   * (`@xeprime/validators`), mà web cố ý không có ô tick — nhét vào đó một trường chỉ app mới có
   * là bắt web mang theo một luật nó không dùng.
   */
  blocked?: boolean;
}) {
  const t = useTranslations('Auth');
  const errorMessage = useErrorMessage();
  const toast = useAppToast();
  const register = useRegister();

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

  const onSubmit = handleSubmit((values) => {
    register.mutate(
      { displayName: values.displayName, phone: values.phone, password: values.password },
      {
        onSuccess,
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  });

  return (
    <YStack gap={space.md}>
      <TextField
        control={control}
        name="displayName"
        required
        label={t('register.fullName')}
        placeholder={t('register.fullNamePlaceholder')}
        icon="person-outline"
        autoComplete="name"
        editable={!register.isPending}
      />

      <TextField
        control={control}
        name="phone"
        required
        label={t('register.phone')}
        placeholder={t('register.phonePlaceholder')}
        icon="call-outline"
        autoCapitalize="none"
        autoComplete="tel"
        keyboardType="phone-pad"
        editable={!register.isPending}
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
        editable={!register.isPending}
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
        editable={!register.isPending}
      />

      {consent}

      <Button
        label={t('register.submit')}
        onPress={onSubmit}
        loading={register.isPending}
        disabled={!isValid || blocked}
      />
    </YStack>
  );
}
