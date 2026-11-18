'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { App, Badge, Button, Tabs } from 'antd';
import { useTranslations } from 'next-intl';
import {
  INSURANCE_PREMIUM_BASIS,
  INSURANCE_SERVICE_FEE_PERCENT_MAX,
  insurancePremiumTiersProblem,
} from '@xeprime/types';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { InfoHint } from '@/components/data-display/InfoHint';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { PercentSliderField } from '@/components/form/PercentSliderField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useLocalizedText } from '@/i18n/localized';
import { useErrorMessage } from '@/i18n/use-error-message';
import {
  AGENCY_COMMISSION_PERCENT_MAX,
  INSURANCE_DISPLAY_ORDER_MAX,
  INSURANCE_DISPLAY_ORDER_MIN,
  INSURANCE_PRODUCT_FORM_TAB,
  buildInsuranceProductSchema,
  insuranceProductFormDefaults,
  insuranceProductFormTabErrors,
  insuranceProductFormTabs,
  offersServiceFee,
  premiumLocked,
  toUpdateInsuranceProductBody,
  type InsuranceProductFormTab,
  type InsuranceProductFormValues,
} from '../form';
import { useUpdateInsuranceProduct } from '../hooks';
import { newestBand, premiumConfigOf } from '../premium-plan';
import type { InsuranceProduct } from '../types';
import { PremiumSyncNotice } from './PremiumSyncNotice';
import { PremiumTiersField } from './PremiumTiersField';
import { PremiumYearBandsField } from './PremiumYearBandsField';
import { ProductPremiumPreview } from './ProductPremiumPreview';
import styles from './InsuranceProductFormDialog.module.css';

/** Mẫu gợi ý trong ô URL GCN — chuỗi kỹ thuật, không dịch. */
const CERTIFICATE_URL_PLACEHOLDER = 'https://…/{certCode}';

/**
 * Sửa MỘT sản phẩm bảo hiểm (ADR 0064 · 0088 · 0091 · 0097). Schema, mặc định, payload và bản đồ
 * tab ↔ trường nằm ở `../form.ts`.
 *
 * Bố cục theo VIỆC admin làm, mỗi việc một tab:
 *  - **Biểu phí & thu hộ** (chỉ sản phẩm có bậc phí / phí thu hộ): bảng bậc dạng lưới, % thu hộ và
 *    hoa hồng bằng thanh kéo; cạnh đó là bảng xem trước theo số đang sửa.
 *  - **Nội dung hiển thị**: tên và quyền lợi, tiếng Việt | tiếng Anh song song.
 *  - **Khấu trừ & bồi thường**: ô tô | xe máy song song, ô trống = không áp dụng.
 *  - **Vận hành**: bật/tắt, thứ tự, mã MIC, hotline, mẫu URL GCN.
 * Lời giải thích dài nằm trong dấu ⓘ. Tab có lỗi mang số lỗi; bấm lưu khi có lỗi thì nhảy tới tab lỗi đầu tiên.
 *
 * Người gọi gắn `key={product.id}`: `defaultValues` của RHF chỉ đọc một lần, nên tái dùng một
 * instance sẽ mở form của sản phẩm B với số của sản phẩm A.
 */
