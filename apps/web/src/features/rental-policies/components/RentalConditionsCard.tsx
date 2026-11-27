'use client';

import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useController, type Control } from 'react-hook-form';
import { Form, Switch } from 'antd';
import { RENTAL_TERMS_GROUP, RENTAL_TERMS_GROUP_VALUES, type RentalTermsGroup } from '@xeprime/types';

import { SettingRow } from '@/components/form/SettingRow';
import { TextAreaField } from '@/components/form/TextAreaField';
import { ROUTES } from '@/constants/routes';
import { useAvailableHref } from '@/features/tenant-support/support-session';

import { useRentalConditionsText } from '../rental-conditions';
import { PolicySectionCard } from './ShopPolicyBlocks';
import type { ShopPolicyFormValues } from './ShopPolicyBlocks';
import { POLICY_NAV } from './PoliciesLayout';
import styles from './ShopPolicies.module.css';

/** Trần độ dài điều khoản - cùng số với DTO `SaveTenantRentalTermsItemDto`. */
export const RENTAL_TERMS_MAX_LENGTH = 4000;

/**
 * "Điều kiện cho thuê" (design `23874:75957`, ADR 0112 điều 3): hai nhóm Tự lái & Dài hạn · Có tài
 * xế. Giấy tờ và cách đối chiếu là LUẬT CHUẨN của nền tảng (`PLATFORM_RENTAL_CONDITIONS`) - chỉ hiện,
 * không ai sửa. Điều khoản + công tắc "khách xác nhận trước khi gửi yêu cầu" là của gian hàng, áp cho
 * mọi xe; lưu bằng `PUT /shop/rental-policies/terms` cùng nút Lưu của trang.
 */
export function RentalConditionsCard({
  control,
  disabled,
}: {
  control: Control<ShopPolicyFormValues>;
  disabled: boolean;
}) {
  const t = useTranslations('Shop.policies.workspace.conditions');
  return (
    <PolicySectionCard id={POLICY_NAV.CONDITIONS} title={t('title')}>
      {/* `disabled` của AntD Form tới cả ô điều khoản (TextAreaField không nhận prop riêng). */}
      <Form component={false} layout="vertical" colon={false} disabled={disabled}>
        {RENTAL_TERMS_GROUP_VALUES.map((group) => (
          <TermsGroup key={group} group={group} control={control} disabled={disabled} />
        ))}
      </Form>
    </PolicySectionCard>
  );
}

function TermsGroup({
  group,
  control,
  disabled,
}: {
  group: RentalTermsGroup;
  control: Control<ShopPolicyFormValues>;
  disabled: boolean;
}) {
  const t = useTranslations('Shop.policies.workspace.conditions');
  const rules = useRentalConditionsText();
  const available = useAvailableHref();
  const contracts = available(ROUTES.MANAGE.CONTRACTS_DOCUMENTS);
  const withDriver = group === RENTAL_TERMS_GROUP.WITH_DRIVER;
  const { field: accept } = useController({
    control,
    name: `terms.${group}.requireTermsAcceptance`,
  });

  return (
    <div className={styles.subCard}>
      <h3 className={styles.subTitle}>{t(`groups.${group}`)}</h3>
      <div className={styles.pairFields}>
        <div className={styles.readonlyField}>
          <span className={styles.readonlyLabel}>{t('documents')}</span>
          <span className={styles.readonlyValue}>{rules.documents}</span>
        </div>
        <div className={styles.readonlyField}>
          <span className={styles.readonlyLabel}>{t('verify')}</span>
          <span className={styles.readonlyValue}>{rules.verify}</span>
        </div>
      </div>
      <p className={styles.blockHint}>{t('platformNote')}</p>

      <SettingRow
        title={withDriver ? t('acceptTitleWithDriver') : t('acceptTitle')}
        description={
          <>
            {withDriver ? t('acceptHintWithDriver') : t('acceptHint')}
            {withDriver ? (
              <span className={styles.rowNote}>
                {t.rich('contractTemplate', {
                  link: (chunks) => (contracts ? <Link href={contracts}>{chunks}</Link> : chunks),
                })}
              </span>
            ) : null}
          </>
        }
        control={
          <Switch
            checked={accept.value === true}
            onChange={(next) => accept.onChange(next)}
            disabled={disabled}
            aria-label={withDriver ? t('acceptTitleWithDriver') : t('acceptTitle')}
          />
        }
      />

      <hr className={styles.divider} />

      <TextAreaField
        control={control}
        name={`terms.${group}.termsText`}
        label={withDriver ? t('termsTitleWithDriver') : t('termsTitle')}
        help={withDriver ? t('termsHintWithDriver') : t('termsHint')}
        placeholder={t('termsPlaceholder', { max: RENTAL_TERMS_MAX_LENGTH })}
        maxLength={RENTAL_TERMS_MAX_LENGTH}
        rows={4}
      />
    </div>
  );
}
