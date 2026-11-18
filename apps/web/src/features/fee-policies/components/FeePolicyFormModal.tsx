'use client';

import { App, Alert, Badge, Button, Tabs } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch, type Resolver } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { DEPOSIT_PERCENT_MAX, DEPOSIT_PERCENT_MIN } from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { PercentSliderField } from '@/components/form/PercentSliderField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { firstTabWithError, tabErrorCounts } from '@/lib/form-tabs';
import {
  FEE_POLICY_AMOUNT_MAX,
  FEE_POLICY_FORM_TAB,
  FEE_POLICY_FORM_TABS,
  FEE_POLICY_FORM_TAB_FIELDS,
  buildFeePolicySchema,
  feePolicyFormDefaults,
  toUpsertFeePolicyBody,
  type FeePolicyFormTab,
  type FeePolicyFormValues,
} from '../form';
import {
  useActivateFeePolicy,
  useCreateFeePolicyDraft,
  useUpdateFeePolicyDraft,
} from '../hooks/use-fee-policies';
import type { FeePolicy } from '../types';
import { CommissionTiersField } from './CommissionTiersField';
import { PlatformFeeField } from './PlatformFeeField';
import { TaxRatesField } from './TaxRatesTable';
import styles from './FeePolicyFormModal.module.css';

/** Kết quả một lượt lưu — trang dùng để đưa người dùng tới đúng sổ. */
export interface FeePolicySaveResult {
  policy: FeePolicy;
  /** `true` khi đã áp dụng (kích hoạt) thành công ngay sau khi lưu. */
  applied: boolean;
}

/**
 * Sửa chính sách phí — luồng tiền v2 trên nền ADR 0028 điều 2–5, ADR 0029 (R3).
 *
 * Bản đang hiệu lực là BẤT BIẾN (backend chặn PATCH sau khi active; đơn đã tạo đóng băng số của
 * phiên bản đó — ADR 0024). Nên "sửa" luôn là soạn một BẢN NHÁP:
 *  - `policy`: sửa tiếp một bản nháp đã có.
 *  - `duplicateFrom`: bản nháp mới mang bộ số của một phiên bản (bản đang chạy khi bấm "Sửa chính
 *    sách", hoặc một bản cũ khi "Dùng lại"). `keepName` giữ nguyên tên — sửa số không đổi tên.
 *  - cả hai `null`: bản nháp trống.
 * Chân form có hai đường: "Lưu nháp" (xem lại sau) và "Lưu và áp dụng" (lưu rồi kích hoạt, có hỏi
 * lại). Kích hoạt hỏng (còn điều kiện chặn) thì bản nháp vẫn được giữ và người dùng được báo lỗi.
 *
 * Bố cục: tên + ghi chú luôn ở trên; số chia 4 tab (`FEE_POLICY_FORM_TAB`). Bảo hiểm không có tab
 * ở đây — nó quản lý ở Admin › Bảo hiểm (ADR 0098). Lời giải thích dài
 * nằm trong dấu ⓘ của từng khối. Tab có lỗi mang số lỗi; lưu khi có lỗi thì nhảy tới tab lỗi đầu.
 *
 * Nơi gọi phải đổi `key` theo bản ghi: form giữ state RHF suốt vòng đời, và một modal tái dùng sẽ
 * gửi số của bản A lên bản B.
 */
