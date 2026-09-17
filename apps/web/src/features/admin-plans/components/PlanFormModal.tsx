'use client';

import { App, Alert, Divider, Tag } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo } from 'react';
import { useForm } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  BILLING_MODE,
  OWNER_LITE_VEHICLE_LIMIT,
  PLAN_FEATURE_VALUES,
  SUBSCRIPTION_TERM_MONTHS,
  isPlanFeature,
} from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { DialogForm } from '@/components/form/DialogForm';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useCreatePlan, useUpdatePlan } from '../hooks/use-plan-mutations';
import type { CreatePlanInput, Plan } from '../types';
import styles from './PlanFormModal.module.css';

/**
 * Khoá ổn định cho bốn ô giá kỳ hạn — RHF cần tên field TĨNH, không index mảng.
 *
 * Bốn kỳ hạn là toàn bộ `SUBSCRIPTION_TERM_MONTHS`, và DB canh cùng danh sách bằng CHECK. Thêm
 * một kỳ hạn là sửa ba nơi (hằng, CHECK, bảng này) — cố ý khó, vì một kỳ hạn chỉ tồn tại ở một
 * trong ba nơi là một lựa chọn mua hiện ra rồi bị server từ chối.
 */
const TERM_FIELDS = [
  ['priceM1', 1],
  ['priceM3', 3],
  ['priceM6', 6],
  ['priceM12', 12],
] as const;

/**
 * Tạo/sửa bậc gói — ADR 0041.
 *
 * ## Hai hình dạng, không phải một form có vài ô ẩn
 *
 * Chế độ thu phí quyết định form là cái gì:
 *
 *   `commission` — **một TUYẾN, không phải một SKU** (ADR 0038 điều 13). Chỉ có tên, mô tả và
 *   % phí dịch vụ. Không bảng giá, không trần, không cờ năng lực: trần của tuyến này là
 *   `OWNER_LITE_VEHICLE_LIMIT` — một quy tắc SẢN PHẨM trong code, nên nó hiện ra ở đây dưới dạng
 *   THÔNG TIN chứ không phải ô nhập. Một ô nhập cho nó là mời admin sửa một con số mà backend
 *   không đọc.
 *
 *   `package` — một BẬC gian hàng: trần xe, trần chi nhánh, và bảng giá bốn kỳ hạn.
 *
 * ## Giá nhập TUYỆT ĐỐI, % tiết kiệm chỉ để nhìn
 *
 * Admin gõ 100.000 / 250.000 / 450.000 / 800.000. Nhãn "Tiết kiệm 17%" bên cạnh mỗi kỳ được TÍNH
 * từ giá kỳ 1 tháng đang gõ dở, cập nhật ngay — nó là phép so sánh để admin thấy biểu giá mình
 * vừa đặt ra trông thế nào với người mua, không phải một giá trị được lưu (ADR 0041 điều 2).
 *
 * Sửa thì `code` bị khoá (định danh, ADR 0010); tiền nhập number ở form và hoá string khi gửi
 * API (ADR 0007). Remount theo `key` ở nơi gọi để form sạch mỗi lần mở.
 */
