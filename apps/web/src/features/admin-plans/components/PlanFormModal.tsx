'use client';

import {
  ApartmentOutlined,
  AppstoreOutlined,
  CalendarOutlined,
  CarOutlined,
  CodeSandboxOutlined,
  DeleteOutlined,
  FallOutlined,
  FileTextOutlined,
  LikeOutlined,
  NumberOutlined,
  PercentageOutlined,
  SaveOutlined,
  SettingOutlined,
  ShopOutlined,
  StarOutlined,
  TagsOutlined,
  TeamOutlined,
} from '@ant-design/icons';
import { App, Button, Collapse, Form, Tag, Tooltip } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useMemo, useState, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { useTranslations } from 'next-intl';
import * as yup from 'yup';
import {
  BILLING_MODE,
  OWNER_LITE_VEHICLE_LIMIT,
  PLAN_FEATURE_VALUES,
  SUBSCRIPTION_TERM_MONTHS,
  isPlanFeature,
} from '@xeprime/types';
import { InfoHint } from '@/components/data-display/InfoHint';
import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { NumberField } from '@/components/form/NumberField';
import { trailingRequiredMark } from '@/components/form/required-mark';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { decorativeIcon } from '@/lib/decorative-icon';
import { useCreatePlan, useDeletePlan, useUpdatePlan } from '../hooks/use-plan-mutations';
import { COMMISSION_TRACK_BRANCH_LIMIT, toPlanCode } from '../plan-catalog';
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

type TermField = (typeof TERM_FIELDS)[number][0];

/** Các ô của phần "Cài đặt nâng cao" — lỗi ở đây phải tự mở phần đó ra, không thì không ai thấy. */
const ADVANCED_FIELDS = ['maxMembers', 'graceDays', 'sortOrder', 'features'] as const;
const ADVANCED_PANEL = 'advanced';

/**
 * Tạo / sửa / nhân bản bậc gói — ADR 0041.
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
 * ## Ghi chú nằm sau dấu "i"
 *
 * Mọi lời giải thích (ô trống nghĩa là gì, bán qua tư vấn là gì, % tiết kiệm so với cái gì) đi
 * qua `InfoHint` — form chỉ còn nhãn và ô nhập. Lỗi validate vẫn hiện ngay dưới ô.
 *
 * Sửa thì `code` và chế độ thu phí bị khoá (định danh — ADR 0010; đổi chiều bị backend chặn);
 * tiền nhập number ở form và hoá string khi gửi API (ADR 0007). Nhân bản (`template`) là TẠO MỚI
 * điền sẵn từ một bậc có sẵn, để trống mã. Nơi gọi remount theo `key` để form sạch mỗi lần mở.
 */
