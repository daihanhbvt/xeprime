'use client';

import {
  BODY_TYPE_VALUES,
  CATALOG_SEAT_COUNT_MAX,
  CATALOG_TYPE,
  VEHICLE_DATA_LIMITS,
  VEHICLE_DATA_RENT_FIELDS,
  VEHICLE_DATA_STATUS,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_TYPE,
  VEHICLE_TYPE_VALUES,
  vehicleFuelTypesFor,
  vehicleTransmissionTypesFor,
  vehicleTransmissionTypesForFuels,
  type VehicleDataRentField,
} from '@xeprime/types';
import { App, Button } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useForm, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import * as yup from 'yup';

import { CheckboxGroupField } from '@/components/form/CheckboxGroupField';
import { DialogForm } from '@/components/form/DialogForm';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextField } from '@/components/form/TextField';
import { DetailDrawer } from '@/components/overlay/DetailDrawer';
import { ReasonDialog } from '@/components/overlay/ReasonDialog';
import {
  WORK_DRAWER_BODY_CLASS,
  WorkDrawerFooter,
  WorkDrawerLayout,
  WorkDrawerPager,
  WorkDrawerTitle,
} from '@/components/overlay/WorkDrawer';
import { useCatalogItems } from '@/features/catalog/use-catalog';
import { useCatalogModels } from '@/features/catalog/use-catalog-models';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { getErrorCode } from '@/services/api-client';
import { API_ERROR_CODE } from '@xeprime/types';

import {
  useApproveVehicleData,
  useCreateVehicleData,
  useDeleteVehicleData,
  useRejectVehicleData,
  useUpdateVehicleData,
  useVehicleDataDetail,
} from '../hooks';
import { vehicleDataTitle } from '../format';
import type { VehicleDataDetail, VehicleDataInput } from '../types';
import { VehicleDataMergeDialog } from './VehicleDataMergeDialog';
import { VehicleDataSide } from './VehicleDataSide';
import { VehicleDataStatusTag } from './VehicleDataStatusTag';
import styles from './VehicleData.module.css';

/** `?open=new` = panel ở chế độ thêm mới. */
export const NEW_RECORD = 'new';

const YEAR_MIN = VEHICLE_DATA_LIMITS.yearMin;
const YEAR_MAX = 2100;
const REJECT_REASON_MIN = 3;

const optionalInt = (max: number) =>
  yup
    .number()
    .nullable()
    .integer('numberInvalid')
    .min(1, 'numberInvalid')
    .max(max, 'numberInvalid')
    .default(null);
const optionalYear = yup
  .number()
  .nullable()
  .integer('yearRange')
  .min(YEAR_MIN, 'yearRange')
  .max(YEAR_MAX, 'yearRange')
  .default(null);
const optionalPrice = yup
  .number()
  .nullable()
  .integer('numberInvalid')
  .min(1, 'numberInvalid')
  .max(VEHICLE_DATA_LIMITS.priceMax, 'numberInvalid')
  .default(null);
const optionalDecimal = yup
  .number()
  .nullable()
  .min(0.1, 'numberInvalid')
  .max(9999, 'numberInvalid')
  .default(null);

const schema = yup.object({
  vehicleType: yup
    .string()
    .oneOf([...VEHICLE_TYPE_VALUES])
    .required(),
  brandKey: yup
    .string()
    .nullable()
    .default(null)
    .test('brand', 'brandRequired', (value) => Boolean(value)),
  modelId: yup
    .string()
    .nullable()
    .default(null)
    .test('model', 'modelRequired', function hasModel(value) {
      return Boolean(value) || Boolean(this.parent.newModelLabel);
    }),
  newModelLabel: yup.string().nullable().default(null),
  variantLabel: yup.string().trim().max(VEHICLE_DATA_LIMITS.labelMax, 'labelTooLong').default(''),
  yearFrom: optionalYear,
  yearTo: optionalYear.test('order', 'yearOrder', function order(value) {
    const from = this.parent.yearFrom as number | null;
    return value == null || from == null || value >= from;
  }),
  seatCount: optionalInt(CATALOG_SEAT_COUNT_MAX),
  bodyType: yup.string().nullable().default(null),
  fuelType: yup.string().nullable().default(null),
  transmission: yup.string().nullable().default(null),
  engineDisplacementCc: optionalInt(30000),
  horsepowerHp: optionalInt(5000),
  lengthMm: optionalInt(30000),
  widthMm: optionalInt(10000),
  heightMm: optionalInt(10000),
  curbWeightKg: optionalInt(100000),
  fuelConsumptionCombined: optionalDecimal,
  electricRangeKm: optionalInt(5000),
  batteryCapacityKwh: optionalDecimal,
  featureKeys: yup.array(yup.string().required()).default([]),
  listPrice: optionalPrice,
  hourlyPrice: optionalPrice,
  weekdayPrice: optionalPrice,
  weekendPrice: optionalPrice,
  monthlyPrice: optionalPrice,
  withDriverDailyPrice: optionalPrice,
  active: yup.boolean().default(true),
});

