import { yupResolver } from '@hookform/resolvers/yup';
import { useRouter } from 'expo-router';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  SELLER_ENTITY_TYPE,
  SELLER_ENTITY_TYPE_VALUES,
  SELLER_PROFILE_STATUS,
  SELLER_PROFILE_STATUS_META,
  type SellerProfileStatus,
} from '@xeprime/types';
import { AppHeader } from '@/components/layout/AppHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MiniRowsSkeleton } from '@/components/ui/Skeleton';
import { SelectField } from '@/components/ui/SelectField';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextField } from '@/components/ui/TextField';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { APP_SCOPE } from '@/features/shell/app-scope';
import { useShellScope } from '@/features/shell/use-shell-scope';
import {
  useSaveSellerProfile,
  useSellerProfile,
} from '@/features/seller-profile/hooks/use-seller-profile';
import { profileToSaveInput, type SellerProfile } from '@/features/seller-profile/api';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { colors, fontSize, space } from '@/theme/tokens';
import {
  TAX_FIELDS,
  buildSellerProfileSchema,
  type TaxFormValues,
} from '@/features/seller-profile/schema';

function toValues(profile: SellerProfile): TaxFormValues {
  return {
    entityType: profile.entityType as TaxFormValues['entityType'],
    legalName: profile.legalName ?? '',
    taxId: profile.taxId ?? '',
    idNumber: profile.idNumber ?? '',
  };
}

/**
 * "Thông tin khai thuế" — bản COMPACT của hồ sơ người bán cho chủ xe. Bản native của
 * `SellerTaxCompactForm`.
 *
 * Cùng query, cùng mutation, cùng bốn trường và cùng quyền với bản web; chỉ hiện những gì model
 * THẬT có: loại chủ thể, tên pháp lý, và CCCD (cá nhân) hoặc mã số thuế (hộ kinh doanh/doanh
 * nghiệp).
 *
 * Ba điều cố ý, y như web:
 *  - `PUT /seller-profile` là ghi TOÀN PHẦN — payload bắt đầu từ `profileToSaveInput(profile)`
 *    rồi mới ghi đè bốn trường ở đây, để lưu tên không xoá tài khoản ngân hàng đã khai ở màn đầy đủ.
 *  - KHÔNG có ô "loại hình cư trú" và KHÔNG có tỷ lệ thuế nào: model chưa có trường cư trú, và
 *    phân loại/tỷ lệ production còn chờ tư vấn thuế (ADR 0028 điều 4).
 *  - Cổng chủ xe nằm ở route (`OwnerGate`), nên tới được đây đã là chủ gian hàng; phần kiểm ở
 *    đây là QUYỀN (`seller_profile.*`), thứ nhân sự cùng gian hàng cũng có thể thiếu.
 */
