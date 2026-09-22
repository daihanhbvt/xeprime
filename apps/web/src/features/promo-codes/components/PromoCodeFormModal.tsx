'use client';

import { App, Alert, Divider } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  normalizePromoCode,
  PROMO_AUDIENCE,
  PROMO_AUDIENCE_VALUES,
  PROMO_CODE_MAX_LENGTH,
  PROMO_CODE_MIN_LENGTH,
  PROMO_CODE_PATTERN,
  PROMO_DISCOUNT_PERCENT_MAX,
  PROMO_DISCOUNT_PERCENT_MIN,
  PROMO_DISCOUNT_TYPE,
  PROMO_MAX_FIXED_DISCOUNT,
  PROMO_SERVICE_SCOPE_OPTIONS,
  PROMO_VEHICLE_SCOPE,
  PROMO_VEHICLE_SCOPE_VALUES,
  isServiceType,
  type ServiceType,
} from '@xeprime/types';
import { ChoiceCardsField } from '@/components/form/ChoiceCardsField';
import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { DateTimeField } from '@/components/form/DateTimeField';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreatePromoCode, useUpdatePromoCode } from '../hooks/use-promo-codes';
import type { AdminPromoCode, UpsertPromoCodeInput } from '../types';
import { PromoCodePreviewCard } from './PromoCodePreviewCard';
import styles from './PromoCodeFormModal.module.css';

/**
 * Tạo/sửa MỘT chiến dịch mã khuyến mãi — ADR 0046.
 *
 * ## Trường bị KHOÁ sau khi có lượt dùng
 *
 * `promo.lockedFields` do SERVER trả về (ADR 0046 điều 8), và form chỉ `disabled` theo nó — nó
 * KHÔNG tự suy ra điều kiện khoá lần thứ hai. Suy lại ở client là dựng một bản luật thứ hai, và
 * bản đó sẽ trôi khỏi bản gốc đúng vào lúc ai đó thêm một trường vào danh sách khoá.
 *
 * Chặn thật vẫn ở server (`PROMO_CODE_LOCKED`); `disabled` ở đây chỉ để người dùng không gõ vào
 * một ô rồi bị từ chối sau khi bấm Lưu.
 */
