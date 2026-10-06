'use client';

import {
  CATALOG_MARKET_STATUS,
  CATALOG_MARKET_STATUS_VALUES,
  CATALOG_SEAT_COUNT_MAX,
  CATALOG_SEAT_COUNT_MIN,
  FUEL_TYPE_VALUES,
  MOTORBIKE_CATEGORY_VALUES,
  TRANSMISSION_TYPE_EXT_VALUES,
  VEHICLE_TYPE,
  catalogSpecRule,
  vehicleFuelTypesFor,
  vehicleTransmissionTypesForFuels,
} from '@xeprime/types';
import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, type ReactNode } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';

import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { RadioGroupField } from '@/components/form/RadioGroupField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { useErrorMessage } from '@/i18n/use-error-message';

import {
  useCreateCatalogModel,
  useUpdateCatalogModel,
  type CatalogModelAdmin,
} from '../use-admin-catalog-models';
import styles from './CatalogModelFormModal.module.css';

/**
 * Cấu hình chỗ ngồi đưa ra dạng ô tick — đủ cho xe du lịch, bán tải, MPV, xe khách cho thuê.
 * Giá trị đang lưu mà không có trong danh sách (dữ liệu cũ, 34 chỗ…) vẫn được thêm vào lúc mở form.
 */
const COMMON_SEAT_COUNTS = [2, 4, 5, 6, 7, 8, 9, 12, 16, 29, 45] as const;

/** Mảng rỗng ỔN ĐỊNH cho `useWatch` chưa có giá trị — `?? []` đổi identity mỗi render và kéo theo memo. */
const NO_VALUES: never[] = [];

const yearField = yup
  .number()
  .nullable()
  .integer()
  .min(1950, 'yearRange')
  .max(2100, 'yearRange')
  .default(null);

const schema = yup.object({
  label: yup.string().trim().required('labelRequired').max(120),
  marketStatus: yup.string().oneOf(CATALOG_MARKET_STATUS_VALUES).default(CATALOG_MARKET_STATUS.CURRENT),
  motorbikeCategory: yup.string().oneOf(MOTORBIKE_CATEGORY_VALUES).nullable().default(null),
  // Ô tick trả chuỗi; đổi sang số lúc gửi.
  seatCounts: yup.array(yup.string().required()).default([]),
  fuelTypes: yup.array(yup.string().oneOf(FUEL_TYPE_VALUES).required()).default([]),
  transmissions: yup.array(yup.string().oneOf(TRANSMISSION_TYPE_EXT_VALUES).required()).default([]),
  engineDisplacementCc: yup.number().nullable().integer().min(1).default(null),
  yearFrom: yearField,
  yearTo: yearField.test('yearOrder', 'yearOrder', function check(value) {
    const from = this.parent.yearFrom as number | null;
    return value == null || from == null || value >= from;
  }),
  sourceUrl: yup.string().trim().max(2000).default(''),
  active: yup.boolean().default(true),
});

type FormValues = yup.InferType<typeof schema>;

/**
 * Thêm/sửa một MẪU XE của danh mục.
 *
 * Ba nhóm, theo đúng câu hỏi người quản trị đang trả lời:
 *  1. Nhận dạng — tên, nhóm thị trường, năm bán.
 *  2. Thông số ĐIỀN SẴN cho chủ xe — số chỗ (hoặc phân khúc), nguồn năng lượng, hộp số. Mỗi ô là
 *     một mảng theo luật `catalogSpecRule`: một giá trị thì form đăng xe điền sẵn và khoá, nhiều
 *     giá trị thì chủ xe chọn trong đó, trống thì chủ xe tự khai. Dòng "Chủ xe sẽ thấy" đọc ra
 *     đúng luật đó để admin không phải đoán hệ quả của một ô tick.
 *  3. Nguồn đối chiếu.
 *
 * Hãng và loại xe KHÔNG sửa được — chúng hiện thành dòng thông tin ở đầu form (bản cũ đặt câu
 * "không đổi được" ngay dưới ô Tên mẫu, đọc lên như thể tên mẫu bị khoá).
 */