export function TaxScreen() {
  const t = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const router = useRouter();
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const { switchTo } = useShellScope();

  const canView = has(PERMISSION.SELLER_PROFILE_VIEW);
  const canManage = has(PERMISSION.SELLER_PROFILE_MANAGE);

  /** Danh sách cố định — dựng lại mỗi render là dựng lại cả khi người dùng chỉ gõ một ký tự. */
  const entityTypeOptions = useMemo(
    () =>
      SELLER_ENTITY_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('sellerEntityType', value),
      })),
    [domainLabel],
  );

  const profileQuery = useSellerProfile({ enabled: canView });
  const save = useSaveSellerProfile();
  const profile = profileQuery.data;

  /*
   * `.pick` của schema ĐẦY ĐỦ, không phải schema thứ hai: hai bộ regex cho cùng một mã số thuế
   * sẽ trôi khỏi nhau ngay lần sửa đầu. Cùng cách `SellerTaxCompactForm` bên web làm.
   */
  const schema = useMemo(
    () =>
      buildSellerProfileSchema({
        taxId: tSeller('form.validation.taxId'),
        idNumber: tSeller('form.validation.idNumber'),
      }).pick(TAX_FIELDS),
    [tSeller],
  );

  const { control, handleSubmit, formState, reset } = useForm<TaxFormValues>({
    resolver: yupResolver(schema),
    values: profile ? toValues(profile) : undefined,
  });
  const entityType = useWatch({ control, name: 'entityType' });
  const isIndividual = entityType === SELLER_ENTITY_TYPE.INDIVIDUAL;

  const header = (
    <AppHeader
      onBack={() => goBackOr(router, ROUTES.account.home())}
      title={t('title')}
      subtitle={t('subtitle')}
      {...(profile
        ? {
            badge: (
              <StatusBadge
                label={domainLabel('sellerProfileStatus', profile.status)}
                color={SELLER_PROFILE_STATUS_META[profile.status as SellerProfileStatus].color}
                size="sm"
              />
            ),
          }
        : {})}
    />
  );

  if (!canView) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={tSeller('page.noPermissionTitle')}
            description={tSeller('page.noPermission')}
            actionLabel={tSeller('page.backHome')}
            onAction={() => router.replace(ROUTES.account.home())}
          />
        </Screen>
      </>
    );
  }

  if (profileQuery.isLoading) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']}>
          <MiniRowsSkeleton rows={5} />
        </Screen>
      </>
    );
  }

  if (profileQuery.isError || !profile) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenError
            error={profileQuery.error}
            title={t('loadError')}
            onRetry={() => void profileQuery.refetch()}
          />
        </Screen>
      </>
    );
  }

  const readOnly = !profile.editable || !canManage;
  const dirty = formState.isDirty && !readOnly;

  const onSave = handleSubmit((values) => {
    save.mutate(
      {
        // Bản đầy đủ trước, bốn trường của màn này sau — không xoá phần màn này không hiện.
        ...profileToSaveInput(profile),
        entityType: values.entityType,
        legalName: values.legalName || null,
        taxId: values.taxId || null,
        idNumber: values.idNumber || null,
      },
      {
        onSuccess: () => toast.showSuccess(t('saved')),
        onError: (err) => toast.showError(errorMessage(err)),
      },
    );
  });

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.md}>
          {profile.status === SELLER_PROFILE_STATUS.CHANGES_REQUESTED && profile.reviewNote ? (
            <Callout tone="warning" title={tSeller('page.changesRequested')}>
              {profile.reviewNote}
            </Callout>
          ) : null}
          {profile.status === SELLER_PROFILE_STATUS.REJECTED && profile.reviewNote ? (
            <Callout tone="danger" title={tSeller('page.rejected')}>
              {profile.reviewNote}
            </Callout>
          ) : null}
          {profile.status === SELLER_PROFILE_STATUS.SUBMITTED ? (
            <Callout tone="info">{tSeller('page.pendingReview')}</Callout>
          ) : null}
          {profile.status === SELLER_PROFILE_STATUS.VERIFIED ? (
            <Callout tone="success">{tSeller('page.verified')}</Callout>
          ) : null}
          {!profile.editable ? (
            <Callout tone="info">{tSeller('page.readOnly')}</Callout>
          ) : !canManage ? (
            <Callout tone="info">{t('viewOnly')}</Callout>
          ) : null}

          <Card>
            <YStack gap={space.md}>
              <SelectField
                control={control}
                name="entityType"
                label={t('entityType')}
                required
                disabled={readOnly || save.isPending}
                options={entityTypeOptions}
                hint={t('entityHint')}
              />

              {/* Thông tin GIẢI THÍCH, không phải ô nhập: model chưa có trường cư trú. */}
              <Callout tone="info" title={t('residencyTitle')}>
                {t('residencyBody')}
              </Callout>

              <TextField
                control={control}
                name="legalName"
                label={isIndividual ? t('legalName') : t('legalNameBusiness')}
                autoComplete="name"
                editable={!readOnly && !save.isPending}
              />

              {isIndividual ? (
                <TextField
                  control={control}
                  name="idNumber"
                  label={t('idNumber')}
                  hint={t('idNumberHint')}
                  autoCapitalize="characters"
                  editable={!readOnly && !save.isPending}
                />
              ) : (
                <TextField
                  control={control}
                  name="taxId"
                  label={t('taxId')}
                  hint={tSeller('form.taxIdHint')}
                  keyboardType="number-pad"
                  editable={!readOnly && !save.isPending}
                />
              )}
            </YStack>
          </Card>

          {/*
            Cùng cặp câu + liên kết web đặt dưới form: bản compact chỉ sửa bốn trường, tài khoản
            nhận tiền và giấy tờ đầy đủ khai ở hồ sơ người bán. Liên kết ĐỔI KHU (`switchTo`) vì
            màn đó là một mục của cổng quản lý — push nó vào ngăn xếp khách sẽ để lại thanh tab
            khách nằm dưới một màn quản lý.
          */}
          <YStack gap={space.xs}>
            <Text col={colors.placeholder} fos={fontSize.label}>
              {t('fullProfile')}
            </Text>
            <Button
              label={t('openFullProfile')}
              variant="ghost"
              size="sm"
              block={false}
              icon="id-card-outline"
              onPress={() => switchTo(APP_SCOPE.MANAGE, ROUTES.manage.sellerProfile())}
            />
          </YStack>

          {!readOnly ? (
            <XStack gap={space.sm}>
              {dirty ? (
                <YStack flexShrink={0}>
                  <Button
                    label={tSeller('form.reset')}
                    icon="refresh-outline"
                    variant="ghost"
                    disabled={save.isPending}
                    onPress={() => reset()}
                  />
                </YStack>
              ) : null}
              <YStack f={1}>
                <Button
                  label={t('save')}
                  icon="checkmark-outline"
                  loading={save.isPending}
                  disabled={!dirty}
                  onPress={() => void onSave()}
                />
              </YStack>
            </XStack>
          ) : null}
        </YStack>
      </Screen>
    </>
  );
}