export type VehicleDataFormValues = yup.InferType<typeof schema>;

const NUMBER_SPECS = [
  'engineDisplacementCc',
  'horsepowerHp',
  'lengthMm',
  'widthMm',
  'heightMm',
  'curbWeightKg',
  'electricRangeKm',
] as const;

function toNumber(value: string | null | undefined): number | null {
  if (value == null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function defaultsFrom(detail: VehicleDataDetail | null): VehicleDataFormValues {
  return {
    vehicleType: (detail?.vehicleType ?? VEHICLE_TYPE.CAR) as VehicleDataFormValues['vehicleType'],
    brandKey: detail?.brandKey ?? null,
    modelId: detail?.modelId ?? null,
    newModelLabel: null,
    variantLabel: detail?.variantLabel ?? '',
    yearFrom: detail?.yearFrom ?? null,
    yearTo: detail?.yearTo ?? null,
    seatCount: detail?.seatCount ?? null,
    bodyType: detail?.bodyType ?? null,
    fuelType: detail?.fuelType ?? null,
    transmission: detail?.transmission ?? null,
    engineDisplacementCc: detail?.engineDisplacementCc ?? null,
    horsepowerHp: detail?.horsepowerHp ?? null,
    lengthMm: detail?.lengthMm ?? null,
    widthMm: detail?.widthMm ?? null,
    heightMm: detail?.heightMm ?? null,
    curbWeightKg: detail?.curbWeightKg ?? null,
    fuelConsumptionCombined: toNumber(detail?.fuelConsumptionCombined),
    electricRangeKm: detail?.electricRangeKm ?? null,
    batteryCapacityKwh: toNumber(detail?.batteryCapacityKwh),
    featureKeys: detail?.featureKeys ?? [],
    listPrice: toNumber(detail?.listPrice),
    hourlyPrice: toNumber(detail?.hourlyPrice),
    weekdayPrice: toNumber(detail?.weekdayPrice),
    weekendPrice: toNumber(detail?.weekendPrice),
    monthlyPrice: toNumber(detail?.monthlyPrice),
    withDriverDailyPrice: toNumber(detail?.withDriverDailyPrice),
    active: detail ? detail.status !== VEHICLE_DATA_STATUS.HIDDEN : true,
  };
}

const money = (v: number | null | undefined) => (v == null ? null : String(Math.round(v)));
const decimal = (v: number | null | undefined) => (v == null ? null : String(v));

function toBody(values: VehicleDataFormValues): VehicleDataInput {
  const isMotorbike = values.vehicleType === VEHICLE_TYPE.MOTORBIKE;
  return {
    vehicleType: values.vehicleType,
    ...(values.newModelLabel
      ? { brandKey: values.brandKey ?? undefined, newModelLabel: values.newModelLabel }
      : { modelId: values.modelId ?? undefined }),
    variantLabel: values.variantLabel.trim(),
    yearFrom: values.yearFrom,
    yearTo: values.yearTo,
    seatCount: isMotorbike ? null : values.seatCount,
    bodyType: (isMotorbike ? null : values.bodyType) as VehicleDataInput['bodyType'],
    fuelType: values.fuelType as VehicleDataInput['fuelType'],
    transmission: values.transmission as VehicleDataInput['transmission'],
    engineDisplacementCc: values.engineDisplacementCc,
    horsepowerHp: values.horsepowerHp,
    lengthMm: values.lengthMm,
    widthMm: values.widthMm,
    heightMm: values.heightMm,
    curbWeightKg: values.curbWeightKg,
    fuelConsumptionCombined: decimal(values.fuelConsumptionCombined),
    electricRangeKm: values.electricRangeKm,
    batteryCapacityKwh: decimal(values.batteryCapacityKwh),
    featureKeys: values.featureKeys as VehicleDataInput['featureKeys'],
    listPrice: money(values.listPrice),
    hourlyPrice: money(values.hourlyPrice),
    weekdayPrice: money(values.weekdayPrice),
    weekendPrice: money(values.weekendPrice),
    monthlyPrice: money(values.monthlyPrice),
    withDriverDailyPrice: money(values.withDriverDailyPrice),
    active: values.active,
  };
}

/**
 * Panel làm việc của MỘT xe chuẩn (khuôn `WorkDrawer`): bên trái sửa trực tiếp toàn bộ dữ liệu
 * (nhận dạng · thông số · tiện ích · giá bán · giá thuê), bên phải tình hình sử dụng (xe đang dùng,
 * giá thực tế, giá trị theo năm, dữ liệu có thể trùng). Dữ liệu chờ duyệt từ chủ xe mở CÙNG panel
 * này, chân panel đổi sang Duyệt / Gộp / Từ chối.
 */
export function VehicleDataDrawer({
  openId,
  previousId,
  nextId,
  onNavigate,
  onClose,
}: {
  openId: string | null;
  previousId: string | null;
  nextId: string | null;
  onNavigate: (id: string) => void;
  onClose: () => void;
}) {
  const t = useTranslations('AdminVehicleData');
  const { message, modal } = App.useApp();
  const errorMessage = useErrorMessage();
  const isNew = openId === NEW_RECORD;
  const detailQuery = useVehicleDataDetail(openId && !isNew ? openId : null);
  const detail = isNew ? null : (detailQuery.data ?? null);

  const resolver = useValidationResolver<VehicleDataFormValues>(
    schema,
    'AdminVehicleData.form.errors',
  );
  const { control, handleSubmit, reset, setValue, formState } = useForm<VehicleDataFormValues>({
    resolver,
    defaultValues: defaultsFrom(null),
  });
  // Form sống suốt đời panel ⇒ nạp lại khi đổi bản ghi (và sau mỗi lần lưu), không mang dữ liệu
  // của xe trước sang xe sau.
  const recordKey = isNew ? NEW_RECORD : detail ? `${detail.id}:${detail.updatedAt}` : null;
  useEffect(() => {
    if (recordKey) reset(defaultsFrom(detail));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [recordKey]);

  const create = useCreateVehicleData();
  const update = useUpdateVehicleData();
  const approve = useApproveVehicleData();
  const remove = useDeleteVehicleData();
  const reject = useRejectVehicleData();
  const busy =
    create.isPending ||
    update.isPending ||
    approve.isPending ||
    remove.isPending ||
    reject.isPending;
  const [mergeOpen, setMergeOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const topRef = useRef<HTMLDivElement>(null);

  /** Quyết định xong ⇒ sang bản ghi kế (đã chụp TRƯỚC khi gọi), hết thì đóng. */
  const moveOn = (after: string | null) => (after ? onNavigate(after) : onClose());

  const save = handleSubmit((values) => {
    if (busy) return;
    const body = toBody(values);
    if (isNew) {
      create.mutate(body, {
        onSuccess: (saved) => {
          message.success(t('drawer.created'));
          onNavigate(saved.id);
        },
        onError: (err) => message.error(errorMessage(err)),
      });
      return;
    }
    if (!detail) return;
    update.mutate(
      { id: detail.id, body },
      {
        onSuccess: () => message.success(t('drawer.saved')),
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  });

  const saveAndApprove = handleSubmit(async (values) => {
    if (busy || !detail) return;
    try {
      if (formState.isDirty) await update.mutateAsync({ id: detail.id, body: toBody(values) });
      await approve.mutateAsync({ id: detail.id });
      message.success(t('drawer.approved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  });

  const confirmDelete = () => {
    if (!detail) return;
    const after = nextId ?? previousId;
    modal.confirm({
      title: t('drawer.deleteConfirm.title'),
      content: t('drawer.deleteConfirm.body'),
      okText: t('drawer.deleteConfirm.ok'),
      okButtonProps: { danger: true },
      onOk: () =>
        remove.mutateAsync(detail.id).then(
          () => {
            message.success(t('drawer.deleted'));
            moveOn(after);
          },
          (err) =>
            message.error(
              getErrorCode(err) === API_ERROR_CODE.CATALOG_VARIANT_IN_USE
                ? t('drawer.inUse')
                : errorMessage(err),
            ),
        ),
    });
  };

  const submitReject = (reason: string) => {
    if (!detail || reject.isPending) return;
    const after = nextId;
    reject.mutate(
      { id: detail.id, reason },
      {
        onSuccess: () => {
          message.success(t('drawer.rejected'));
          setRejectOpen(false);
          moveOn(after);
        },
        onError: (err) => message.error(errorMessage(err)),
      },
    );
  };

  const status = detail?.status;
  const pending = status === VEHICLE_DATA_STATUS.PENDING;
  const hint = isNew
    ? t('drawer.hintNew')
    : pending
      ? t('drawer.hintPending')
      : status === VEHICLE_DATA_STATUS.HIDDEN
        ? t('drawer.hintHidden')
        : status
          ? t('drawer.hintActive')
          : undefined;

  const footer =
    isNew || detail ? (
      <WorkDrawerFooter
        hint={hint}
        actions={
          isNew ? (
            <Button type="primary" loading={create.isPending} onClick={() => void save()}>
              {t('drawer.add')}
            </Button>
          ) : pending ? (
            <>
              <Button danger disabled={busy} onClick={() => setRejectOpen(true)}>
                {t('drawer.reject')}
              </Button>
              <Button disabled={busy} onClick={() => setMergeOpen(true)}>
                {t('drawer.merge')}
              </Button>
              <Button
                loading={update.isPending && !approve.isPending}
                disabled={busy}
                onClick={() => void save()}
              >
                {t('drawer.save')}
              </Button>
              <Button
                type="primary"
                loading={approve.isPending}
                disabled={busy}
                onClick={() => void saveAndApprove()}
              >
                {t('drawer.saveApprove')}
              </Button>
            </>
          ) : (
            <>
              <Button danger type="text" disabled={busy} onClick={confirmDelete}>
                {t('drawer.delete')}
              </Button>
              <Button
                type="primary"
                loading={update.isPending}
                disabled={busy}
                onClick={() => void save()}
              >
                {t('drawer.save')}
              </Button>
            </>
          )
        }
      />
    ) : null;

  return (
    <>
      <DetailDrawer
        open={Boolean(openId)}
        onClose={onClose}
        size="xl"
        closeAtEnd
        ariaLabel={isNew ? t('drawer.titleNew') : t('drawer.title')}
        title={
          <WorkDrawerTitle
            label={
              isNew ? t('drawer.titleNew') : detail ? vehicleDataTitle(detail) : t('drawer.title')
            }
            status={detail ? <VehicleDataStatusTag status={detail.status} /> : null}
          />
        }
        extra={
          isNew ? null : (
            <WorkDrawerPager
              previousId={previousId}
              nextId={nextId}
              onNavigate={onNavigate}
              previousLabel={t('drawer.previous')}
              nextLabel={t('drawer.next')}
            />
          )
        }
        loading={!isNew && detailQuery.isLoading}
        error={!isNew && detailQuery.isError && !detail}
        errorTitle={t('drawer.loadError')}
        onRetry={() => void detailQuery.refetch()}
        bodyClassName={WORK_DRAWER_BODY_CLASS}
        footer={footer}
      >
        {isNew || detail ? (
          <WorkDrawerLayout
            ref={topRef}
            sideLabel={t('drawer.sideLabel')}
            main={
              <DialogForm
                labelPosition="top"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (pending) void saveAndApprove();
                  else void save();
                }}
              >
                <VehicleDataFormFields
                  control={control}
                  setValue={setValue}
                  isNew={isNew}
                  detail={detail}
                />
              </DialogForm>
            }
            side={detail ? <VehicleDataSide detail={detail} onNavigate={onNavigate} /> : undefined}
          />
        ) : null}
      </DetailDrawer>

      {detail ? (
        <VehicleDataMergeDialog
          open={mergeOpen}
          source={detail}
          onClose={() => setMergeOpen(false)}
          onMerged={(count) => {
            const after = nextId;
            message.success(t('drawer.merged', { count }));
            setMergeOpen(false);
            moveOn(after);
          }}
        />
      ) : null}

      <ReasonDialog
        open={rejectOpen}
        title={t('reject.title')}
        summary={t('reject.summary')}
        audienceHint={t('reject.hint')}
        label={t('reject.label')}
        placeholder={t('reject.placeholder')}
        requiredMessage={t('reject.required')}
        minLength={REJECT_REASON_MIN}
        maxLength={VEHICLE_DATA_LIMITS.noteMax}
        submitText={t('reject.submit')}
        loading={reject.isPending}
        onSubmit={submitReject}
        onClose={() => setRejectOpen(false)}
      />
    </>
  );
}

/** Các ô của form xe chuẩn — chia nhóm đúng như form đăng xe của chủ xe. */
function VehicleDataFormFields({
  control,
  setValue,
  isNew,
  detail,
}: {
  control: Control<VehicleDataFormValues>;
  setValue: UseFormSetValue<VehicleDataFormValues>;
  isNew: boolean;
  detail: VehicleDataDetail | null;
}) {
  const t = useTranslations('AdminVehicleData.form');
  const domainLabel = useDomainLabel();
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const brandKey = useWatch({ control, name: 'brandKey' });
  const modelId = useWatch({ control, name: 'modelId' });
  const newModelLabel = useWatch({ control, name: 'newModelLabel' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const pending = detail?.status === VEHICLE_DATA_STATUS.PENDING;
  const isMotorbike = vehicleType === VEHICLE_TYPE.MOTORBIKE;

  const { items: brands } = useCatalogItems(CATALOG_TYPE.VEHICLE_BRAND);
  const brandOptions = useMemo(
    () =>
      brands
        .filter(
          (b) => b.vehicleTypes.length === 0 || (b.vehicleTypes as string[]).includes(vehicleType),
        )
        .map((b) => ({ value: b.key, label: b.label })),
    [brands, vehicleType],
  );
  const { models, isLoading: modelsLoading } = useCatalogModels({
    vehicleType,
    brandKey,
    includeId: modelId,
  });
  const modelOptions = useMemo(
    () => models.map((m) => ({ value: m.id, label: m.label })),
    [models],
  );
  const fuelOptions = useMemo(
    () =>
      vehicleFuelTypesFor(vehicleType).map((value) => ({
        value,
        label: domainLabel('fuelType', value),
      })),
    [vehicleType, domainLabel],
  );
  // Hộp số lọc theo nhiên liệu — cùng hàm server dùng để TỪ CHỐI tổ hợp sai.
  const transmissionOptions = useMemo(
    () =>
      (fuelType
        ? vehicleTransmissionTypesFor(vehicleType, fuelType)
        : vehicleTransmissionTypesForFuels(vehicleType, vehicleFuelTypesFor(vehicleType))
      ).map((value) => ({ value, label: domainLabel('transmissionType', value) })),
    [vehicleType, fuelType, domainLabel],
  );
  const bodyOptions = useMemo(
    () => BODY_TYPE_VALUES.map((value) => ({ value, label: domainLabel('bodyType', value) })),
    [domainLabel],
  );
  const { items: features } = useCatalogItems(CATALOG_TYPE.VEHICLE_FEATURE);
  const featureOptions = useMemo(
    () =>
      features
        .filter(
          (f) =>
            (VEHICLE_FEATURE_KEYS as readonly string[]).includes(f.key) &&
            (f.vehicleTypes.length === 0 || (f.vehicleTypes as string[]).includes(vehicleType)),
        )
        .map((f) => ({ value: f.key, label: f.label })),
    [features, vehicleType],
  );
  const opts = { shouldDirty: true } as const;

  return (
    <>
      <section className={styles.section} aria-labelledby="vd-identity">
        <h3 id="vd-identity" className={styles.sectionTitle}>
          {t('sections.identity')}
        </h3>
        <div className={styles.grid}>
          {isNew ? (
            <div className={styles.gridWide}>
              <SelectField
                control={control}
                name="vehicleType"
                label={t('vehicleType')}
                options={VEHICLE_TYPE_VALUES.map((value) => ({
                  value,
                  label: domainLabel('vehicleType', value),
                }))}
                onAfterChange={() => {
                  setValue('brandKey', null, opts);
                  setValue('modelId', null, opts);
                  setValue('newModelLabel', null, opts);
                }}
              />
            </div>
          ) : null}
          <SelectField
            control={control}
            name="brandKey"
            label={t('brand')}
            options={brandOptions}
            placeholder={t('brandPlaceholder')}
            required
            showSearch
            onAfterChange={() => {
              setValue('modelId', null, opts);
              setValue('newModelLabel', null, opts);
            }}
          />
          <div>
            <SelectField
              control={control}
              name="modelId"
              label={t('model')}
              options={modelOptions}
              placeholder={newModelLabel ? newModelLabel : t('modelPlaceholder')}
              help={brandKey ? undefined : t('modelPickBrand')}
              disabled={!brandKey}
              loading={modelsLoading}
              required
              showSearch
              onAfterChange={() => setValue('newModelLabel', null, opts)}
              creatable={{
                optionLabel: (text) => t('addModel', { text }),
                onCreate: (text) => {
                  setValue('modelId', null, opts);
                  setValue('newModelLabel', text, { shouldDirty: true, shouldValidate: true });
                },
              }}
            />
            {newModelLabel ? (
              <p className={styles.note}>
                {t('newModel', { name: newModelLabel })}{' '}
                <Button
                  type="link"
                  size="small"
                  onClick={() => setValue('newModelLabel', null, opts)}
                >
                  {t('undoNewModel')}
                </Button>
              </p>
            ) : null}
            {detail?.modelPending && modelId === detail.modelId ? (
              <p className={styles.noteWarning}>{t('pendingModel')}</p>
            ) : null}
          </div>
          <TextField
            control={control}
            name="variantLabel"
            label={t('variant')}
            placeholder={t('variantPlaceholder')}
            help={t('variantHelp')}
          />
          <NumberField
            control={control}
            name="yearFrom"
            label={t('yearFrom')}
            min={YEAR_MIN}
            max={YEAR_MAX}
          />
          <NumberField
            control={control}
            name="yearTo"
            label={t('yearTo')}
            min={YEAR_MIN}
            max={YEAR_MAX}
            help={t('yearToHelp')}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="vd-specs">
        <h3 id="vd-specs" className={styles.sectionTitle}>
          {t('sections.specs')}
        </h3>
        <div className={styles.grid}>
          {isMotorbike ? null : (
            <NumberField control={control} name="seatCount" label={t('seatCount')} min={1} />
          )}
          {isMotorbike ? null : (
            <SelectField
              control={control}
              name="bodyType"
              label={t('bodyType')}
              options={bodyOptions}
              allowClear
            />
          )}
          <SelectField
            control={control}
            name="fuelType"
            label={t('fuelType')}
            options={fuelOptions}
            allowClear
          />
          <SelectField
            control={control}
            name="transmission"
            label={t('transmission')}
            options={transmissionOptions}
            allowClear
          />
          {NUMBER_SPECS.map((name) => (
            <NumberField
              key={name}
              control={control}
              name={name}
              label={t(`fields.${name}`)}
              min={1}
            />
          ))}
          <NumberField
            control={control}
            name="fuelConsumptionCombined"
            label={t('fields.fuelConsumptionCombined')}
            min={0}
            precision={2}
          />
          <NumberField
            control={control}
            name="batteryCapacityKwh"
            label={t('fields.batteryCapacityKwh')}
            min={0}
            precision={2}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="vd-features">
        <h3 id="vd-features" className={styles.sectionTitle}>
          {t('sections.features')}
        </h3>
        <CheckboxGroupField
          control={control}
          name="featureKeys"
          label={t('featureKeys')}
          options={featureOptions}
          vertical={false}
        />
      </section>

      <section className={styles.section} aria-labelledby="vd-prices">
        <h3 id="vd-prices" className={styles.sectionTitle}>
          {t('sections.prices')}
        </h3>
        <div className={styles.grid}>
          <NumberField
            control={control}
            name="listPrice"
            label={t('listPrice')}
            money
            help={t('listPriceHelp')}
          />
        </div>
      </section>

      <section className={styles.section} aria-labelledby="vd-rent">
        <h3 id="vd-rent" className={styles.sectionTitle}>
          {t('sections.rent')}
        </h3>
        <p className={styles.sectionHint}>{t('rentHelp')}</p>
        <div className={styles.grid}>
          {VEHICLE_DATA_RENT_FIELDS.map((field: VehicleDataRentField) => (
            <NumberField
              key={field}
              control={control}
              name={field}
              label={t(`rent.${field}`)}
              money
            />
          ))}
        </div>
      </section>

      {pending ? null : (
        <section className={styles.section} aria-labelledby="vd-status">
          <h3 id="vd-status" className={styles.sectionTitle}>
            {t('sections.status')}
          </h3>
          <SwitchField
            control={control}
            name="active"
            label={t('active')}
            description={t('activeHelp')}
          />
        </section>
      )}
    </>
  );
}