export function InsuranceProductFormDialog({
  product,
  onClose,
}: {
  /** `null` = đóng. */
  product: InsuranceProduct | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminInsurance.form');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const localized = useLocalizedText();
  const update = useUpdateInsuranceProduct();
  const tabs = insuranceProductFormTabs(product);
  const [tab, setTab] = useState<InsuranceProductFormTab>(
    tabs[0] ?? INSURANCE_PRODUCT_FORM_TAB.CONTENT,
  );
  const valueTier = product?.premiumBasis === INSURANCE_PREMIUM_BASIS.VALUE_TIER;
  const withServiceFee = offersServiceFee(product);

  const schema = useMemo(
    () =>
      buildInsuranceProductSchema({
        required: t('validation.required'),
        tooShort: (min) => t('validation.tooShort', { min }),
        tooLong: (max) => t('validation.tooLong', { max }),
        amountMin: t('validation.amountMin'),
        amountMax: t('validation.amountMax'),
        amountStep: t('validation.amountStep'),
        urlTemplate: t('validation.urlTemplate'),
        displayOrder: (min, max) => t('validation.displayOrder', { min, max }),
        tiers: t('validation.tiers'),
        bands: t('validation.bands'),
        serviceFeePercent: (max) => t('validation.serviceFeePercent', { max }),
        serviceFeePercentRequired: t('validation.serviceFeePercentRequired'),
        agencyCommissionPercent: (max) => t('validation.agencyCommissionPercent', { max }),
      }),
    [t],
  );

  const {
    control,
    handleSubmit,
    getValues,
    setValue,
    formState: { errors },
  } = useForm<InsuranceProductFormValues>({
    resolver: yupResolver(schema),
    defaultValues: product ? insuranceProductFormDefaults(product) : undefined,
  });
  const tabErrors = insuranceProductFormTabErrors(errors);

  /*
   * Xem trước bảng phí theo số ĐANG SỬA (ADR 0097). Biểu phí đang gõ dở (sai luật) ⇒ `null`, khung
   * xem trước nói rõ vì sao thay vì vẽ một bảng sai.
   */
  const [watchedTiers, watchedBands, serviceFeeEnabledValue, watchedServiceFee, watchedCommission] =
    useWatch({
      control,
      name: [
        'premiumTiers',
        'premiumYearBands',
        'serviceFeeEnabled',
        'serviceFeePercent',
        'agencyCommissionPercent',
      ],
    });
  const serviceFeeEnabled = serviceFeeEnabledValue === true;
  /*
   * Biểu phí theo năm sản xuất (ADR 0106): đồng bộ từ hãng thì KHOÁ; có nhóm năm thì sửa % từng nhóm,
   * xem trước theo nhóm mới nhất (cùng % với biểu phí chung).
   */
  const locked = premiumLocked(product);
  const bandRows = watchedBands ?? [];
  const hasBands = bandRows.length > 0;
  const newest = hasBands
    ? newestBand(
        bandRows.map((b) => ({
          yearFrom: b.yearFrom ?? null,
          yearTo: b.yearTo ?? null,
          percents: b.percents.map((x) => String(x ?? '')),
        })),
      )
    : null;
  const previewTiers = (watchedTiers ?? []).map((tier, i) => ({
    maxDays: Number(tier.maxDays),
    percent: String((newest ? newest.percents[i] : tier.percent) ?? '').trim(),
  }));
  /** Bỏ nhóm năm: một biểu phí cho mọi năm, lấy % của nhóm mới nhất làm điểm bắt đầu. */
  const collapseBands = () => {
    const tiers = getValues('premiumTiers').map((tier, i) => ({
      ...tier,
      percent: newest?.percents[i] ?? tier.percent,
    }));
    setValue('premiumTiers', tiers, { shouldDirty: true });
    setValue('premiumYearBands', [], { shouldDirty: true, shouldValidate: true });
  };
  const preview =
    valueTier && previewTiers.length > 0 && insurancePremiumTiersProblem(previewTiers) === null
      ? premiumConfigOf({
          premiumTiers: previewTiers,
          serviceFeeEnabled,
          serviceFeePercent: Number(watchedServiceFee) || 0,
          agencyCommissionPercent: Number(watchedCommission) || 0,
        })
      : null;

  const onSubmit = handleSubmit(
    (form) => {
      // Enter gửi form ngay cả khi nút OK đang quay — chặn lượt thứ hai ở đây.
      if (!product || update.isPending) return;
      update.mutate(
        { id: product.id, body: toUpdateInsuranceProductBody(form, product) },
        {
          onSuccess: (saved) => {
            message.success(t('saved', { name: localized(saved.nameVi, saved.nameEn) }));
            onClose();
          },
          onError: (err) => message.error(errorMessage(err)),
        },
      );
    },
    (invalid) => {
      // Lỗi nằm ở tab đang khuất thì nút lưu như "không làm gì" — kéo người dùng tới đó.
      const counts = insuranceProductFormTabErrors(invalid);
      const first = tabs.find((key) => counts[key] > 0);
      if (first) setTab(first);
    },
  );

  const panels: Record<InsuranceProductFormTab, ReactNode> = {
    pricing: (
      <div className={valueTier ? styles.pricingGrid : styles.panel}>
        <div className={styles.panel}>
          {/* Phí theo ngày (ADR 0098 — chuyển từ chính sách phí về chính sản phẩm). */}
          {product?.premiumBasis === INSURANCE_PREMIUM_BASIS.DAILY ? (
            <FormSection
              title={t('sections.daily')}
              hint={t('help.dailyAmount')}
              hintLabel={t('hints.daily')}
            >
              <div className={styles.grid2}>
                <NumberField
                  control={control}
                  name="dailyAmountCar"
                  label={t('fields.dailyAmountCar')}
                  placeholder={t('placeholders.notSold')}
                  money
                  min={0}
                />
                <NumberField
                  control={control}
                  name="dailyAmountMotorbike"
                  label={t('fields.dailyAmountMotorbike')}
                  placeholder={t('placeholders.notSold')}
                  money
                  min={0}
                />
              </div>
            </FormSection>
          ) : null}
          {valueTier ? (
            <FormSection
              title={t('sections.premium')}
              hint={t('help.premiumTiersHint')}
              hintLabel={t('hints.premium')}
            >
              <PremiumSyncNotice product={product} />
              {locked || hasBands ? (
                <PremiumYearBandsField control={control} readOnly={locked} />
              ) : (
                <PremiumTiersField control={control} />
              )}
              {!locked && hasBands ? (
                <Button type="link" className={styles.inlineAction} onClick={collapseBands}>
                  {t('actions.collapseBands')}
                </Button>
              ) : null}
            </FormSection>
          ) : null}
          {withServiceFee ? (
            <FormSection title={t('sections.serviceFee')}>
              <SwitchField
                control={control}
                name="serviceFeeEnabled"
                label={t('fields.serviceFeeEnabled')}
                labelExtra={
                  <InfoHint
                    content={t('fields.serviceFeeEnabledDescription')}
                    label={t('hints.serviceFee')}
                  />
                }
              />
              <PercentSliderField
                control={control}
                name="serviceFeePercent"
                label={t('fields.serviceFeePercent')}
                labelAccessory={
                  <InfoHint
                    content={t('help.serviceFeePercent')}
                    label={t('hints.serviceFeePercent')}
                  />
                }
                max={INSURANCE_SERVICE_FEE_PERCENT_MAX}
                disabled={!serviceFeeEnabled}
                required={serviceFeeEnabled}
              />
              <PercentSliderField
                control={control}
                name="agencyCommissionPercent"
                label={t('fields.agencyCommissionPercent')}
                labelAccessory={
                  <InfoHint
                    content={t('help.agencyCommissionPercent')}
                    label={t('hints.agencyCommission')}
                  />
                }
                max={AGENCY_COMMISSION_PERCENT_MAX}
                required
              />
            </FormSection>
          ) : null}
        </div>
        {valueTier ? (
          <div className={styles.preview}>
            <ProductPremiumPreview config={preview} />
          </div>
        ) : null}
      </div>
    ),
    content: (
      <div className={styles.panel}>
        <FormSection title={t('sections.naming')}>
          <div className={styles.grid2}>
            <TextField control={control} name="nameVi" label={t('fields.nameVi')} required />
            <TextField control={control} name="nameEn" label={t('fields.nameEn')} required />
          </div>
        </FormSection>
        <FormSection title={t('sections.coverage')}>
          <div className={styles.grid2}>
            <TextAreaField
              control={control}
              name="coverageVi"
              label={t('fields.coverageVi')}
              rows={4}
              required
            />
            <TextAreaField
              control={control}
              name="coverageEn"
              label={t('fields.coverageEn')}
              rows={4}
              required
            />
          </div>
        </FormSection>
      </div>
    ),
    payout: (
      <div className={styles.panel}>
        <FormSection
          title={t('sections.amounts')}
          hint={t('help.amountEmpty')}
          hintLabel={t('hints.amounts')}
        >
          <div className={styles.grid2}>
            <NumberField
              control={control}
              name="deductibleCar"
              label={t('fields.deductibleCar')}
              placeholder={t('placeholders.notApplicable')}
              money
              min={0}
            />
            <NumberField
              control={control}
              name="deductibleMotorbike"
              label={t('fields.deductibleMotorbike')}
              placeholder={t('placeholders.notApplicable')}
              money
              min={0}
            />
            <NumberField
              control={control}
              name="maxPayoutCar"
              label={t('fields.maxPayoutCar')}
              placeholder={t('placeholders.notApplicable')}
              money
              min={0}
            />
            <NumberField
              control={control}
              name="maxPayoutMotorbike"
              label={t('fields.maxPayoutMotorbike')}
              placeholder={t('placeholders.notApplicable')}
              money
              min={0}
            />
          </div>
        </FormSection>
        <FormSection
          title={t('sections.payoutNote')}
          hint={t('help.maxPayoutNote')}
          hintLabel={t('hints.payoutNote')}
        >
          <div className={styles.grid2}>
            <TextField
              control={control}
              name="maxPayoutNoteVi"
              label={t('fields.maxPayoutNoteVi')}
              placeholder={t('placeholders.maxPayoutNoteVi')}
            />
            <TextField
              control={control}
              name="maxPayoutNoteEn"
              label={t('fields.maxPayoutNoteEn')}
              placeholder={t('placeholders.maxPayoutNoteEn')}
            />
          </div>
        </FormSection>
      </div>
    ),
    operation: (
      <div className={styles.panel}>
        <FormSection title={t('sections.status')}>
          <SwitchField
            control={control}
            name="isActive"
            label={t('fields.isActive')}
            labelExtra={
              <InfoHint content={t('fields.isActiveDescription')} label={t('hints.isActive')} />
            }
          />
          <div className={styles.grid2}>
            <NumberField
              control={control}
              name="displayOrder"
              label={t('fields.displayOrder')}
              min={INSURANCE_DISPLAY_ORDER_MIN}
              max={INSURANCE_DISPLAY_ORDER_MAX}
              required
            />
          </div>
        </FormSection>
        <FormSection
          title={t('sections.partner')}
          hint={t('help.partnerSection')}
          hintLabel={t('hints.partner')}
        >
          <div className={styles.grid2}>
            <TextField
              control={control}
              name="partnerProductCode"
              label={t('fields.partnerProductCode')}
              required
            />
            <TextField
              control={control}
              name="claimHotline"
              label={t('fields.claimHotline')}
              type="tel"
            />
          </div>
          <TextField
            control={control}
            name="certificateUrlTemplate"
            label={t('fields.certificateUrlTemplate')}
            placeholder={CERTIFICATE_URL_PLACEHOLDER}
            required
          />
        </FormSection>
      </div>
    ),
  };

  const title = product ? t('title', { name: localized(product.nameVi, product.nameEn) }) : '';

  return (
    <ResponsiveDialog
      title={
        <span className={styles.title}>
          {title}
          <InfoHint content={t('intro')} label={t('hints.intro')} />
        </span>
      }
      open={product !== null}
      onClose={onClose}
      size={valueTier ? 'xl' : 'lg'}
      okText={t('submit')}
      onOk={() => void onSubmit()}
      confirmLoading={update.isPending}
    >
      <DialogForm onSubmit={onSubmit} labelPosition="top">
        <Tabs
          className={styles.tabs}
          activeKey={tab}
          onChange={(key) => setTab(key as InsuranceProductFormTab)}
          items={tabs.map((key) => ({
            key,
            // Mọi tab dựng sẵn: ô ở tab khuất vẫn có trong DOM để focus được khi nhảy tới lỗi.
            forceRender: true,
            label: (
              <span className={styles.tabLabel}>
                {/* Sản phẩm không có phí thu hộ (tai nạn người) thì tab chỉ là "Biểu phí". */}
                {key === INSURANCE_PRODUCT_FORM_TAB.PRICING && !withServiceFee
                  ? t('tabs.premiumOnly')
                  : t(`tabs.${key}`)}
                {tabErrors[key] > 0 ? (
                  <Badge
                    count={tabErrors[key]}
                    size="small"
                    title={t('tabErrors', { count: tabErrors[key] })}
                  />
                ) : null}
              </span>
            ),
            children: panels[key],
          }))}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}

/** Một khối trong tab: tiêu đề nhỏ (+ ⓘ khi có lời giải thích), ô nhập bên dưới. */
function FormSection({
  title,
  hint,
  hintLabel,
  children,
}: {
  title: string;
  hint?: ReactNode;
  hintLabel?: string;
  children: ReactNode;
}) {
  return (
    <section className={styles.section}>
      <div className={styles.sectionHead}>
        <h3 className={styles.sectionTitle}>{title}</h3>
        {hint && hintLabel ? <InfoHint content={hint} label={hintLabel} /> : null}
      </div>
      {children}
    </section>
  );
}
