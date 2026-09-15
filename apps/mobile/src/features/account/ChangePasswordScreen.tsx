import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { API_ERROR_CODE } from '@xeprime/types';
import { getErrorCode } from '@xeprime/api-client';
import {
  PASSWORD_MIN,
  PASSWORD_RULES,
  buildPasswordSchema,
  type PasswordRuleKey,
} from '@xeprime/validators';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { TextField } from '@/components/ui/TextField';
import { changeAccountPassword, setAccountPassword } from '@/features/auth/api';
import { useAuthSchemaLabels } from '@/features/auth/use-auth-schema-labels';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { queryKeys } from '@/queries/query-keys';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

interface ChangePasswordValues {
  currentPassword: string;
  newPassword: string;
  confirmPassword: string;
}

/**
 * Đổi mật khẩu ở khu tài khoản — MỘT form cho hai tình huống, phân nhánh theo `MeDto.hasPassword`.
 * Bản native của `ChangePasswordForm` bên web.
 *
 *  - Đã có mật khẩu → hỏi mật khẩu hiện tại, gọi `POST /auth/password/change`. Sai mật khẩu cũ là
 *    lỗi TRÊN Ô (mã `CURRENT_PASSWORD_INCORRECT`), không phải một thông báo chung.
 *  - Chưa có (tài khoản OTP / mạng xã hội) → nói rõ đây là đặt lần đầu, không hỏi mật khẩu cũ, và
 *    gọi `POST /auth/password/set`. Không bao giờ dùng token quên/đặt lại để giả một lần đổi.
 *
 * Bảng "Yêu cầu của mật khẩu" tick theo `PASSWORD_RULES` — cùng nguồn với schema, nên bảng nói
 * đạt thì submit không thể đỏ vì luật mật khẩu.
 *
 * Sau khi thành công: reset form và invalidate `auth.me` để `hasPassword` đảo sang `true` — form
 * tự chuyển từ "đặt lần đầu" sang "đổi" mà không cần mở lại màn.
 */
