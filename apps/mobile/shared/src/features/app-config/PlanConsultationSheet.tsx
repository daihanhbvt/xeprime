import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { useMutation } from '@tanstack/react-query';
import { Text, YStack } from 'tamagui';
import { useLocale, useTranslations } from 'use-intl';
import { object, string, type InferType } from 'yup';
import { VN_PHONE_PATTERN } from '@xeprime/types';
import { appConfigApi, type PlanConsultationInput } from '@/api/app-config/api';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { TextField } from '@/components/ui/TextField';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { getErrorMessage } from '@/lib/get-error-message';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { usePartnerAppConfig } from './use-partner-app-config';

/** Trần nội dung — khớp DTO phía server. */
export const PLAN_CONSULTATION_MESSAGE_MAX = 1000;

/** Message là MÃ, dịch ở `Subscription.mobilePlan.consult.validation`. */
export const planConsultationSchema = object({
  // Trần dưới khớp `MinLength(2)` của `PlanConsultationDto`.
  fullName: string().trim().required('fullNameRequired').min(2, 'fullNameTooShort'),
  phone: string()
    .trim()
    .required('phoneRequired')
    .matches(VN_PHONE_PATTERN, { message: 'phoneInvalid', excludeEmptyString: true }),
  email: string().trim().required('emailRequired').email('emailInvalid'),
  message: string().trim().max(PLAN_CONSULTATION_MESSAGE_MAX, 'messageTooLong').default(''),
});
export type PlanConsultationValues = InferType<typeof planConsultationSchema>;

/**
 * "Liên hệ tư vấn" — chỉ tồn tại khi `isPlanPromotionEnabled` bật. Cờ tắt giữa lúc đang mở ⇒ tấm tự đóng,
 * người dùng đứng lại ở màn gói (nơi mở nó).
 */
export function PlanConsultationSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Subscription.mobilePlan.consult');
  const locale = useLocale();
  const toast = useAppToast();
  const { isPlanPromotionEnabled } = usePartnerAppConfig();
  const { data: user } = useCurrentUser();

  const resolver = useValidationResolver<PlanConsultationValues>(
    planConsultationSchema,
    'Subscription.mobilePlan.consult.validation',
  );
  const defaults: PlanConsultationValues = {
    fullName: user?.displayName ?? '',
    phone: user?.phone ?? '',
    email: user?.email ?? '',
    message: '',
  };
  const { control, handleSubmit, reset } = useForm<PlanConsultationValues>({
    resolver,
    defaultValues: defaults,
    // Điền sẵn từ tài khoản khi `/auth/me` về sau lần dựng đầu.
    ...(user ? { values: defaults } : {}),
  });

  const submitMutation = useMutation({
    mutationFn: (body: PlanConsultationInput) => appConfigApi.planConsultation(body),
  });

  /**
   * Gửi xong ⇒ tấm chuyển sang lời cảm ơn. Địa chỉ hiện ra là địa chỉ SERVER thật sự gửi
   * (`emailedTo` — email tài khoản và/hoặc email liên hệ vừa gõ); `null` ⇒ không nhắc email.
   */
  const result = submitMutation.isSuccess ? submitMutation.data : null;
  const sent = result !== null;
  const { reset: resetMutation } = submitMutation;

  const close = () => {
    resetMutation();
    reset(defaults);
    onClose();
  };

  // Cờ tắt từ xa khi tấm đang mở ⇒ đóng ngay.
  useEffect(() => {
    if (open && !isPlanPromotionEnabled) {
      resetMutation();
      onClose();
    }
  }, [open, isPlanPromotionEnabled, onClose, resetMutation]);

  const submit = handleSubmit((values) => {
    const email = values.email.trim();
    submitMutation.mutate(
      {
        fullName: values.fullName.trim(),
        phone: values.phone.trim(),
        email,
        ...(values.message?.trim() ? { message: values.message.trim() } : {}),
        locale: locale === 'en' ? 'en' : 'vi',
      },
      {
        onError: (err) => toast.showError(getErrorMessage(err)),
      },
    );
  });

  if (!isPlanPromotionEnabled) return null;

  return (
    <BottomSheet
      open={open}
      onClose={close}
      title={sent ? t('successTitle') : t('title')}
      footer={
        sent ? (
          <Button label={t('done')} onPress={close} />
        ) : (
          <Button
            label={t('submit')}
            icon="send-outline"
            loading={submitMutation.isPending}
            onPress={() => void submit()}
          />
        )
      }
    >
      {sent ? (
        <Text col={colors.text} fos={fontSize.body}>
          {result?.emailedTo
            ? t('successBody', { email: result.emailedTo })
            : t('successBodyNoEmail')}
        </Text>
      ) : (
        <YStack gap={space.md}>
          <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
            {t('intro')}
          </Text>
          <TextField
            control={control}
            name="fullName"
            label={t('fullName')}
            autoComplete="name"
            required
          />
          <TextField
            control={control}
            name="phone"
            label={t('phone')}
            keyboardType="phone-pad"
            autoComplete="tel"
            required
          />
          <TextField
            control={control}
            name="email"
            label={t('email')}
            keyboardType="email-address"
            autoCapitalize="none"
            autoComplete="email"
            required
          />
          <TextField
            control={control}
            name="message"
            label={t('message')}
            placeholder={t('messagePlaceholder')}
            multiline
            rows={4}
            maxLength={PLAN_CONSULTATION_MESSAGE_MAX}
          />
        </YStack>
      )}
    </BottomSheet>
  );
}