export function CatalogModelFormModal({
  open,
  vehicleType,
  brandKey,
  brandLabel,
  model,
  onClose,
}: {
  open: boolean;
  vehicleType: string;
  brandKey: string;
  brandLabel: string;
  /** null = thêm mới. */
  model: CatalogModelAdmin | null;
  onClose: () => void;
}) {
  const t = useTranslations('AdminCatalog.models');
  const tForm = useTranslations('AdminCatalog.form');
  const tCommon = useTranslations('Common');
  const resolver = useValidationResolver<FormValues>(schema, 'AdminCatalog.models');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();

  const create = useCreateCatalogModel();
  const update = useUpdateCatalogModel();
  const isEdit = Boolean(model);
  const pending = create.isPending || update.isPending;
  const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;

  const { control, handleSubmit, setValue, getValues } = useForm<FormValues>({
    resolver,
    defaultValues: model
      ? {
          label: model.label,
          marketStatus: model.marketStatus as FormValues['marketStatus'],
          motorbikeCategory: model.motorbikeCategory as FormValues['motorbikeCategory'],
          seatCounts: model.seatCounts.map(String),
          fuelTypes: model.fuelTypes as FormValues['fuelTypes'],
          transmissions: model.transmissions as FormValues['transmissions'],
          engineDisplacementCc: model.engineDisplacementCc,
          yearFrom: model.yearFrom,
          yearTo: model.yearTo,
          sourceUrl: model.sourceUrl ?? '',
          active: model.active,
        }
      : {
          label: '',
          marketStatus: CATALOG_MARKET_STATUS.CURRENT,
          motorbikeCategory: null,
          seatCounts: [],
          fuelTypes: [],
          transmissions: [],
          engineDisplacementCc: null,
          yearFrom: null,
          yearTo: null,
          sourceUrl: '',
          active: true,
        },
  });

  const fuelTypes = useWatch({ control, name: 'fuelTypes' }) ?? NO_VALUES;
  const transmissions = useWatch({ control, name: 'transmissions' }) ?? NO_VALUES;
  const seatCounts = useWatch({ control, name: 'seatCounts' }) ?? NO_VALUES;
  const motorbikeCategory = useWatch({ control, name: 'motorbikeCategory' });

  // Hộp số lọc theo nguồn năng lượng đã tick — cùng hàm backend dùng để TỪ CHỐI tổ hợp sai.
  const allowedTransmissions = useMemo(
    () => vehicleTransmissionTypesForFuels(vehicleType, fuelTypes),
    [vehicleType, fuelTypes],
  );
  const allowedKey = allowedTransmissions.join(',');

  /*
   * Đổi nguồn năng lượng ⇒ bỏ các hộp số không còn hợp lệ; còn đúng MỘT lựa chọn (xe điện ⇒
   * 1 cấp) thì chọn luôn. Chạy theo danh sách cho phép, không theo từng lần tick hộp số, nên admin
   * vẫn bỏ tick được lựa chọn duy nhất nếu muốn để trống.
   */
  useEffect(() => {
    const current = getValues('transmissions') ?? [];
    const kept = current.filter((v) => (allowedTransmissions as readonly string[]).includes(v));
    const fuels = getValues('fuelTypes') ?? [];
    const next =
      fuels.length > 0 && allowedTransmissions.length === 1 ? [...allowedTransmissions] : kept;
    if (next.length !== current.length || next.some((v, i) => v !== current[i])) {
      setValue('transmissions', next as FormValues['transmissions'], { shouldDirty: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- chỉ phản ứng khi tập cho phép đổi
  }, [allowedKey]);

  const seatOptions = useMemo(() => {
    const values = new Set<number>([...COMMON_SEAT_COUNTS, ...(model?.seatCounts ?? [])]);
    return [...values]
      .filter((n) => n >= CATALOG_SEAT_COUNT_MIN && n <= CATALOG_SEAT_COUNT_MAX)
      .sort((a, b) => a - b)
      .map((n) => ({ value: String(n), label: String(n) }));
  }, [model?.seatCounts]);
  const marketStatusOptions = useMemo(
    () =>
      CATALOG_MARKET_STATUS_VALUES.map((value) => ({
        value,
        label: domainLabel('catalogMarketStatus', value),
      })),
    [domainLabel],
  );
  const categoryOptions = useMemo(
    () =>
      MOTORBIKE_CATEGORY_VALUES.map((value) => ({
        value,
        label: domainLabel('motorbikeCategory', value),
      })),
    [domainLabel],
  );
  const fuelOptions = useMemo(
    () =>
      vehicleFuelTypesFor(vehicleType).map((value) => ({
        value,
        label: domainLabel('fuelType', value),
      })),
    [domainLabel, vehicleType],
  );
  const transmissionOptions = useMemo(
    () =>
      allowedTransmissions.map((value) => ({
        value,
        label: domainLabel('transmissionType', value),
      })),
    [domainLabel, allowedTransmissions],
  );

  const preview = [
    isMotorbike
      ? {
          key: 'category',
          label: t('motorbikeCategory'),
          values: motorbikeCategory ? [domainLabel('motorbikeCategory', motorbikeCategory)] : [],
        }
      : {
          key: 'seats',
          label: t('seatCounts'),
          values: [...seatCounts]
            .map(Number)
            .sort((a, b) => a - b)
            .map((count) => tCommon('units.seat', { count })),
        },
    {
      key: 'fuel',
      label: t('fuelTypes'),
      values: fuelTypes.map((v) => domainLabel('fuelType', v)),
    },
    {
      key: 'transmission',
      label: t('transmissions'),
      values: transmissions.map((v) => domainLabel('transmissionType', v)),
    },
  ];

  function describeRule(values: string[]): string {
    const rule = catalogSpecRule(values);
    if (rule.kind === 'fixed') return t('preview.fixed', { value: rule.value });
    if (rule.kind === 'choice') return t('preview.choice', { values: rule.values.join(', ') });
    return t('preview.free');
  }

  const onSubmit = handleSubmit((values) => {
    if (pending) return;
    const shared = {
      label: values.label.trim(),
      marketStatus: values.marketStatus,
      motorbikeCategory: isMotorbike ? (values.motorbikeCategory ?? null) : null,
      seatCounts: isMotorbike ? [] : (values.seatCounts ?? []).map(Number),
      fuelTypes: values.fuelTypes ?? [],
      transmissions: values.transmissions ?? [],
      engineDisplacementCc: values.engineDisplacementCc,
      yearFrom: values.yearFrom,
      yearTo: values.yearTo,
      sourceUrl: values.sourceUrl?.trim() || null,
      active: values.active,
    };
    const done = {
      onSuccess: () => {
        message.success(isEdit ? t('updated') : t('created'));
        onClose();
      },
      onError: (err: unknown) => message.error(errorMessage(err)),
    };
    if (model) update.mutate({ id: model.id, ...shared }, done);
    else create.mutate({ brandKey, vehicleType, ...shared }, done);
  });

  return (
    <ResponsiveDialog
      title={isEdit ? t('editTitle', { label: model?.label ?? '' }) : t('createTitle', { brand: brandLabel })}
      open={open}
      onClose={onClose}
      size="lg"
      okText={isEdit ? tForm('save') : tForm('add')}
      onOk={() => void onSubmit()}
      confirmLoading={pending}
    >
      <div className={styles.context}>
        <dl className={styles.facts}>
          <Fact label={t('context.brand')}>{brandLabel}</Fact>
          <Fact label={t('context.vehicleType')}>{domainLabel('vehicleType', vehicleType)}</Fact>
          {model ? (
            <Fact label={t('context.key')}>
              <code className={styles.code}>{model.key}</code>
            </Fact>
          ) : null}
        </dl>
        <p className={styles.contextHelp}>{t('context.help')}</p>
      </div>

      <DialogForm onSubmit={onSubmit} labelWidth="md">
        <h3 className={styles.sectionTitle}>{t('sections.identity')}</h3>
        <TextField
          control={control}
          name="label"
          label={t('label')}
          placeholder={t('labelPlaceholder')}
          help={t('labelHelp')}
          required
        />
        <RadioGroupField
          control={control}
          name="marketStatus"
          label={t('marketStatus')}
          options={marketStatusOptions}
          help={t('marketStatusHelp')}
        />
        <NumberField
          control={control}
          name="yearFrom"
          label={t('yearFrom')}
          min={1950}
          max={2100}
        />
        <NumberField
          control={control}
          name="yearTo"
          label={t('yearTo')}
          min={1950}
          max={2100}
          help={t('yearsHelp')}
        />

        <h3 className={styles.sectionTitle}>{t('sections.specs')}</h3>
        <p className={styles.sectionHint}>{t('sections.specsHint')}</p>
        {isMotorbike ? (
          <SelectField
            control={control}
            name="motorbikeCategory"
            label={t('motorbikeCategory')}
            options={categoryOptions}
            help={t('motorbikeCategoryHelp')}
            allowClear
          />
        ) : (
          <CheckboxGroupField
            control={control}
            name="seatCounts"
            label={t('seatCounts')}
            options={seatOptions}
            vertical={false}
          />
        )}
        <CheckboxGroupField
          control={control}
          name="fuelTypes"
          label={t('fuelTypes')}
          options={fuelOptions}
          vertical={false}
        />
        <CheckboxGroupField
          control={control}
          name="transmissions"
          label={t('transmissions')}
          options={transmissionOptions}
          help={t('transmissionsHelp')}
          vertical={false}
        />
        <NumberField
          control={control}
          name="engineDisplacementCc"
          label={t('engineDisplacementCc')}
          help={t('engineDisplacementHelp')}
          min={1}
        />

        <div className={styles.preview} aria-live="polite">
          <span className={styles.previewTitle}>{t('preview.title')}</span>
          <ul className={styles.previewList}>
            {preview.map((row) => (
              <li key={row.key}>
                <span className={styles.previewLabel}>{row.label}:</span> {describeRule(row.values)}
              </li>
            ))}
          </ul>
        </div>

        <h3 className={styles.sectionTitle}>{t('sections.source')}</h3>
        <TextField
          control={control}
          name="sourceUrl"
          label={t('sourceUrl')}
          placeholder={t('sourceUrlPlaceholder')}
          help={
            model?.verifiedAt
              ? `${t('verifiedAt', { date: fmt.date(model.verifiedAt) })}. ${t('sourceUrlHelp')}`
              : t('sourceUrlHelp')
          }
        />
        <SwitchField
          control={control}
          name="active"
          label={tForm('active')}
          description={tForm('activeHelp')}
        />
      </DialogForm>
    </ResponsiveDialog>
  );
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className={styles.fact}>
      <dt>{label}</dt>
      <dd>{children}</dd>
    </div>
  );
}
