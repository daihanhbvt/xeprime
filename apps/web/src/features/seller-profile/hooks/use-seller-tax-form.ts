'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { PERMISSION, SELLER_ENTITY_TYPE } from '@xeprime/types';

import { usePermissions } from '@/hooks/use-permissions';
import { useErrorMessage } from '@/i18n/use-error-message';

import { profileToSaveInput } from '../mappers';
import { buildSellerProfileSchema, type SellerProfileFormValues } from '../schema';
import type { SellerProfile } from '../types';
import { useSaveSellerProfile } from './use-seller-profile';

export type SellerTaxFormValues = Pick<
  SellerProfileFormValues,
  'entityType' | 'legalName' | 'taxId' | 'idNumber'
>;

const FIELDS: readonly (keyof SellerTaxFormValues)[] = [
  'entityType',
  'legalName',
  'taxId',
  'idNumber',
];

function toValues(profile: SellerProfile): SellerTaxFormValues {
  return {
    entityType: profile.entityType as SellerTaxFormValues['entityType'],
    legalName: profile.legalName ?? '',
    taxId: profile.taxId ?? '',
    idNumber: profile.idNumber ?? '',
  };
}

/**
 * Form "Thông tin khai thuế" — MỘT định nghĩa cho hai chỗ: section của "Hồ sơ chủ xe"
 * (`SellerTaxSection`) và hộp thoại của trang Thông tin cửa hàng (`ShopTaxCard`). Cả hai ghi vào
 * hồ sơ NGƯỜI BÁN — nguồn duy nhất của mã số thuế mà hợp đồng và báo cáo thuế đọc.
 *
 * Gửi BẢN ĐẦY ĐỦ của hồ sơ rồi đè bốn trường của form: màn này không hiện mọi trường của hồ sơ
 * người bán, và một PUT chỉ có bốn trường sẽ xoá phần còn lại.
 */
export function useSellerTaxForm(profile: SellerProfile | undefined) {
  const t = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const { has } = usePermissions();
  const save = useSaveSellerProfile();

  const schema = useMemo(
    () =>
      buildSellerProfileSchema({
        taxId: tSeller('form.validation.taxId'),
        idNumber: tSeller('form.validation.idNumber'),
      }).pick(FIELDS),
    [tSeller],
  );
  const form = useForm<SellerTaxFormValues>({
    resolver: yupResolver(schema),
    values: profile ? toValues(profile) : undefined,
  });
  const entityType = useWatch({ control: form.control, name: 'entityType' });

  const readOnly = !profile?.editable || !has(PERMISSION.SELLER_PROFILE_MANAGE);

  /** Lưu; `onSaved` chạy SAU khi server nhận (hộp thoại đóng ở đây, không trước). */
  const submit = (onSaved?: () => void) =>
    form.handleSubmit((values) => {
      // Enter vẫn submit form khi nút Lưu đang quay — chặn lượt thứ hai ở đây.
      if (!profile || save.isPending) return;
      save.mutate(
        {
          ...profileToSaveInput(profile),
          entityType: values.entityType,
          legalName: values.legalName || null,
          taxId: values.taxId || null,
          idNumber: values.idNumber || null,
        },
        {
          onSuccess: () => {
            message.success(t('saved'));
            onSaved?.();
          },
          // Câu lỗi tra từ MÃ (ADR 0012), không hiện `message` tiếng Việt của backend.
          onError: (err) => message.error(errorMessage(err)),
        },
      );
    });

  return {
    form,
    isIndividual: entityType === SELLER_ENTITY_TYPE.INDIVIDUAL,
    readOnly,
    dirty: form.formState.isDirty && !readOnly,
    saving: save.isPending,
    submit,
  };
}