export function ChangePasswordScreen() {
  const t = useTranslations('Account.changePassword');
  const router = useRouter();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const queryClient = useQueryClient();
  const labels = useAuthSchemaLabels();
  const { data: user } = useCurrentUser();
  /*
   * Phiên chưa về thì mặc định "đã có mật khẩu" — nhánh AN TOÀN hơn (đòi thêm bằng chứng), chứ
   * không phải nhánh bỏ qua bước xác minh.
   */
  const hasPassword = user?.hasPassword ?? true;
  const [formError, setFormError] = useState<string | null>(null);

  const schema = useMemo(
    () =>
      yup.object({
        // MỘT schema cho cả hai nhánh, chỉ đổi LUẬT: hai schema khác nhau theo nhánh làm kiểu suy
        // ra của `yupResolver` thành hợp của hai shape và form mất bảo chứng khoá.
        currentPassword: yup
          .string()
          .defined()
          .test(
            'currentRequired',
            labels.passwordRequired,
            (value) => !hasPassword || Boolean(value),
          ),
        newPassword: buildPasswordSchema(labels),
        confirmPassword: yup
          .string()
          .required(labels.confirmRequired)
          .oneOf([yup.ref('newPassword')], labels.confirmMismatch),
      }),
    [hasPassword, labels],
  );

  const { control, handleSubmit, reset, setError, formState } = useForm<ChangePasswordValues>({
    resolver: yupResolver(schema),
    defaultValues: { currentPassword: '', newPassword: '', confirmPassword: '' },
  });
  const newPassword = useWatch({ control, name: 'newPassword' }) ?? '';

  const save = useMutation({
    mutationFn: (values: ChangePasswordValues) =>
      hasPassword
        ? changeAccountPassword(values.currentPassword, values.newPassword)
        : setAccountPassword(values.newPassword),
    onSuccess: () => {
      toast.showSuccess(hasPassword ? t('success') : t('successFirstTime'));
      reset();
      void queryClient.invalidateQueries({ queryKey: queryKeys.auth.all });
    },
    onError: (err) => {
      if (getErrorCode(err) === API_ERROR_CODE.CURRENT_PASSWORD_INCORRECT) {
        setError('currentPassword', { type: 'server', message: errorMessage(err) });
        return;
      }
      setFormError(errorMessage(err));
    },
  });

  const onSubmit = handleSubmit((values) => {
    setFormError(null);
    save.mutate(values);
  });

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.md}>
          {!hasPassword ? (
            <Callout tone="info" title={t('firstTimeTitle')}>
              {t('firstTimeBody')}
            </Callout>
          ) : null}
          {formError ? <Callout tone="danger">{formError}</Callout> : null}

          <Card>
            <YStack gap={space.md}>
              {hasPassword ? (
                <TextField
                  control={control}
                  name="currentPassword"
                  label={t('currentPassword')}
                  icon="lock-closed-outline"
                  secureTextEntry
                  autoCapitalize="none"
                  autoComplete="current-password"
                  editable={!save.isPending}
                  required
                />
              ) : null}
              <TextField
                control={control}
                name="newPassword"
                label={t('newPassword')}
                icon="lock-closed-outline"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                editable={!save.isPending}
                required
              />
              <TextField
                control={control}
                name="confirmPassword"
                label={t('confirmPassword')}
                icon="lock-closed-outline"
                secureTextEntry
                autoCapitalize="none"
                autoComplete="new-password"
                returnKeyType="go"
                onSubmitEditing={() => void onSubmit()}
                editable={!save.isPending}
                required
              />

              <Button
                label={hasPassword ? t('submit') : t('submitFirstTime')}
                icon="checkmark-outline"
                loading={save.isPending}
                disabled={!formState.isDirty && !save.isPending}
                onPress={() => void onSubmit()}
              />
            </YStack>
          </Card>

          {/*
            Bảng yêu cầu nằm DƯỚI form, không phải cột bên phải như web: ở 360dp không có cột thứ
            hai, và người dùng cần nó ngay sau khi gõ ô mật khẩu mới — đặt trên đầu thì nó bị bàn
            phím che đúng lúc đang gõ.
          */}
          <Card tone="muted" lift="flat">
            <YStack gap={space.sm}>
              <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                {t('requirementsTitle')}
              </Text>
              {PASSWORD_RULES.map((rule) => {
                const met = rule.test(newPassword);
                return (
                  <XStack key={rule.key} ai="center" gap={space.xs}>
                    <Ionicons
                      name={met ? 'checkmark-circle' : 'ellipse-outline'}
                      size={iconSize.sm}
                      color={met ? colors.success : colors.placeholder}
                    />
                    <Text
                      f={1}
                      col={met ? colors.text : colors.textMuted}
                      fos={fontSize.bodySm}
                      // Trình đọc màn hình không "thấy" được biểu tượng tick — nói ra bằng chữ.
                      accessibilityLabel={`${requirementLabel(t, rule.key)} — ${
                        met ? t('requirementMet') : t('requirementUnmet')
                      }`}
                    >
                      {requirementLabel(t, rule.key)}
                    </Text>
                  </XStack>
                );
              })}
            </YStack>
          </Card>
        </YStack>
      </Screen>
    </>
  );
}

/**
 * Nhãn của một quy tắc. Khoá của `t()` phải TĨNH, nên mã quy tắc đi qua bảng tra này chứ không
 * ghép chuỗi. `Record` đầy đủ chứ không phải `switch`: thêm một quy tắc vào `PASSWORD_RULES` mà
 * quên viết nhãn thì đỏ ngay ở đây, thay vì lặng lẽ rơi xuống một nhánh mặc định.
 */
function requirementLabel(
  t: ReturnType<typeof useTranslations<'Account.changePassword'>>,
  key: PasswordRuleKey,
): string {
  const labels: Record<PasswordRuleKey, string> = {
    passwordTooShort: t('requirements.passwordTooShort', { min: PASSWORD_MIN }),
    passwordNeedsLetter: t('requirements.passwordNeedsLetter'),
    passwordNeedsDigit: t('requirements.passwordNeedsDigit'),
  };
  return labels[key];
}
