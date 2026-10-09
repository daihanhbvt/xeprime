import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  SELLER_ENTITY_TYPE,
  SELLER_ENTITY_TYPE_VALUES,
  SELLER_PROFILE_STATUS,
} from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import { profileToSaveInput, type SellerProfile } from '../api';
import { useSaveSellerProfile } from '../hooks/use-seller-profile';
import { TAX_FIELDS, buildSellerProfileSchema, type TaxFormValues } from '../schema';

function toValues(profile: SellerProfile): TaxFormValues {
  return {
    entityType: profile.entityType as TaxFormValues['entityType'],
    legalName: profile.legalName ?? '',
    taxId: profile.taxId ?? '',
    idNumber: profile.idNumber ?? '',
  };
}

/**
 * Biểu mẫu "Thông tin khai thuế" — bốn trường của hồ sơ người bán, MỘT bản cho hai chỗ dùng:
 * màn `TaxScreen` (chủ xe tuyến hoa hồng) và khối `SellerTaxSection` của trang Cửa hàng (gian
 * hàng tuyến gói — web PR #159 `SellerTaxSection`). Hai bản chép là hai bộ luật "ghi toàn phần"
 * và hai cách khoá ô sẽ trôi khỏi nhau.
 *
 * - `PUT /seller-profile` là ghi TOÀN PHẦN — payload bắt đầu từ `profileToSaveInput(profile)` rồi
 *   mới ghi đè bốn trường ở đây, để lưu tên không xoá tài khoản ngân hàng đã khai ở hồ sơ đầy đủ.
 * - Chỉ-xem khi hồ sơ đã khoá (`editable = false`) hoặc thiếu `seller_profile.manage`.
 *
 * `fieldsFooter` chen dưới các ô (màn chủ xe giải thích "loại hình cư trú"); `children` nằm giữa
 * thẻ và nút Lưu.
 */
export function SellerTaxForm({
  profile,
  fieldsFooter,
  children,
}: {
  profile: SellerProfile;
  fieldsFooter?: ReactNode;
  children?: ReactNode;
}) {
  const t = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const canManage = has(PERMISSION.SELLER_PROFILE_MANAGE);
  const save = useSaveSellerProfile();

  /** Danh sách cố định — dựng lại mỗi render là dựng lại cả khi người dùng chỉ gõ một ký tự. */
  const entityTypeOptions = useMemo(
    () =>
      SELLER_ENTITY_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('sellerEntityType', value),
      })),
    [domainLabel],
  );

  /*
   * `.pick` của schema ĐẦY ĐỦ, không phải schema thứ hai: hai bộ regex cho cùng một mã số thuế
   * sẽ trôi khỏi nhau ngay lần sửa đầu. Cùng cách web làm.
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
    values: toValues(profile),
  });
  const entityType = useWatch({ control, name: 'entityType' });
  const isIndividual = entityType === SELLER_ENTITY_TYPE.INDIVIDUAL;

  const readOnly = !profile.editable || !canManage;
  const dirty = formState.isDirty && !readOnly;
  const locked = readOnly || save.isPending;

  const onSave = handleSubmit((values) => {
    if (save.isPending) return;
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
            disabled={locked}
            options={entityTypeOptions}
            hint={t('entityHint')}
          />

          {fieldsFooter}

          <TextField
            control={control}
            name="legalName"
            label={isIndividual ? t('legalName') : t('legalNameBusiness')}
            autoComplete="name"
            editable={!locked}
          />

          {isIndividual ? (
            <TextField
              control={control}
              name="idNumber"
              label={t('idNumber')}
              hint={t('idNumberHint')}
              autoCapitalize="characters"
              editable={!locked}
            />
          ) : (
            <TextField
              control={control}
              name="taxId"
              label={t('taxId')}
              hint={tSeller('form.taxIdHint')}
              keyboardType="number-pad"
              editable={!locked}
            />
          )}
        </YStack>
      </Card>

      {children}

      {!readOnly ? (
        <XStack gap={space.sm}>
          {/* Chưa sửa gì thì không có gì để huỷ — nút không tồn tại, chứ không phải mờ đi. */}
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
  );
}
