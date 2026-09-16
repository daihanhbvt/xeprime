import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { useTranslations } from 'use-intl';
import {
  SELLER_ENTITY_TYPE_VALUES,
  SELLER_PROFILE_STATUS,
  SELLER_PROFILE_STATUS_META,
  type SellerProfileStatus,
} from '@xeprime/types';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { DateField } from '@/components/ui/DateField';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { RadioField } from '@/components/ui/RadioField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { ManageHeader } from '@/features/shell/ManageHeader';
import { ManagePageTitle } from '@/features/shell/ManagePageTitle';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, space } from '@/theme/tokens';
import type { SellerProfile } from './api';
import {
  useSaveSellerProfile,
  useSellerProfile,
  useSubmitSellerProfile,
} from './hooks/use-seller-profile';
import { buildSellerProfileSchema, type SellerProfileFormValues } from './schema';

/**
 * Nhãn của một trường còn thiếu. Khoá của `t()` phải TĨNH, nên mã từ server đi qua bảng tra này
 * chứ không ghép chuỗi — mã lạ hiện lại chính nó thay vì nổ giữa màn hình.
 */
function missingFieldLabel(
  t: ReturnType<typeof useTranslations<'SellerProfile'>>,
  field: string,
): string {
  switch (field) {
    case 'legalName':
      return t('form.missingField.legalName');
    case 'bankCode':
      return t('form.missingField.bankCode');
    case 'bankAccountNumber':
      return t('form.missingField.bankAccountNumber');
    case 'bankAccountName':
      return t('form.missingField.bankAccountName');
    case 'idNumber':
      return t('form.missingField.idNumber');
    case 'taxId':
      return t('form.missingField.taxId');
    default:
      return field;
  }
}

function toValues(profile: SellerProfile): SellerProfileFormValues {
  return {
    entityType: profile.entityType as SellerProfileFormValues['entityType'],
    legalName: profile.legalName ?? '',
    taxId: profile.taxId ?? '',
    idNumber: profile.idNumber ?? '',
    idIssuedAt: profile.idIssuedAt ?? null,
    idIssuedBy: profile.idIssuedBy ?? '',
    bankCode: profile.bankCode ?? '',
    bankAccountNumber: profile.bankAccountNumber ?? '',
    bankAccountName: profile.bankAccountName ?? '',
  };
}

/**
 * Hồ sơ người bán của gian hàng (ADR 0028 release gate 1) — bản native của
 * `SellerProfileWorkspace`.
 *
 * Bộ CƠ BẢN (ADR 0027 điều 1): backend không gắn `@RequiresFeature`, và màn này không kiểm gói —
 * mọi gian hàng, kể cả tuyến hoa hồng chưa mua gì, đều khai được danh tính và tài khoản nhận
 * tiền. "Đủ để gửi xác minh" là quy tắc SERVER trả về (`missingFields`); form chỉ hiển thị lại
 * chứ không tự đoán.
 *
 * Quyền do guard backend quyết (`seller_profile.view` / `.manage`); `ScopeGuard` + mục menu đã
 * lọc trước nên ở đây không dựng thêm một lớp kiểm thứ ba — `profile.editable` của server là thứ
 * khoá form lại.
 */