export function PlanFormModal({
  open,
  plan,
  template = null,
  allowCommission = false,
  onClose,
}: {
  open: boolean;
  /** null = tạo mới; có giá trị = sửa gói đó. */
  plan: Plan | null;
  /** Tạo mới điền sẵn từ bậc này (nhân bản). Bỏ qua khi `plan` có giá trị. */
  template?: Plan | null;
  /**
   * Cho chọn "Hoa hồng theo chuyến" lúc tạo. Danh mục chỉ được có MỘT bậc hoa hồng
   * (`COMMISSION_PLAN_IS_SINGLETON`) — khi nó đã tồn tại thì lựa chọn đó bị ẩn hẳn.
   */
  allowCommission?: boolean;
  onClose: () => void;
}) {
  const t = useTranslations('AdminPlans');
  const tCommon = useTranslations('Common');
  const { message, modal } = App.useApp();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const create = useCreatePlan();
  const update = useUpdatePlan();
  const remove = useDeletePlan();
  const isEdit = Boolean(plan);
  const source = plan ?? template;
  const isDuplicate = !plan && Boolean(template);
  const pending = create.isPending || update.isPending || remove.isPending;
  const [advancedOpen, setAdvancedOpen] = useState(false);

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
        // Ô nhập đã chuẩn hoá từng phím (`toPlanCode`) nhưng giữ gạch CUỐI để gõ tiếp — cắt ở
        // đây, trước khi kiểm và gửi, để "shop-" không thành một mã lửng lơ.
        .transform((value: string) => value.trim().replace(/[-_]+$/, ''))
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

  const { control, handleSubmit, setValue } = useForm<FormValues>({
    resolver: yupResolver(schema),
    defaultValues: source
      ? {
          code: plan ? plan.code : '',
          name: plan ? plan.name : t('form.copyName', { name: source.name }),
          description: source.description ?? '',
          billingMode: source.billingMode as FormValues['billingMode'],
          commissionPercent: source.commissionPercent,
          maxVehicles: source.limits.maxVehicles ?? null,
          maxBranches: source.limits.maxBranches ?? null,
          maxMembers: source.limits.maxMembers ?? null,
          priceM1: termPriceOf(source, 1),
          priceM3: termPriceOf(source, 3),
          priceM6: termPriceOf(source, 6),
          priceM12: termPriceOf(source, 12),
          salesOnly: source.limits.salesOnly,
          // Bản sao KHÔNG mang nhãn "Được đề xuất": hai bậc cùng được đề xuất là không bậc nào.
          recommended: plan ? plan.limits.recommended : false,
          graceDays: source.limits.graceDays,
          features: [...source.limits.features],
          // Bản sao đứng ngay sau bậc gốc trên bảng giá.
          sortOrder: plan ? plan.sortOrder : source.sortOrder + 1,
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

  /*
   * Đọc mọi giá trị form cần để VẼ trong MỘT lượt `useWatch`, không gọi `watch()`.
   *
   * Lý do thực dụng: `watch()` của RHF là một hàm không memo hoá an toàn được, nên chỉ cần gọi
   * nó là React Compiler bỏ tối ưu cả component; `useWatch` là hook đăng ký đúng các ô được đọc.
   * Lý do đúng hơn: bốn ô giá là MỘT trạng thái — % tiết kiệm của mỗi kỳ tính từ giá kỳ 1 tháng,
   * nên chúng phải đến từ cùng một lần đọc.
   */
  const [billingMode, salesOnly, monthlyPrice, priceM3, priceM6, priceM12] = useWatch({
    control,
    name: ['billingMode', 'salesOnly', 'priceM1', 'priceM3', 'priceM6', 'priceM12'],
  });
  const isPackage = billingMode === BILLING_MODE.PACKAGE;
  const termPriceOfField: Record<TermField, number | null | undefined> = {
    priceM1: monthlyPrice,
    priceM3,
    priceM6,
    priceM12,
  };

  /*
   * Chế độ thu phí CHỌN được lúc tạo; lúc sửa nó là sự thật đã rồi — backend từ chối mọi lượt
   * đổi chiều (`DEFAULT_PLAN_PROTECTED` / `COMMISSION_PLAN_IS_SINGLETON`), nên ô chọn bị khoá và
   * chỉ còn một lựa chọn để HIỂN THỊ. Lựa chọn hoa hồng chỉ có khi danh mục chưa có bậc đó.
   */
  const modeOptions = (
    plan
      ? [plan.billingMode]
      : [
          BILLING_MODE.PACKAGE,
          ...(allowCommission && !isDuplicate ? [BILLING_MODE.COMMISSION] : []),
        ]
  ).map((mode) => ({ value: mode, label: domainLabel('billingMode', mode) }));

  const onSubmit = handleSubmit(
    (values) => {
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
    },
    (errors) => {
      if (ADVANCED_FIELDS.some((field) => errors[field])) setAdvancedOpen(true);
    },
  );

  const title = isEdit
    ? t('form.titleEdit')
    : isDuplicate
      ? t('form.titleDuplicate')
      : t('form.titleCreate');
  const subtitle = isEdit
    ? t('form.subtitleEdit')
    : isDuplicate
      ? t('form.subtitleDuplicate', { name: template?.name ?? '' })
      : t('form.subtitleCreate');

  const unlimitedHint = (
    <InfoHint
      className={styles.hintCorner}
      label={t('form.unlimitedHintLabel')}
      content={t('form.unlimitedHint')}
    />
  );

  /** Xoá hẳn một gói nháp — hỏi lại trước, vì không hoàn tác được. */
  function confirmDelete(target: Plan) {
    modal.confirm({
      title: t('form.deleteConfirmTitle', { name: target.name }),
      content: t('form.deleteConfirmBody'),
      okText: t('form.deleteConfirmOk'),
      cancelText: tCommon('actions.close'),
      okButtonProps: { danger: true },
      onOk: () =>
        new Promise<void>((resolve) => {
          remove.mutate(target.id, {
            onSuccess: () => {
              message.success(t('form.deletedSuccess', { name: target.name }));
              resolve();
              onClose();
            },
            onError: (err) => {
              message.error(errorMessage(err));
              resolve();
            },
          });
        }),
    });
  }

  return (
    <ResponsiveDialog
      title={
        <span className={styles.heading}>
          <span className={styles.headingIcon} aria-hidden="true">
            <CodeSandboxOutlined />
          </span>
          <span className={styles.headingText}>
            <span className={styles.headingTitle}>{title}</span>
            <span className={styles.headingSubtitle}>
              {subtitle}
              <InfoHint
                label={t('form.introLabel')}
                content={isPackage ? t('form.packageIntro') : t('form.commissionIntro')}
              />
            </span>
          </span>
        </span>
      }
      open={open}
      onClose={onClose}
      size="lg"
      confirmLoading={pending}
      footer={
        <>
          {/*
            Chỉ gói NHÁP (chưa từng có thuê bao hay hoá đơn) mới có nút này — cờ `deletable` do
            server tính, và `DELETE` vẫn là lớp chặn thật. Gói đã dùng thì tắt bằng công tắc.
          */}
          {plan?.deletable ? (
            <Button
              danger
              className={styles.deleteButton}
              icon={decorativeIcon(<DeleteOutlined />)}
              onClick={() => confirmDelete(plan)}
              disabled={pending}
            >
              {t('form.deleteAction')}
            </Button>
          ) : null}
          <Button onClick={onClose} disabled={pending}>
            {tCommon('actions.cancel')}
          </Button>
          <Button
            type="primary"
            icon={decorativeIcon(<SaveOutlined />)}
            loading={pending}
            onClick={() => void onSubmit()}
          >
            {isEdit ? tCommon('actions.save') : t('form.okCreate')}
          </Button>
        </>
      }
    >
      {/*
        `<Form component={false}>` chỉ CẤP NGỮ CẢNH bố cục cho `Form.Item` — nhãn nằm TRÊN ô
        nhập, dấu bắt buộc đặt SAU nhãn; form thật là thẻ `<form>` của React Hook Form bên dưới.
      */}
      <Form component={false} layout="vertical" colon={false} requiredMark={trailingRequiredMark}>
        <form onSubmit={onSubmit} noValidate className={styles.form}>
          <div className={styles.grid}>
            <TextField
              control={control}
              name="name"
              label={<FieldLabel icon={<CodeSandboxOutlined />}>{t('form.name')}</FieldLabel>}
              placeholder={t('form.namePlaceholder')}
              required
            />
            <SelectField
              control={control}
              name="billingMode"
              label={<FieldLabel icon={<TagsOutlined />}>{t('form.kind')}</FieldLabel>}
              options={modeOptions}
              disabled={modeOptions.length < 2}
              required
            />
            {!isEdit ? (
              <div className={styles.hinted}>
                <TextField
                  control={control}
                  name="code"
                  label={<FieldLabel icon={<NumberOutlined />}>{t('form.code')}</FieldLabel>}
                  placeholder={t('form.codePlaceholder')}
                  normalize={toPlanCode}
                  required
                />
                <InfoHint
                  className={styles.hintCorner}
                  label={t('form.codeHintLabel')}
                  content={t('form.codeHint')}
                />
              </div>
            ) : null}
            <div className={cx(styles.full, styles.descriptionCell)}>
              <TextAreaField
                control={control}
                name="description"
                label={
                  <FieldLabel icon={<FileTextOutlined />}>{t('form.description')}</FieldLabel>
                }
                placeholder={t('form.descriptionPlaceholder')}
                rows={3}
                maxLength={200}
              />
            </div>

            {!isPackage ? (
              <div className={styles.hinted}>
                <NumberField
                  control={control}
                  name="commissionPercent"
                  label={
                    <FieldLabel icon={<PercentageOutlined />}>
                      {t('form.commissionPercent')}
                    </FieldLabel>
                  }
                  percent
                  min={1}
                  max={20}
                  precision={2}
                  required
                />
                <InfoHint
                  className={styles.hintCorner}
                  label={t('form.commissionPercentHintLabel')}
                  content={t('form.commissionPercentHint')}
                />
              </div>
            ) : (
              <>
                <div className={styles.hinted}>
                  <NumberField
                    control={control}
                    name="maxVehicles"
                    label={<FieldLabel icon={<CarOutlined />}>{t('form.maxVehicles')}</FieldLabel>}
                    min={0}
                    addonAfter={t('form.vehiclesUnit')}
                    placeholder={t('form.unlimitedPlaceholder')}
                  />
                  {unlimitedHint}
                </div>
                <div className={styles.hinted}>
                  <NumberField
                    control={control}
                    name="maxBranches"
                    label={
                      <FieldLabel icon={<ApartmentOutlined />}>{t('form.maxBranches')}</FieldLabel>
                    }
                    min={0}
                    addonAfter={t('form.branchesUnit')}
                    placeholder={t('form.unlimitedPlaceholder')}
                  />
                  {unlimitedHint}
                </div>
              </>
            )}
          </div>

          {!isPackage ? (
            /*
              Trần của tuyến hoa hồng là QUY TẮC trong code (`OWNER_LITE_VEHICLE_LIMIT`), không
              phải dữ liệu của bậc — `vehicleQuotaFor` nhận ra tuyến này trước khi đọc tới
              `limits`. Hiện nó ra để admin không đi tìm, nhưng KHÔNG cho sửa.
            */
            <section className={styles.section}>
              <SectionHeader
                icon={<CarOutlined />}
                title={t('form.ownerLiteTitle')}
                hint={
                  <InfoHint label={t('form.ownerLiteHintLabel')} content={t('form.ownerLiteHint')} />
                }
              />
              <dl className={styles.readonlyGrid}>
                <div>
                  <dt>{t('form.maxVehicles')}</dt>
                  <dd>{t('form.vehiclesValue', { count: OWNER_LITE_VEHICLE_LIMIT })}</dd>
                </div>
                <div>
                  <dt>{t('form.maxBranches')}</dt>
                  <dd>
                    {COMMISSION_TRACK_BRANCH_LIMIT == null
                      ? t('form.unlimitedPlaceholder')
                      : t('form.branchesValue', { count: COMMISSION_TRACK_BRANCH_LIMIT })}
                  </dd>
                </div>
              </dl>
            </section>
          ) : (
            <>
              <div className={styles.options}>
                <OptionRow icon={<ShopOutlined />}>
                  <SwitchField
                    control={control}
                    name="salesOnly"
                    label={t('form.salesOnly')}
                    labelExtra={
                      <InfoHint label={t('form.salesOnlyHintLabel')} content={t('form.salesOnlyHint')} />
                    }
                  />
                </OptionRow>
                <OptionRow icon={<LikeOutlined />}>
                  <SwitchField
                    control={control}
                    name="recommended"
                    label={t('form.recommended')}
                    labelExtra={
                      <InfoHint
                        label={t('form.recommendedHintLabel')}
                        content={t('form.recommendedHint')}
                      />
                    }
                  />
                </OptionRow>
              </div>

              {/* Bậc tư vấn không có bảng giá niêm yết (ADR 0041 điều 5) — ẩn hẳn phần này. */}
              {salesOnly ? null : (
                <section className={styles.section}>
                  <SectionHeader
                    icon={<CalendarOutlined />}
                    title={t('form.sectionPricing')}
                    hint={
                      <InfoHint label={t('form.pricingHintLabel')} content={t('form.pricingHint')} />
                    }
                  />
                  {/* Nhãn kỳ hạn nằm BÊN TRÁI ô giá — ngữ cảnh bố cục ngang chỉ cho khối này. */}
                  <Form component={false} layout="horizontal" labelAlign="left" colon={false}>
                    <div className={styles.terms}>
                      {TERM_FIELDS.map(([field, months]) => {
                        const value = termPriceOfField[field];
                        const clearLabel = t('form.clearTerm', { months });
                        return (
                          <div key={field} className={styles.termRow}>
                            <NumberField
                              control={control}
                              name={field}
                              label={t('form.termPrice', { months })}
                              money
                              min={0}
                              placeholder={t('form.termNotSold')}
                            />
                            <div className={styles.termTag}>{termTag(months, value)}</div>
                            <Tooltip title={clearLabel}>
                              <Button
                                type="text"
                                className={styles.termClear}
                                icon={decorativeIcon(<DeleteOutlined />)}
                                aria-label={clearLabel}
                                disabled={value == null}
                                onClick={() => setValue(field, null, { shouldDirty: true })}
                              />
                            </Tooltip>
                          </div>
                        );
                      })}
                    </div>
                  </Form>
                </section>
              )}

              <Collapse
                className={styles.advanced}
                activeKey={advancedOpen ? [ADVANCED_PANEL] : []}
                onChange={(keys) => setAdvancedOpen(keys.includes(ADVANCED_PANEL))}
                items={[
                  {
                    key: ADVANCED_PANEL,
                    label: (
                      <span className={styles.advancedLabel}>
                        {decorativeIcon(<SettingOutlined />)}
                        {t('form.sectionAdvanced')}
                      </span>
                    ),
                    // Mount sẵn: lỗi validate của một ô đang gập vẫn cần một chỗ để hiện ra.
                    forceRender: true,
                    children: (
                      <div className={styles.grid}>
                        <div className={styles.hinted}>
                          <NumberField
                            control={control}
                            name="maxMembers"
                            label={
                              <FieldLabel icon={<TeamOutlined />}>{t('form.maxMembers')}</FieldLabel>
                            }
                            min={0}
                            placeholder={t('form.unlimitedPlaceholder')}
                          />
                          {unlimitedHint}
                        </div>
                        <NumberField
                          control={control}
                          name="graceDays"
                          label={
                            <FieldLabel icon={<CalendarOutlined />}>{t('form.graceDays')}</FieldLabel>
                          }
                          min={0}
                          addonAfter={t('form.graceDaysUnit')}
                        />
                        <div className={styles.hinted}>
                          <NumberField
                            control={control}
                            name="sortOrder"
                            label={
                              <FieldLabel icon={<StarOutlined />}>{t('form.sortOrder')}</FieldLabel>
                            }
                          />
                          <InfoHint
                            className={styles.hintCorner}
                            label={t('form.sortOrderHintLabel')}
                            content={t('form.sortOrderHint')}
                          />
                        </div>
                        <div className={cx(styles.full, styles.featuresCell)}>
                          <CheckboxGroupField
                            control={control}
                            name="features"
                            label={
                              <FieldLabel icon={<AppstoreOutlined />}>{t('form.features')}</FieldLabel>
                            }
                            options={PLAN_FEATURE_VALUES.map((feature) => ({
                              value: feature,
                              label: domainLabel('planFeature', feature),
                            }))}
                          />
                        </div>
                      </div>
                    ),
                  },
                ]}
              />
            </>
          )}
        </form>
      </Form>
    </ResponsiveDialog>
  );

  /**
   * Nhãn cạnh một ô giá — "Giá tham chiếu" ở kỳ 1 tháng (mốc của mọi % tiết kiệm), "Tiết kiệm N%"
   * ở các kỳ dài hơn. CÙNG công thức với `planTermSavingPercent` ở `@xeprime/types`, chỉ khác đầu
   * vào: ở đây là con số đang gõ dở trong form, chưa lưu.
   *
   * Không gọi thẳng hàm đó vì nó nhận một `PlanLimitsJson` đã chốt hình, còn cái admin cần thấy
   * là biểu giá mình ĐANG đặt ra. Công thức chỉ là một phép chia, và giữ nó ở đây tránh phải
   * dựng một `limits` giả sau mỗi phím gõ.
   */
  function termTag(months: number, total: number | null | undefined): ReactNode {
    if (months <= 1) {
      return total ? (
        <Tag color="gold" icon={decorativeIcon(<StarOutlined />)} className={styles.pill}>
          {t('form.referencePrice')}
        </Tag>
      ) : null;
    }
    if (!monthlyPrice || !total) return null;
    const saving = Math.round((1 - total / (monthlyPrice * months)) * 100);
    if (saving <= 0) return null;
    return (
      <Tag color="green" icon={decorativeIcon(<FallOutlined />)} className={styles.pill}>
        {t('form.termSaving', { percent: saving })}
      </Tag>
    );
  }
}

/** Nhãn ô nhập kèm icon trang trí — icon ẩn khỏi cây khả truy cập, tên ô chỉ là chữ. */
function FieldLabel({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <span className={styles.fieldLabel}>
      {decorativeIcon(icon)}
      {children}
    </span>
  );
}

function SectionHeader({ icon, title, hint }: { icon: ReactNode; title: string; hint: ReactNode }) {
  return (
    <div className={styles.sectionHeader}>
      <span className={styles.sectionIcon} aria-hidden="true">
        {icon}
      </span>
      <h3 className={styles.sectionTitle}>{title}</h3>
      {hint}
    </div>
  );
}

/** Một hàng công tắc dạng thẻ: ô icon bên trái, `SwitchField` chiếm phần còn lại. */
function OptionRow({ icon, children }: { icon: ReactNode; children: ReactNode }) {
  return (
    <div className={styles.optionRow}>
      <span className={styles.optionIcon} aria-hidden="true">
        {icon}
      </span>
      <div className={styles.optionBody}>{children}</div>
    </div>
  );
}

/** Giá kỳ `months` của một bậc — kỳ không bán hiện ô TRỐNG, không phải 0. */
function termPriceOf(plan: Plan, months: number): number | null {
  const found = plan.limits.termPrices.find((term) => term.months === months);
  return found ? Number(found.price) : null;
}
