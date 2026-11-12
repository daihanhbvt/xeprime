'use client';

import { useTranslations } from 'next-intl';
import type { Control } from 'react-hook-form';
import { SELLER_ENTITY_TYPE_VALUES } from '@xeprime/types';

import { SelectField } from '@/components/form/SelectField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';

import type { SellerTaxFormValues } from '../hooks/use-seller-tax-form';

/**
 * Ba ô của "Thông tin khai thuế" - loại chủ thể, tên pháp lý, MST (hoặc CCCD với cá nhân). Dùng chung
 * cho section của hồ sơ chủ xe và hộp thoại của trang Thông tin cửa hàng.
 *
 * Ô CHỌN nhận `disabled` tường minh: `fieldset[disabled]` chỉ khoá ô NATIVE, còn ô chọn của AntD dựng
 * bằng div - không thì hồ sơ đã khoá vẫn đổi được loại chủ thể (và đổi luôn ô CCCD ↔ MST).
 */
export function SellerTaxFields({
  control,
  isIndividual,
  disabled,
}: {
  control: Control<SellerTaxFormValues>;
  isIndividual: boolean;
  disabled: boolean;
}) {
  const t = useTranslations('Account.tax');
  const tSeller = useTranslations('SellerProfile');
  const domainLabel = useDomainLabel();

  return (
    <>
      <SelectField
        control={control}
        name="entityType"
        label={t('entityType')}
        disabled={disabled}
        required
        options={SELLER_ENTITY_TYPE_VALUES.map((value) => ({
          value,
          label: domainLabel('sellerEntityType', value),
        }))}
        help={t('entityHint')}
      />

      <TextField
        control={control}
        name="legalName"
        label={isIndividual ? t('legalName') : t('legalNameBusiness')}
        autoComplete="name"
      />

      {isIndividual ? (
        <TextField
          control={control}
          name="idNumber"
          label={t('idNumber')}
          help={t('idNumberHint')}
        />
      ) : (
        <TextField
          control={control}
          name="taxId"
          label={t('taxId')}
          help={tSeller('form.taxIdHint')}
        />
      )}
    </>
  );
}