export function PlanFormModal({
  open,
  plan,
  onClose,
}: {
  open: boolean;
  /** null = tạo mới; có giá trị = sửa gói đó. */
  plan: Plan | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminPlans');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const isEdit = Boolean(plan);
  const pending = create.isPending || update.isPending;

  const schema = useMemo(() => {
    const int = (v: yup.NumberSchema<number | null | undefined>) =>
      v
        .nullable()
        .defined()
        .integer(t('form.validation.integer'))
        .min(0, t('form.validation.nonNegative'));
    const money = () =>
      yup.number().nullable().defined().min(0, t('form.validation.nonNegative'));
    return yup.object({
      code: yup
        .string()
        .trim()
        .required(t('form.validation.codeRequired'))
        .matches(/^[a-z0-9][a-z0-9_-]{1,49}$/, t('form.validation.codePattern')),
      name: yup.string().trim().required(t('form.validation.nameRequired')).max(255),
      description: yup.string().trim().max(200).default(''),
      billingMode: yup.string().oneOf([BILLING_MODE.COMMISSION, BILLING_MODE.PACKAGE]).required(),
      commissionPercent: yup
        .number()
        .nullable()
        .defined()
        .min(1)
        .max(20)
        .when('billingMode', {
          is: BILLING_MODE.COMMISSION,
          then: (s) =>
            s.test('required', t('form.validation.commissionRequired'), (v) => v != null),
        }),
      maxVehicles: int(yup.number()),
      maxBranches: int(yup.number()),
      maxMembers: int(yup.number()),
      priceM1: money(),
      priceM3: money(),
      priceM6: money(),
      priceM12: money(),
      salesOnly: yup.boolean().defined(),
      recommended: yup.boolean().defined(),
      graceDays: int(yup.number()),
      features: yup.array().of(yup.string().defined()).defined(),
      sortOrder: yup.number().nullable().defined().integer(t('form.validation.integer')),
    });
  }, [t]);

  type FormValues = yup.InferType<typeof schema>;

  const { control, handleSubmit, watch } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: plan
      ? {
          code: plan.code,
          name: plan.name,
          description: plan.description ?? '',
          billingMode: plan.billingMode as FormValues['billingMode'],
          commissionPercent: plan.commissionPercent,
          maxVehicles: plan.limits.maxVehicles ?? null,
          maxBranches: plan.limits.maxBranches ?? null,
          maxMembers: plan.limits.maxMembers ?? null,
          priceM1: termPriceOf(plan, 1),
          priceM3: termPriceOf(plan, 3),
          priceM6: termPriceOf(plan, 6),
          priceM12: termPriceOf(plan, 12),
          salesOnly: plan.limits.salesOnly,
          recommended: plan.limits.recommended,
          graceDays: plan.limits.graceDays,
          features: [...plan.limits.features],
          sortOrder: plan.sortOrder,
        }
      : {
          code: '',
          name: '',
          description: '',
          /*
           * Tạo mới mặc định là bậc GIAN HÀNG, không phải tuyến hoa hồng.
           *
           * Danh mục chỉ được có ĐÚNG MỘT bậc `commission` và nó đã tồn tại từ seed
           * (`COMMISSION_PLAN_IS_SINGLETON` — ADR 0038 điều 13), nên mở form ở chế độ đó là mở
           * sẵn con đường duy nhất bị server từ chối.
           */
          billingMode: BILLING_MODE.PACKAGE,
          commissionPercent: null,
          maxVehicles: null,
          maxBranches: null,
          maxMembers: null,
          priceM1: null,
          priceM3: null,
          priceM6: null,
          priceM12: null,
          salesOnly: false,
          recommended: false,
          graceDays: 7,
          features: [...PLAN_FEATURE_VALUES],
          sortOrder: 0,
        },
  });

  const isPackage = watch('billingMode') === BILLING_MODE.PACKAGE;
  const salesOnly = watch('salesOnly');
  /*
   * Đọc CẢ BỐN ô giá trong MỘT lượt `watch`, không gọi `watch(field)` trong vòng lặp vẽ.
   *
   * Lý do thực dụng: `watch()` của RHF là một hàm không memo hoá an toàn được, và gọi nó ở giữa
   * JSX làm React Compiler bỏ tối ưu cả component. Lý do đúng hơn: cả bốn con số là MỘT trạng
   * thái — % tiết kiệm của mỗi kỳ tính từ giá kỳ 1 tháng, nên chúng phải đến từ cùng một lần đọc.
   */
  const [monthlyPrice, priceM3, priceM6, priceM12] = watch([
    'priceM1',
    'priceM3',
    'priceM6',
    'priceM12',
  ]);
  const termPriceOfField: Record<(typeof TERM_FIELDS)[number][0], number | null | undefined> = {
    priceM1: monthlyPrice,
    priceM3,
    priceM6,
    priceM12,
  };

  const onSubmit = handleSubmit((values) => {
    const isPkg = values.billingMode === BILLING_MODE.PACKAGE;
    const prices: Record<number, number | null | undefined> = {
      1: values.priceM1,
      3: values.priceM3,
      6: values.priceM6,
      12: values.priceM12,
    };
    const shared = {
      name: values.name.trim(),
      description: values.description?.trim() || undefined,
      billingMode: values.billingMode,
      // Tuyến gói: service tự xoá % — không gửi. Tuyến hoa hồng: schema đã bắt buộc có.
      ...(isPkg ? {} : { commissionPercent: values.commissionPercent as number }),
      /*
       * Tuyến hoa hồng KHÔNG gửi `limits` — bỏ trống là giữ nguyên giá trị đang lưu
       * (`updatePlan` merge trên hình đang có). Form này cố ý không có ô cho `graceDays`,
       * `features` hay trần nào của tuyến đó, nên gửi một `limits` dựng từ default của form sẽ
       * lặng lẽ XOÁ cờ năng lực và số ngày ân hạn mà seed đã đặt.
       */
      ...(isPkg
        ? {
            limits: {
              maxVehicles: values.maxVehicles,
              maxBranches: values.maxBranches,
              maxMembers: values.maxMembers,
              // Bậc tư vấn không có bảng giá (ADR 0041 điều 5) — service cũng xoá, nhưng gửi
              // đúng ngay từ đây thì cái admin thấy sau khi lưu bằng cái họ vừa bấm.
              termPrices: values.salesOnly
                ? []
                : SUBSCRIPTION_TERM_MONTHS.flatMap((months) => {
                    const price = prices[months];
                    // Ô trống = KHÔNG bán kỳ hạn đó, khác hẳn với 0đ. `termPrices` vừa là bảng
                    // giá vừa là danh sách kỳ hạn được bán (ADR 0041 điều 2).
                    return price == null ? [] : [{ months, price: String(price) }];
                  }),
              salesOnly: values.salesOnly,
              recommended: values.recommended,
              graceDays: values.graceDays ?? 0,
              // Narrow về union PlanFeature — yup chỉ biết string[], contract sinh enum literal.
              features: values.features.filter(isPlanFeature),
            } satisfies CreatePlanInput['limits'],
          }
        : {}),
      sortOrder: values.sortOrder ?? 0,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? t('form.updatedSuccess') : t('form.createdSuccess'));
        onClose();
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (plan) update.mutate({ id: plan.id, ...shared }, done);
    else create.mutate({ code: values.code.trim(), ...shared }, done);
  });

  return (
    <ResponsiveDialog
      title={isEdit ? t('form.titleEdit', { name: plan?.name ?? '' }) : t('form.titleCreate')}
      open={open}
      onClose={onClose}
      okText={isEdit ? tCommon('actions.save') : t('form.okCreate')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <DialogForm onSubmit={onSubmit} labelWidth="lg">
        <Alert
          type="info"
          showIcon
          className={styles.intro}
          title={isPackage ? t('form.packageIntroTitle') : t('form.commissionIntroTitle')}
          description={isPackage ? t('form.packageIntroBody') : t('form.commissionIntroBody')}
        />

        {/*
          Chế độ thu phí chỉ CHỌN được lúc tạo. Ở chế độ sửa nó là một sự thật đã rồi: backend
          từ chối mọi lượt đổi chiều (`DEFAULT_PLAN_PROTECTED` / `COMMISSION_PLAN_IS_SINGLETON`
          — ADR 0038 điều 13), nên một bộ radio ở đây chỉ để dẫn admin tới một thông báo lỗi.
        */}
        {!isEdit ? (
          <>
            <TextField control={control} name="code" label={t('form.code')} placeholder="shop-basic" />
            <RadioGroupField
              control={control}
              name="billingMode"
              label={t('form.billingMode')}
              options={[
                {
                  value: BILLING_MODE.PACKAGE,
                  label: domainLabel('billingMode', BILLING_MODE.PACKAGE),
                  description: t('form.packageHint'),
                },
                {
                  value: BILLING_MODE.COMMISSION,
                  label: domainLabel('billingMode', BILLING_MODE.COMMISSION),
                  description: t('form.commissionHint'),
                },
              ]}
            />
          </>
        ) : null}

        <Divider plain>{t('form.sectionInfo')}</Divider>
        <TextField control={control} name="name" label={t('form.name')} />
        <TextAreaField
          control={control}
          name="description"
          label={t('form.description')}
          rows={3}
          maxLength={200}
        />

        {!isPackage ? (
          <>
            <NumberField
              control={control}
              name="commissionPercent"
              label={t('form.commissionPercent')}
              percent
              min={1}
              max={20}
              precision={2}
              help={t('form.commissionPercentHelp')}
            />
            <Alert
              type="warning"
              showIcon
              className={styles.intro}
              title={t('form.commissionCustomerSideNote')}
            />
            {/*
              Trần của tuyến hoa hồng là QUY TẮC trong code (`OWNER_LITE_VEHICLE_LIMIT`), không
              phải dữ liệu của bậc — `vehicleQuotaFor` nhận ra tuyến này trước khi đọc tới
              `limits`. Hiện nó ra để admin không đi tìm, nhưng KHÔNG cho sửa: một ô nhập ở đây
              là mời sửa một con số mà backend không đọc.
            */}
            <div className={styles.readonlyBox}>
              <div className={styles.readonlyTitle}>{t('form.sectionLimits')}</div>
              <div className={styles.readonlyRow}>
                <span>{t('form.maxVehicles')}</span>
                <strong>{t('form.vehiclesValue', { count: OWNER_LITE_VEHICLE_LIMIT })}</strong>
              </div>
              <div className={styles.readonlyRow}>
                <span>{t('form.maxBranches')}</span>
                <strong>{t('form.branchesValue', { count: 1 })}</strong>
              </div>
            </div>
          </>
        ) : (
          <>
            <Divider plain>{t('form.sectionLimits')}</Divider>
            <NumberField
              control={control}
              name="maxVehicles"
              label={t('form.maxVehicles')}
              min={0}
              addonAfter={t('form.vehiclesUnit')}
              help={t('form.unlimitedHelp')}
            />
            <NumberField
              control={control}
              name="maxBranches"
              label={t('form.maxBranches')}
              min={0}
              addonAfter={t('form.branchesUnit')}
              help={t('form.unlimitedHelp')}
            />

            <Divider plain>{t('form.sectionSales')}</Divider>
            <SwitchField
              control={control}
              name="salesOnly"
              label={t('form.salesOnly')}
              description={t('form.salesOnlyHint')}
            />
            <SwitchField
              control={control}
              name="recommended"
              label={t('form.recommended')}
              description={t('form.recommendedHint')}
            />

            {salesOnly ? (
              <Alert
                type="info"
                showIcon
                className={styles.intro}
                title={t('form.salesOnlyNoPricing')}
              />
            ) : (
              <>
                <Divider plain>{t('form.sectionPricing')}</Divider>
                {TERM_FIELDS.map(([field, months]) => (
                  <NumberField
                    key={field}
                    control={control}
                    name={field}
                    label={t('form.termPrice', { months })}
                    labelAccessory={savingTag(monthlyPrice, termPriceOfField[field], months)}
                    money
                    min={0}
                    help={t('form.termPriceHelp')}
                  />
                ))}
                <p className={styles.pricingNote}>
                  {monthlyPrice
                    ? t('form.pricingReference', {
                        amount: fmt.money(String(monthlyPrice)),
                      })
                    : t('form.pricingReferenceEmpty')}
                </p>
              </>
            )}

            <Divider plain>{t('form.sectionOther')}</Divider>
            <NumberField
              control={control}
              name="maxMembers"
              label={t('form.maxMembers')}
              min={0}
              help={t('form.unlimitedHelp')}
            />
            <NumberField
              control={control}
              name="graceDays"
              label={t('form.graceDays')}
              min={0}
              addonAfter={t('form.graceDaysUnit')}
            />
            <CheckboxGroupField
              control={control}
              name="features"
              label={t('form.features')}
              options={PLAN_FEATURE_VALUES.map((feature) => ({
                value: feature,
                label: domainLabel('planFeature', feature),
              }))}
            />
            <NumberField control={control} name="sortOrder" label={t('form.sortOrder')} />
          </>
        )}
      </DialogForm>
    </ResponsiveDialog>
  );

  /**
   * Nhãn "Tiết kiệm N%" cạnh một ô giá — CÙNG công thức với `planTermSavingPercent` ở
   * `@xeprime/types`, chỉ khác đầu vào: ở đây là con số đang gõ dở trong form, chưa lưu.
   *
   * Không gọi thẳng hàm đó vì nó nhận một `PlanLimitsJson` đã chốt hình, còn cái admin cần thấy
   * là biểu giá mình ĐANG đặt ra. Công thức chỉ là một phép chia, và giữ nó ở đây tránh phải
   * dựng một `limits` giả sau mỗi phím gõ.
   */
  function savingTag(
    monthly: number | null | undefined,
    total: number | null | undefined,
    months: number,
  ) {
    if (months <= 1 || !monthly || !total) return undefined;
    const saving = Math.round((1 - total / (monthly * months)) * 100);
    if (saving <= 0) return undefined;
    return <Tag color="green">{t('form.termSaving', { percent: saving })}</Tag>;
  }
}

/** Giá kỳ `months` của gói đang sửa — kỳ không bán hiện ô TRỐNG, không phải 0. */
function termPriceOf(plan: Plan, months: number): number | null {
  const found = plan.limits.termPrices.find((term) => term.months === months);
  return found ? Number(found.price) : null;
}
