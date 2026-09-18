import { Ionicons } from '@expo/vector-icons';
import { yupResolver } from '@hookform/resolvers/yup';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  SUPPORT_CASE_CATEGORY,
  SUPPORT_CASE_STATUS_META,
  type SupportCaseStatus,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { AccountDeletionImpact } from './components/AccountDeletionImpact';
import { Card } from '@/components/ui/Card';
import { CheckMark } from '@/components/ui/CheckMark';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import {
  SUPPORT_SURFACE,
  useOpenSupportCase,
  useSupportCases,
  useWithdrawAccountDeletion,
} from '@/features/support-cases/hooks/use-support-cases';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';

interface DeleteAccountValues {
  acknowledged: boolean;
}

const ITEMS = ['profile', 'vehicles', 'trips', 'billing'] as const;

/**
 * "Yêu cầu xoá tài khoản" — một YÊU CẦU đi vào hàng đợi support của nền tảng, không phải nút xoá.
 * Bản native của `DeleteAccountView`.
 *
 * Tái dùng `SupportCase` loại `account_deletion`: yêu cầu có mã, có trạng thái, có dòng thời gian
 * và admin xử lý tay. Repo chưa có chính sách lưu trữ/ẩn danh hoá đủ để hứa "xoá ngay và không
 * khôi phục được", nên màn này KHÔNG nói câu đó — nó nói đúng điều backend làm.
 *
 * Idempotent từ hai phía: server chỉ giữ tối đa MỘT case loại này còn mở cho mỗi người; client
 * đọc case đang mở (mặc định danh sách chỉ trả case còn mở) và hiện trạng thái thay vì form. Sau
 * khi gửi KHÔNG đăng xuất, KHÔNG đánh dấu tài khoản đã xoá — tài khoản dùng bình thường tới khi
 * XePrime hoàn tất, và người dùng rút yêu cầu được trong lúc chờ.
 *
 * ## Khối "ảnh hưởng khi đóng tài khoản" hiện ở CẢ HAI khu
 *
 * Bên web, `AccountDeletionImpact` (số dư khả dụng · đang chờ chuyển · lệnh rút đang treo ·
 * chuyến chưa khép) do TRANG dựng: `/manage/account` và `/account` đều đặt nó ngay trên form,
 * còn `/account/delete-account` thì không — vì người đi đường đó vừa đọc nó ở `/account`.
 *
 * App KHÔNG có sự phân đôi ấy: cả hai menu tài khoản dẫn về MỘT màn này, và màn `/account` của app
 * không dựng form xoá. Bản trước gác khối theo KHU, nên một khách thuê ở khu khách không bao giờ
 * đọc được mình đang mang theo gì — đúng cái mà web bảo đảm cho họ ở `/account`. Gác theo khu vì
 * thế là chép cái HÌNH của web mà bỏ mất cái NGHĨA.
 */