export function FeePolicyFormModal({
  open,
  policy,
  duplicateFrom = null,
  keepName = false,
  initialTab = FEE_POLICY_FORM_TAB.FEES,
  onClose,
  onSaved,
}: {
  open: boolean;
  /** Bản nháp đang sửa; `null` = tạo bản nháp mới. */
  policy: FeePolicy | null;
  /** Tạo mới bằng cách sao bộ số của phiên bản này. Bỏ qua khi `policy` có giá trị. */
  duplicateFrom?: FeePolicy | null;
  /** Giữ nguyên tên của `duplicateFrom` (sửa bản đang chạy) thay vì thêm "(bản sao)". */
  keepName?: boolean;
  initialTab?: FeePolicyFormTab;
  onClose: () => void;
  onSaved?: (result: FeePolicySaveResult) => void;
}) {
  const t = useTranslations('FeePolicies');
  const tCommon = useTranslations('Common');
  const { message, modal } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const create = useCreateFeePolicyDraft();
  const update = useUpdateFeePolicyDraft();
  const activate = useActivateFeePolicy();
  const [tab, setTab] = useState<FeePolicyFormTab>(initialTab);
  const [busy, setBusy] = useState<'draft' | 'apply' | null>(null);
  const source = policy ?? duplicateFrom;

  const schema = useMemo(
    () =>
      buildFeePolicySchema({
        nameRequired: t('form.validation.nameRequired'),
        required: t('form.validation.required'),
        range: t('form.validation.range'),
        nonNegative: t('form.validation.nonNegative'),
        integer: t('form.validation.integer'),
        thousandStep: t('form.validation.thousandStep'),
        ratePositive: t('form.validation.ratePositive'),
        taxRateRequired: t('form.validation.taxRateRequired'),
        taxLegalBasisRequired: t('form.validation.taxLegalBasisRequired'),
        partnerRequired: t('form.validation.partnerRequired'),
        limitOrder: t('form.validation.limitOrder'),
        suggestedInRange: t('form.validation.suggestedInRange'),
        blocker: (code) => domainLabel('feePolicyActivationBlocker', code),
      }),
    [t, domainLabel],
  );

  const defaultValues = useMemo(() => {
    const values = feePolicyFormDefaults(source);
    if (!policy && duplicateFrom && !keepName) {
      values.name = t('form.duplicateName', { name: duplicateFrom.name });
    }
    return values;
    // Giá trị khởi tạo chỉ đọc một lần — nơi gọi đổi `key` khi đổi bản ghi.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const {
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<FeePolicyFormValues>({
    // `yup.InferType` của schema có `.when` không khớp từng chữ với interface tay; schema vẫn là
    // nguồn kiểm, interface là hình dạng form.
    resolver: yupResolver(schema) as unknown as Resolver<FeePolicyFormValues>,
    defaultValues,
  });
  const tabErrors = tabErrorCounts(FEE_POLICY_FORM_TAB_FIELDS, errors);

  const taxEnabled = useWatch({ control, name: 'taxEnabled' });

  const pending = busy !== null || create.isPending || update.isPending || activate.isPending;

  /** Lưu nháp (tạo hoặc cập nhật). Trả bản đã lưu, `null` khi lỗi (đã báo). */
  async function saveDraft(values: FeePolicyFormValues): Promise<FeePolicy | null> {
    const body = toUpsertFeePolicyBody(values);
    try {
      return policy
        ? await update.mutateAsync({ id: policy.id, ...body })
        : await create.mutateAsync(body);
    } catch (err) {
      message.error(errorMessage(err));
      return null;
    }
  }

  const onInvalid = (invalid: typeof errors) => {
    const first = firstTabWithError(
      FEE_POLICY_FORM_TABS,
      tabErrorCounts(FEE_POLICY_FORM_TAB_FIELDS, invalid),
    );
    if (first) setTab(first);
  };

  const onSaveDraft = handleSubmit(async (values) => {
    // Enter vẫn gửi form khi nút đang quay — chặn lượt gửi thứ hai.
    if (pending) return;
    setBusy('draft');
    const saved = await saveDraft(values);
    setBusy(null);
    if (!saved) return;
    message.success(policy ? t('form.updatedSuccess') : t('form.createdSuccess'));
    onSaved?.({ policy: saved, applied: false });
    onClose();
  }, onInvalid);

  const onSaveAndApply = handleSubmit((values) => {
    if (pending) return;
    modal.confirm({
      title: t('form.applyConfirmTitle'),
      content: t('form.applyConfirmBody'),
      okText: t('form.applyConfirmOk'),
      cancelText: tCommon('actions.cancel'),
      onOk: async () => {
        setBusy('apply');
        const saved = await saveDraft(values);
        if (!saved) {
          setBusy(null);
          return;
        }
        try {
          const applied = await activate.mutateAsync(saved.id);
          message.success(t('form.appliedSuccess'));
          onSaved?.({ policy: applied, applied: true });
        } catch (err) {
          // Bản nháp đã lưu — chỉ bước áp dụng hỏng. Báo rõ để người dùng sửa tiếp từ sổ nháp.
          message.error(t('form.applyFailed', { reason: errorMessage(err) }));
          onSaved?.({ policy: saved, applied: false });
        } finally {
          setBusy(null);
        }
        onClose();
      },
    });
  }, onInvalid);

  const title = policy
    ? t('form.titleEdit', { version: policy.version })
    : duplicateFrom
      ? keepName
        ? t('form.titleEditActive', { version: duplicateFrom.version })
        : t('form.titleDuplicate', { version: duplicateFrom.version })
      : t('form.titleCreate');

  const money = (
    name: Parameters<typeof NumberField<FeePolicyFormValues>>[0]['name'],
    label: string,
  ) => (
    <NumberField
      control={control}
      name={name}
      label={label}
      money
      min={0}
      max={FEE_POLICY_AMOUNT_MAX}
      required
    />
  );

  const panels: Record<FeePolicyFormTab, ReactNode> = {
    fees: (
      <div className={styles.panel}>
        <FormSection
          title={t('form.sectionPlatformFee')}
          hint={t('form.platformFeeHint')}
          hintLabel={t('form.hints.platformFee')}
        >
          <PlatformFeeField control={control} />
        </FormSection>
        <FormSection
          title={t('form.sectionCommission')}
          hint={t('form.commissionHint')}
          hintLabel={t('form.hints.commission')}
        >
          {/* Phạm vi đi trước con số: nấc này không chạm tới gian hàng có gói (H = 0 — ADR 0064 điều 3). */}
          <p className={styles.scope}>{t('commissionScope.title')}</p>
          <CommissionTiersField control={control} />
        </FormSection>
      </div>
    ),
    deposit: (
      <div className={styles.panel}>
        <FormSection
          title={t('form.sectionDeposit')}
          hint={t('form.depositHint')}
          hintLabel={t('form.hints.deposit')}
        >
          <PercentSliderField
            control={control}
            name="depositPercent"
            label={t('form.depositPercent')}
            min={DEPOSIT_PERCENT_MIN}
            max={DEPOSIT_PERCENT_MAX}
            step={1}
            precision={0}
            required
          />
          <div className={styles.grid2}>
            {money('depositMinAmount', t('form.depositMinAmount'))}
            {money('holdMinAmount', t('form.holdMinAmount'))}
          </div>
        </FormSection>
        {/* Hai cửa sổ cùng một kiểu tính (ADR 0066 · 0072) — một ⓘ cho cả khối, nhãn ô giữ một cỡ. */}
        <FormSection
          title={t('form.sectionWindows')}
          hint={
            <>
              <p className={styles.hintLine}>{t('form.holdPaymentWindowHint')}</p>
              <p className={styles.hintLine}>{t('form.freeCancelHint')}</p>
            </>
          }
          hintLabel={t('form.windowHintLabel')}
        >
          <div className={styles.grid2}>
            <NumberField
              control={control}
              name="holdPaymentWindowMinutes"
              label={t('form.holdPaymentWindowMinutes')}
              min={0}
              precision={0}
              addonAfter={t('form.minutesUnit')}
              required
            />
            <NumberField
              control={control}
              name="freeCancelHours"
              label={t('form.freeCancelHours')}
              min={0}
              precision={0}
              addonAfter={t('form.hoursUnit')}
              required
            />
          </div>
        </FormSection>
      </div>
    ),
    booking: (
      <div className={styles.panel}>
        <FormSection
          title={t('form.sectionBookingLimits')}
          hint={t('form.bookingLimitsHint')}
          hintLabel={t('form.hints.booking')}
        >
          <div className={styles.grid2}>
            <NumberField
              control={control}
              name="maxAdvanceBookingDays"
              label={t('form.maxAdvanceBookingDays')}
              min={0}
              precision={0}
              addonAfter={t('form.daysUnit')}
              required
            />
            <NumberField
              control={control}
              name="selfDriveMaxDays"
              label={t('form.selfDriveMaxDays')}
              min={0}
              precision={0}
              addonAfter={t('form.daysUnit')}
              required
            />
          </div>
        </FormSection>
        {/* Giới hạn chặn số vô lý của chuyến có tài xế (ADR 0075) — không phải dòng tiền. */}
        <FormSection
          title={t('form.sectionWithDriver')}
          hint={
            <>
              <p className={styles.hintLine}>{t('form.withDriverLimitsHint')}</p>
              <p className={styles.hintLine}>{t('form.driverWageSuggestedHint')}</p>
            </>
          }
          hintLabel={t('form.hints.withDriver')}
        >
          <div className={styles.grid2}>
            {money('withDriverLimits.priceMin', t('form.withDriverPriceMin'))}
            {money('withDriverLimits.priceMax', t('form.withDriverPriceMax'))}
            {money('withDriverLimits.wageMin', t('form.driverWageMin'))}
            {money('withDriverLimits.wageMax', t('form.driverWageMax'))}
            {money('withDriverLimits.wageSuggested', t('form.driverWageSuggested'))}
          </div>
        </FormSection>
      </div>
    ),
    tax: (
      <div className={styles.panel}>
        <FormSection title={t('form.sectionTax')}>
          <SwitchField
            control={control}
            name="taxEnabled"
            label={t('form.taxEnabled')}
            labelExtra={<InfoHint label={t('form.hints.tax')} content={t('form.taxEnabledHint')} />}
          />
          {taxEnabled ? (
            <>
              <TextField
                control={control}
                name="taxLegalBasis"
                label={t('form.taxLegalBasis')}
                help={t('form.taxLegalBasisHint')}
                required
              />
              <p className={styles.label}>{t('form.taxRatesTitle')}</p>
              <TaxRatesField control={control} />
              <p className={styles.scope}>{t('form.taxScope')}</p>
            </>
          ) : null}
        </FormSection>
      </div>
    ),
  };

  return (
    <ResponsiveDialog
      title={
        <span className={styles.title}>
          {title}
          <InfoHint label={t('form.hints.intro')} content={t('form.intro')} />
        </span>
      }
      open={open}
      onClose={onClose}
      size="lg"
      confirmLoading={pending}
      footer={
        <div className={styles.footer}>
          <Button onClick={onClose} disabled={pending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            onClick={() => void onSaveDraft()}
            loading={busy === 'draft'}
            disabled={pending && busy !== 'draft'}
          >
            {t('form.saveDraft')}
          </Button>
          <Button
            type="primary"
            onClick={() => void onSaveAndApply()}
            loading={busy === 'apply'}
            disabled={pending && busy !== 'apply'}
          >
            {t('form.saveAndApply')}
          </Button>
        </div>
      }
    >
      <DialogForm onSubmit={onSaveDraft} labelPosition="top">
        {policy && policy.activationBlockers.length > 0 ? (
          <Alert
            type="warning"
            showIcon
            className={styles.alert}
            title={t('form.activationBlocked')}
            description={policy.activationBlockers
              .map((code) => domainLabel('feePolicyActivationBlocker', code))
              .join(LIST_SEPARATOR)}
          />
        ) : null}
        <div className={styles.grid2}>
          <TextField control={control} name="name" label={t('form.name')} required />
          <TextAreaField control={control} name="note" label={t('form.note')} rows={1} />
        </div>
        <Tabs
          className={styles.tabs}
          activeKey={tab}
          onChange={(key) => setTab(key as FeePolicyFormTab)}
          items={FEE_POLICY_FORM_TABS.map((key) => ({
            key,
            // Mọi tab dựng sẵn: ô ở tab khuất vẫn có trong DOM để focus được khi nhảy tới lỗi.
            forceRender: true,
            label: (
              <span className={styles.tabLabel}>
                {t(`form.tabs.${key}`)}
                {tabErrors[key] > 0 ? (
                  <Badge
                    count={tabErrors[key]}
                    size="small"
                    title={t('form.tabErrors', { count: tabErrors[key] })}
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