export function PromoCodeFormModal({
  open,
  promo,
  onClose,
}: {
  open: boolean;
  /** `null` = tạo mới. */
  promo: AdminPromoCode | null;
  onClose: () => void;
}) {
  const t = useTranslations('PromoCodes');
  const { message } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const create = useCreatePromoCode();
  const update = useUpdatePromoCode();

  const isEdit = Boolean(promo);
  const pending = create.isPending || update.isPending;
  const locked = new Set(promo?.lockedFields ?? []);

  const schema = useMemo(() => {
    return yup.object({
      code: yup
        .string()
        .trim()
        .required(t('admin.validation.codeRequired'))
        /*
         * Kiểm trên chuỗi ĐÃ CHUẨN HOÁ, đúng thứ server sẽ lưu: người dùng gõ "ban moi" thì
         * chuỗi thật là "BANMOI" và nó hợp lệ. Kiểm trên chuỗi thô sẽ từ chối một thứ mà server
         * chấp nhận — một form nghiêm hơn API là một form nói sai về luật.
         */
        .test(
          'format',
          t('admin.validation.codeFormat', {
            min: PROMO_CODE_MIN_LENGTH,
            max: PROMO_CODE_MAX_LENGTH,
          }),
          (value) => {
            const code = normalizePromoCode(value ?? '');
            return (
              code.length >= PROMO_CODE_MIN_LENGTH &&
              code.length <= PROMO_CODE_MAX_LENGTH &&
              PROMO_CODE_PATTERN.test(code)
            );
          },
        ),
      name: yup.string().trim().required(t('admin.validation.nameRequired')).max(160),
      description: yup.string().trim().max(200).default(''),
      discountType: yup.string().oneOf(Object.values(PROMO_DISCOUNT_TYPE)).required(),
      discountAmount: yup
        .number()
        .nullable()
        .defined()
        .when('discountType', {
          is: PROMO_DISCOUNT_TYPE.FIXED,
          then: (s) =>
            s
              .test('required', t('admin.validation.amountRequired'), (v) => v != null)
              .test(
                'range',
                t('admin.validation.amountRange', { max: PROMO_MAX_FIXED_DISCOUNT }),
                (v) => v == null || (v > 0 && v <= PROMO_MAX_FIXED_DISCOUNT),
              ),
        }),
      discountPercent: yup
        .number()
        .nullable()
        .defined()
        .when('discountType', {
          is: PROMO_DISCOUNT_TYPE.PERCENT,
          then: (s) =>
            s.test(
              'range',
              t('admin.validation.percentRange', {
                min: PROMO_DISCOUNT_PERCENT_MIN,
                max: PROMO_DISCOUNT_PERCENT_MAX,
              }),
              (v) =>
                v != null &&
                Number.isInteger(v) &&
                v >= PROMO_DISCOUNT_PERCENT_MIN &&
                v <= PROMO_DISCOUNT_PERCENT_MAX,
            ),
        }),
      maxDiscountAmount: yup
        .number()
        .nullable()
        .defined()
        .test(
          'positive',
          t('admin.validation.maxDiscountPositive'),
          (v) => v == null || v > 0,
        ),
      minOrderAmount: yup
        .number()
        .required()
        .min(0, t('admin.validation.minOrderPositive')),
      audience: yup.string().oneOf(PROMO_AUDIENCE_VALUES).required(),
      vehicleScope: yup.string().oneOf(PROMO_VEHICLE_SCOPE_VALUES).required(),
      serviceScope: yup.array(yup.string().required()).default([]),
      totalUsageLimit: yup
        .number()
        .nullable()
        .defined()
        .test('min', t('admin.validation.limitMin'), (v) => v == null || v >= 1),
      perCustomerLimit: yup
        .number()
        .nullable()
        .defined()
        .test('min', t('admin.validation.limitMin'), (v) => v == null || v >= 1),
      startsAt: yup.string().required(t('admin.validation.startRequired')),
      endsAt: yup
        .string()
        .required(t('admin.validation.endRequired'))
        .test('after', t('admin.validation.endAfterStart'), function (value) {
          const start = this.parent.startsAt as string | undefined;
          if (!value || !start) return true;
          return value > start;
        }),
      isActive: yup.boolean().required(),
      listed: yup.boolean().required(),
    });
  }, [t]);

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, watch } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: promo
      ? {
          code: promo.code,
          name: promo.name,
          description: promo.description ?? '',
          discountType: promo.discountType,
          discountAmount: promo.discountAmount == null ? null : Number(promo.discountAmount),
          discountPercent: promo.discountPercent,
          maxDiscountAmount:
            promo.maxDiscountAmount == null ? null : Number(promo.maxDiscountAmount),
          minOrderAmount: Number(promo.minOrderAmount),
          audience: promo.audience,
          vehicleScope: promo.vehicleScope,
          serviceScope: promo.serviceScope,
          totalUsageLimit: promo.totalUsageLimit,
          perCustomerLimit: promo.perCustomerLimit,
          // `DateTimeField dateOnly` giữ chuỗi `YYYY-MM-DD` — ngày lịch, không phải mốc thời gian.
          startsAt: promo.startsAt.slice(0, 10),
          endsAt: promo.endsAt.slice(0, 10),
          isActive: promo.isActive,
          listed: promo.listed,
        }
      : {
          code: '',
          name: '',
          description: '',
          discountType: PROMO_DISCOUNT_TYPE.FIXED,
          discountAmount: null,
          discountPercent: null,
          maxDiscountAmount: null,
          minOrderAmount: 0,
          audience: PROMO_AUDIENCE.ALL,
          vehicleScope: PROMO_VEHICLE_SCOPE.ALL,
          serviceScope: [],
          totalUsageLimit: null,
          perCustomerLimit: 1,
          startsAt: todayKey(),
          endsAt: todayKey(30),
          isActive: true,
          listed: true,
        },
  });

  const values = watch();
  const isPercent = values.discountType === PROMO_DISCOUNT_TYPE.PERCENT;

  const onSubmit = handleSubmit((form) => {
    const body: UpsertPromoCodeInput = {
      code: normalizePromoCode(form.code),
      name: form.name.trim(),
      description: form.description?.trim() || null,
      discountType: form.discountType,
      /*
       * Bộ số của hình thức KHÔNG được chọn về `null` ngay tại đây.
       *
       * Chuyển từ "%" sang "tiền" mà vẫn gửi `discountPercent` cũ sẽ trượt
       * `promo_codes_discount_shape_check` ở DB, và thông báo lỗi khi đó nói về một ràng buộc chứ
       * không nói về thứ người dùng vừa gõ.
       */
      discountAmount:
        form.discountType === PROMO_DISCOUNT_TYPE.FIXED && form.discountAmount != null
          ? String(form.discountAmount)
          : null,
      discountPercent: isPercent ? form.discountPercent : null,
      maxDiscountAmount:
        isPercent && form.maxDiscountAmount != null ? String(form.maxDiscountAmount) : null,
      minOrderAmount: String(form.minOrderAmount),
      audience: form.audience,
      vehicleScope: form.vehicleScope,
      /*
       * Thu hẹp bằng `isServiceType` thay vì ép kiểu: ô chọn dựng từ
       * `PROMO_SERVICE_SCOPE_OPTIONS` nên giá trị luôn hợp lệ, nhưng một mã dịch vụ bị GỠ khỏi
       * bộ hiện hành sẽ còn sống trong một form đang mở — và gửi nó lên là để DTO từ chối cả lượt
       * lưu với một lỗi nói về `@IsIn`.
       */
      serviceScope: form.serviceScope.filter((value): value is ServiceType => isServiceType(value)),
      // Khu vực: chưa mở ô chọn tỉnh ở đợt này — mọi mã là toàn quốc (xem docblock ở trang).
      provinceCodes: promo?.provinceCodes ?? [],
      totalUsageLimit: form.totalUsageLimit,
      perCustomerLimit: form.perCustomerLimit,
      /*
       * Ngày lịch → mốc thời gian: bắt đầu từ 00:00 và kết thúc ở 23:59:59 giờ VIỆT NAM. Gửi
       * `T00:00:00Z` cho cả hai đầu sẽ làm một mã "tới 31/12" hết hiệu lực từ 07:00 sáng 31/12.
       */
      startsAt: `${form.startsAt}T00:00:00+07:00`,
      endsAt: `${form.endsAt}T23:59:59+07:00`,
      isActive: form.isActive,
      listed: form.listed,
    };

    const done = {
      onSuccess: (saved: AdminPromoCode) => {
        message.success(
          isEdit
            ? t('admin.toast.updated', { code: saved.code })
            : t('admin.toast.created', { code: saved.code }),
        );
        onClose();
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (promo) update.mutate({ id: promo.id, body }, done);
    else create.mutate(body, done);
  });

  return (
    <ResponsiveDialog
      title={isEdit ? t('admin.form.editTitle', { code: promo?.code ?? '' }) : t('admin.form.createTitle')}
      open={open}
      onClose={onClose}
      size="xl"
      okText={isEdit ? t('admin.form.submitEdit') : t('admin.form.submitCreate')}
      cancelText={t('admin.form.cancel')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <p className={styles.intro}>{t('admin.form.description')}</p>
      {locked.size > 0 ? (
        <Alert type="warning" showIcon message={t('admin.form.lockedNotice')} className={styles.notice} />
      ) : null}

      {/*
        HAI CỘT: xem trước bên trái, form bên phải (ảnh thiết kế 6). Trên màn hẹp chúng xếp dọc và
        xem trước xuống dưới — người dùng điện thoại cần ô nhập trước, xem trước sau.
      */}
      <div className={styles.layout}>
        <aside className={styles.previewCol}>
          <PromoCodePreviewCard
            code={normalizePromoCode(values.code || '')}
            name={values.name}
            description={values.description}
            discountType={values.discountType}
            discountAmount={values.discountAmount}
            discountPercent={values.discountPercent}
            maxDiscountAmount={values.maxDiscountAmount}
            vehicleScope={values.vehicleScope}
            startsAt={values.startsAt}
            endsAt={values.endsAt}
          />
        </aside>

        <div className={styles.formCol}>
          <DialogForm onSubmit={onSubmit} labelWidth="lg">
            <Divider plain>{t('admin.form.section.basic')}</Divider>
            <TextField
              control={control}
              name="code"
              label={t('admin.form.code')}
              help={t('admin.form.codeHint')}
              required
              disabled={locked.has('code')}
            />
            <TextField control={control} name="name" label={t('admin.form.name')} required />
            <TextAreaField
              control={control}
              name="description"
              label={t('admin.form.descriptionField')}
              rows={2}
              help={t('admin.form.descriptionHint')}
            />

            <Divider plain>{t('admin.form.section.discount')}</Divider>
            <ChoiceCardsField
              control={control}
              name="discountType"
              options={[
                {
                  value: PROMO_DISCOUNT_TYPE.FIXED,
                  label: t('admin.form.typeFixed'),
                  description: t('admin.form.typeFixedHint'),
                  disabled: locked.has('discountType'),
                },
                {
                  value: PROMO_DISCOUNT_TYPE.PERCENT,
                  label: t('admin.form.typePercent'),
                  description: t('admin.form.typePercentHint'),
                  disabled: locked.has('discountType'),
                },
              ]}
            />
            {isPercent ? (
              <>
                <NumberField
                  control={control}
                  name="discountPercent"
                  label={t('admin.form.discountPercent')}
                  percent
                  min={PROMO_DISCOUNT_PERCENT_MIN}
                  max={PROMO_DISCOUNT_PERCENT_MAX}
                  required
                  disabled={locked.has('discountPercent')}
                />
                <NumberField
                  control={control}
                  name="maxDiscountAmount"
                  label={t('admin.form.maxDiscount')}
                  placeholder={t('admin.form.maxDiscountPlaceholder')}
                  money
                  min={0}
                  disabled={locked.has('maxDiscountAmount')}
                />
              </>
            ) : (
              <NumberField
                control={control}
                name="discountAmount"
                label={t('admin.form.discountAmount')}
                money
                min={0}
                max={PROMO_MAX_FIXED_DISCOUNT}
                required
                disabled={locked.has('discountAmount')}
              />
            )}

            <Divider plain>{t('admin.form.section.conditions')}</Divider>
            <NumberField
              control={control}
              name="minOrderAmount"
              label={t('admin.form.minOrder')}
              placeholder={t('admin.form.minOrderPlaceholder')}
              money
              min={0}
              disabled={locked.has('minOrderAmount')}
            />
            <SelectField
              control={control}
              name="vehicleScope"
              label={t('admin.form.vehicleScope')}
              disabled={locked.has('vehicleScope')}
              options={PROMO_VEHICLE_SCOPE_VALUES.map((value) => ({
                value,
                label: domainLabel('promoVehicleScope', value),
              }))}
            />
            <SelectField
              control={control}
              name="audience"
              label={t('admin.form.audience')}
              disabled={locked.has('audience')}
              options={PROMO_AUDIENCE_VALUES.map((value) => ({
                value,
                label: domainLabel('promoAudience', value),
              }))}
            />
            <CheckboxGroupField
              control={control}
              name="serviceScope"
              label={t('admin.form.serviceScope')}
              help={t('admin.form.serviceScopeAll')}
              disabled={locked.has('serviceScope')}
              options={PROMO_SERVICE_SCOPE_OPTIONS.map((value) => ({
                value,
                label: domainLabel('serviceType', value),
              }))}
            />
            <NumberField
              control={control}
              name="totalUsageLimit"
              label={t('admin.form.totalLimit')}
              placeholder={t('admin.form.totalLimitPlaceholder')}
              min={1}
            />
            <NumberField
              control={control}
              name="perCustomerLimit"
              label={t('admin.form.perCustomerLimit')}
              placeholder={t('admin.form.perCustomerLimitPlaceholder')}
              min={1}
            />

            <Divider plain>{t('admin.form.section.window')}</Divider>
            <DateTimeField
              control={control}
              name="startsAt"
              label={t('admin.form.startsAt')}
              dateOnly
            />
            <DateTimeField control={control} name="endsAt" label={t('admin.form.endsAt')} dateOnly />

            <Divider plain>{t('admin.form.section.state')}</Divider>
            <SwitchField
              control={control}
              name="isActive"
              label={t('admin.form.isActive')}
              description={t('admin.form.isActiveHint')}
            />
            <SwitchField
              control={control}
              name="listed"
              label={t('admin.form.listed')}
              description={t('admin.form.listedHint')}
            />
            <p className={styles.finalNote}>{t('admin.form.redeemedFinalNotice')}</p>
          </DialogForm>
        </div>
      </div>
    </ResponsiveDialog>
  );
}

/** `YYYY-MM-DD` giờ VIỆT NAM, cộng thêm `plusDays` — mặc định cho ô ngày của form. */
function todayKey(plusDays = 0): string {
  const vn = new Date(Date.now() + 7 * 3600_000 + plusDays * 24 * 3600_000);
  return vn.toISOString().slice(0, 10);
}