export function SellerProfileScreen() {
  const t = useTranslations('SellerProfile');
  const tCommon = useTranslations('Common.actions');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();

  const profileQuery = useSellerProfile();
  const save = useSaveSellerProfile();
  const submit = useSubmitSellerProfile();
  const profile = profileQuery.data;

  const schema = useMemo(
    () =>
      buildSellerProfileSchema({
        taxId: t('form.validation.taxId'),
        idNumber: t('form.validation.idNumber'),
        bankCode: t('form.validation.bankCode'),
        bankAccountNumber: t('form.validation.bankAccountNumber'),
      }),
    [t],
  );

  const { control, handleSubmit, formState, reset } = useForm<SellerProfileFormValues>({
    resolver: yupResolver(schema),
    values: profile ? toValues(profile) : undefined,
  });

  if (profileQuery.isLoading) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']}>
          <ManagePageTitle title={t('page.title')} subtitle={t('page.subtitle')} />
          <MiniRowsSkeleton rows={6} />
        </Screen>
      </>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <>
        <ManageHeader />
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={profileQuery.error}
            title={t('page.loadError')}
            onRetry={() => void profileQuery.refetch()}
          />
        </Screen>
      </>
    );
  }

  const readOnly = !profile.editable;
  const dirty = formState.isDirty && !readOnly;
  const canSubmit = profile.missingFields.length === 0 && !readOnly;

  const onSave = handleSubmit((values) => {
    save.mutate(
      {
        entityType: values.entityType,
        legalName: values.legalName || null,
        taxId: values.taxId || null,
        idNumber: values.idNumber || null,
        idIssuedAt: values.idIssuedAt || null,
        idIssuedBy: values.idIssuedBy || null,
        bankCode: values.bankCode || null,
        bankAccountNumber: values.bankAccountNumber || null,
        bankAccountName: values.bankAccountName || null,
      },
      {
        onSuccess: () => toast.showSuccess(t('form.saved')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <>
      <ManageHeader />
      <Screen edges={['left', 'right', 'bottom']}>
        <ManagePageTitle
          title={t('page.title')}
          subtitle={t('page.subtitle')}
          action={
            <StatusBadge
              label={domainLabel('sellerProfileStatus', profile.status)}
              color={SELLER_PROFILE_STATUS_META[profile.status as SellerProfileStatus].color}
              size="sm"
            />
          }
        />

        <YStack gap={space.md}>
          {profile.status === SELLER_PROFILE_STATUS.CHANGES_REQUESTED && profile.reviewNote ? (
            <Callout tone="warning" title={t('page.changesRequested')}>
              {profile.reviewNote}
            </Callout>
          ) : null}
          {profile.status === SELLER_PROFILE_STATUS.REJECTED && profile.reviewNote ? (
            <Callout tone="danger" title={t('page.rejected')}>
              {profile.reviewNote}
            </Callout>
          ) : null}
          {profile.status === SELLER_PROFILE_STATUS.SUBMITTED ? (
            <Callout tone="info">{t('page.pendingReview')}</Callout>
          ) : null}
          {profile.status === SELLER_PROFILE_STATUS.VERIFIED ? (
            <Callout tone="success">{t('page.verified')}</Callout>
          ) : null}
          {readOnly ? <Callout tone="info">{t('page.readOnly')}</Callout> : null}

          <Card>
            <YStack gap={space.md}>
              <RadioField
                control={control}
                name="entityType"
                label={t('form.entityType')}
                required
                disabled={readOnly || save.isPending}
                options={SELLER_ENTITY_TYPE_VALUES.map((value) => ({
                  value,
                  label: domainLabel('sellerEntityType', value),
                }))}
              />
              <TextField
                control={control}
                name="legalName"
                label={t('form.legalName')}
                autoComplete="name"
                editable={!readOnly && !save.isPending}
              />
              <TextField
                control={control}
                name="taxId"
                label={t('form.taxId')}
                hint={t('form.taxIdHint')}
                keyboardType="number-pad"
                editable={!readOnly && !save.isPending}
              />
              <TextField
                control={control}
                name="idNumber"
                label={t('form.idNumber')}
                autoCapitalize="characters"
                editable={!readOnly && !save.isPending}
              />
              <DateField
                control={control}
                name="idIssuedAt"
                label={t('form.idIssuedAt')}
                disabled={readOnly || save.isPending}
              />
              <TextField
                control={control}
                name="idIssuedBy"
                label={t('form.idIssuedBy')}
                editable={!readOnly && !save.isPending}
              />
            </YStack>
          </Card>

          {/*
            Tài khoản NHẬN TIỀN tách thành thẻ riêng: đây là phần quyết định tiền về đâu, và đổi
            nó trên một hồ sơ đã xác minh sẽ phải xác minh lại (docblock của controller).
          */}
          <Card>
            <YStack gap={space.md}>
              <TextField
                control={control}
                name="bankCode"
                label={t('form.bankCode')}
                hint={t('form.bankCodeHint')}
                autoCapitalize="characters"
                editable={!readOnly && !save.isPending}
              />
              <TextField
                control={control}
                name="bankAccountNumber"
                label={t('form.bankAccountNumber')}
                keyboardType="number-pad"
                editable={!readOnly && !save.isPending}
              />
              <TextField
                control={control}
                name="bankAccountName"
                label={t('form.bankAccountName')}
                autoCapitalize="characters"
                editable={!readOnly && !save.isPending}
              />
            </YStack>
          </Card>

          {!readOnly && profile.missingFields.length > 0 ? (
            <Callout
              tone="warning"
              title={t('form.missingFields', { count: profile.missingFields.length })}
            >
              {profile.missingFields.map((field) => missingFieldLabel(t, field)).join(LIST_SEPARATOR)}
            </Callout>
          ) : null}

          {!readOnly ? (
            <YStack gap={space.sm}>
              <XStack gap={space.sm}>
                {dirty ? (
                  <YStack flexShrink={0}>
                    <Button
                      label={t('form.reset')}
                      icon="refresh-outline"
                      variant="ghost"
                      disabled={save.isPending}
                      onPress={() => reset()}
                    />
                  </YStack>
                ) : null}
                <YStack f={1}>
                  <Button
                    label={tCommon('save')}
                    icon="checkmark-outline"
                    loading={save.isPending}
                    disabled={!dirty}
                    onPress={() => void onSave()}
                  />
                </YStack>
              </XStack>

              <Button
                label={t('form.submitForReview')}
                variant="secondary"
                icon="send-outline"
                loading={submit.isPending}
                // Còn thay đổi chưa lưu thì gửi đi là gửi bản CŨ — khoá nút, và nói rõ vì sao.
                disabled={!canSubmit || dirty}
                onPress={() =>
                  submit.mutate(undefined, {
                    onSuccess: () => toast.showSuccess(t('form.submitted')),
                    onError: (err) => toast.showError(errorMessage(err)),
                  })
                }
              />
              {dirty ? (
                <Text col={colors.textMuted} fos={fontSize.label}>
                  {t('form.saveBeforeSubmit')}
                </Text>
              ) : null}
            </YStack>
          ) : null}
        </YStack>
      </Screen>
    </>
  );
}