export function DeleteAccountScreen() {
  const t = useTranslations('Account.deleteAccount');
  const tCommon = useTranslations('Common.actions');
  const router = useRouter();
  const toast = useAppToast();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const [confirmingWithdraw, setConfirmingWithdraw] = useState(false);

  const pendingQuery = useSupportCases(SUPPORT_SURFACE.CUSTOMER, {
    category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
    limit: 1,
  });
  const openCase = useOpenSupportCase(SUPPORT_SURFACE.CUSTOMER);
  const withdraw = useWithdrawAccountDeletion();

  const schema = useMemo(
    () =>
      yup.object({
        // `.test` thay vì `.oneOf([true])`: giữ kiểu `boolean` cho form, chỉ đổi luật.
        acknowledged: yup
          .boolean()
          .required(t('acknowledgeRequired'))
          .test('acknowledged', t('acknowledgeRequired'), (value) => value === true),
      }),
    [t],
  );

  const { control, handleSubmit, reset, formState } = useForm<DeleteAccountValues>({
    resolver: yupResolver(schema),
    defaultValues: { acknowledged: false },
    // Nút gửi chỉ bật khi đã tick xác nhận — phải kiểm ngay lúc tick, không chờ tới lúc submit.
    mode: 'onChange',
  });

  const onSubmit = handleSubmit(() => {
    openCase.mutate(
      {
        category: SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
        subject: t('caseSubject'),
        description: t('caseDescription'),
      },
      {
        onSuccess: () => {
          toast.showSuccess(t('submitted'));
          reset();
        },
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  const pending = pendingQuery.data?.items[0];

  return (
    <>
      <AppHeader
        onBack={() => goBackOr(router, ROUTES.account.home())}
        title={t('title')}
        subtitle={t('subtitle')}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.md}>
          <Callout tone="danger" title={t('warningTitle')}>
            {t('warningBody')}
          </Callout>

          {/*
            Đứng TRƯỚC form, y như hai trang web dựng nó: một cảnh báo đọc sau khi đã bấm gửi thì
            không còn là cảnh báo. KHÔNG chặn nút gửi — yêu cầu vẫn vào hàng đợi support.
          */}
          <AccountDeletionImpact />

          {pendingQuery.isLoading ? (
            <Card>
              <MiniRowsSkeleton rows={4} />
            </Card>
          ) : pendingQuery.isError ? (
            <ScreenError
              error={pendingQuery.error}
              title={t('loadError')}
              onRetry={() => void pendingQuery.refetch()}
            />
          ) : pending ? (
            <Card>
              <YStack gap={space.sm}>
                <XStack ai="center" gap={space.sm}>
                  <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                    {t('pendingTitle')}
                  </Text>
                  <StatusBadge
                    label={domainLabel('supportCaseStatus', pending.status)}
                    color={SUPPORT_CASE_STATUS_META[pending.status as SupportCaseStatus].color}
                    size="sm"
                  />
                </XStack>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('pendingBody', { code: pending.code })}
                </Text>
                <Text col={colors.placeholder} fos={fontSize.label}>
                  {t('sentAt', { date: fmt.dateTime(pending.createdAt) })}
                </Text>
                <Button
                  label={t('withdraw')}
                  variant="secondary"
                  loading={withdraw.isPending}
                  onPress={() => setConfirmingWithdraw(true)}
                />
              </YStack>
            </Card>
          ) : (
            <Card>
              <YStack gap={space.sm}>
                <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                  {t('confirmTitle')}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t('confirmBody')}
                </Text>

                <YStack gap={space.xs}>
                  {ITEMS.map((item) => (
                    <XStack key={item} ai="center" gap={space.xs}>
                      <Ionicons name="close-circle" size={iconSize.sm} color={colors.danger} />
                      <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                        {t(`items.${item}` as never)}
                      </Text>
                    </XStack>
                  ))}
                </YStack>

                <Text col={colors.placeholder} fos={fontSize.label}>
                  {t('retentionNote')}
                </Text>

                {/*
                  Ô tick tự dựng: app chưa có `CheckboxField` nối với React Hook Form, và một
                  component dùng chung chỉ vì MỘT màn là suy đoán. Hàng vẫn giữ đúng vùng chạm
                  44pt và vai `checkbox` cho trình đọc màn hình, y như `LegalConsentCheckbox`.
                */}
                <Controller
                  control={control}
                  name="acknowledged"
                  render={({ field, fieldState }) => (
                    <YStack gap={2}>
                      <Pressable
                        onPress={() => !openCase.isPending && field.onChange(!field.value)}
                        accessibilityRole="checkbox"
                        accessibilityState={{ checked: field.value }}
                        accessibilityLabel={t('acknowledge')}
                      >
                        <XStack
                          ai="flex-start"
                          gap={space.sm}
                          minHeight={sizing.touchTarget}
                          py={space.xs}
                        >
                          <YStack pt={2}>
                            <CheckMark checked={field.value} />
                          </YStack>
                          <Text f={1} col={colors.text} fos={fontSize.bodySm}>
                            {t('acknowledge')}
                          </Text>
                        </XStack>
                      </Pressable>
                      {fieldState.error?.message ? (
                        <Text col={colors.danger} fos={fontSize.label}>
                          {fieldState.error.message}
                        </Text>
                      ) : null}
                    </YStack>
                  )}
                />

                <Button
                  label={t('submit')}
                  variant="danger"
                  icon="trash-outline"
                  loading={openCase.isPending}
                  disabled={!formState.isValid}
                  onPress={() => void onSubmit()}
                />
                <Button
                  label={t('reset')}
                  variant="ghost"
                  disabled={!formState.isDirty || openCase.isPending}
                  onPress={() => reset()}
                />
              </YStack>
            </Card>
          )}
        </YStack>
      </Screen>

      <AlertDialog
        open={confirmingWithdraw}
        title={t('withdraw')}
        message={t('withdrawConfirm')}
        confirmLabel={tCommon('confirm')}
        cancelLabel={tCommon('cancel')}
        loading={withdraw.isPending}
        onCancel={() => setConfirmingWithdraw(false)}
        onConfirm={() => {
          if (!pending) return;
          withdraw.mutate(pending.id, {
            onSuccess: () => toast.showSuccess(t('withdrawn')),
            onError: (err) => toast.showError(errorMessage(err)),
            onSettled: () => setConfirmingWithdraw(false),
          });
        }}
      />
    </>
  );
}
