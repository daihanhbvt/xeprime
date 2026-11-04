'use client';

import { Alert, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { VEHICLE_PUBLIC_STATUS, VEHICLE_TYPE, isVehicleFuelTypeAllowed } from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';

import { StickyFormActions } from '@/components/form/StickyFormActions';
import { TextAreaField } from '@/components/form/TextAreaField';
import { branchLabel } from '@/features/branches/branch-label';
import { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { useSupportSession } from '@/features/tenant-support/support-session';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useWorkspace } from '@/hooks/use-workspace';
import { useValidationResolver } from '@/i18n/use-validation-resolver';

import {
  informationValuesToInput,
  manageInformationValuesToInput,
  vehicleToFormValues,
} from '../../mappers';
import type { UpdateVehicleInput, VehicleDetail } from '../../types';
import {
  BasicSection,
  BodyTypePicker,
  ConsumptionSection,
  DimensionsSection,
  EngineOutputSection,
  FeaturesSelect,
  VehicleEnergySection,
  VehicleIdentitySection,
} from '../VehicleFormSections';
import { EditCard } from './EditCard';
import { useEditForm } from './edit-actions';
import { OwnerAddressCard } from './OwnerAddressCard';
import styles from './EditPanes.module.css';

/** Trường của mục này — validate, đếm lỗi và gắn lỗi server đúng trên các ô này. */
const INFORMATION_FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'name',
  // Chi nhánh giữ xe = vị trí công khai của xe — validate cùng mục, không thì lưu với chi nhánh rỗng.
  'branchId',
  'vehicleType',
  'plateNumber',
  'brand',
  'model',
  'bodyType',
  'manufactureYear',
  'seatCount',
  'motorbikeCategory',
  'fuelType',
  'color',
  'lengthMm',
  'widthMm',
  'heightMm',
  'curbWeightKg',
  'engineDisplacementCc',
  'horsepowerHp',
  'transmission',
  'fuelConsumptionCity',
  'fuelConsumptionHighway',
  'fuelConsumptionCombined',
  'features',
  'description',
];

/**
 * Trường chủ xe tuyến hoa hồng SỞ HỮU ở mục này — đúng bộ của mục "Thông tin xe" Owner Lite cũ:
 * không có tên/mã/chi nhánh/loại xe (chi nhánh của họ là địa chỉ, sửa ở thẻ Địa chỉ xe) và không có
 * thông số nâng cao. Lưu qua `manageInformationValuesToInput` nên chỉ các ô này được gửi.
 */
const OWNER_FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'plateNumber',
  'brand',
  'model',
  'manufactureYear',
  'seatCount',
  'bodyType',
  'motorbikeCategory',
  'fuelType',
  'color',
  'transmission',
  'fuelConsumptionCombined',
  'electricRangeKm',
  'batteryCapacityKwh',
  'electricConsumptionKwhPer100Km',
  'engineDisplacementCc',
  'description',
  'features',
];

/**
 * Mục "Thông tin chung" (design `23683:17598`): Thông tin chung · Kiểu dáng xe · Động cơ & nhiên
 * liệu · Tiện ích xe, rồi hai thẻ design không vẽ mà xe vẫn có — Thông số nâng cao (kích thước,
 * khối lượng, công suất, tiêu thụ nội/ngoại thành) và Mô tả. MỘT form, MỘT lần lưu (`PATCH
 * /vehicles/:id`) như trước; nút lưu nằm ở cột phải.
 *
 * Không có `vehicles.update` thì form CHỈ XEM — chỉ tới được đây trong phiên hỗ trợ chế độ xem
 * (ADR 0050); người của gian hàng thiếu quyền sửa bị trang chặn từ trước.
 */
export function InformationPane({
  vehicle,
  canUpdate,
  errorMessage,
  onSave,
}: {
  vehicle: VehicleDetail;
  canUpdate: boolean;
  errorMessage?: string | null;
  onSave: (body: UpdateVehicleInput) => Promise<VehicleDetail>;
}) {
  const t = useTranslations('Vehicles.editor.information');
  const tEdit = useTranslations('Vehicles.edit');
  const tActions = useTranslations('Common.actions');
  const tBranches = useTranslations('Branches');
  const tMedia = useTranslations('Vehicles.form.media');
  const applyApiFieldErrors = useApiFieldErrors();
  const { isManage } = useWorkspace();
  const support = useSupportSession();
  /** Ô mục này validate + gửi — hai tuyến hai bộ, cùng schema và cùng các khối ô. */
  const fields = isManage ? INFORMATION_FIELDS : OWNER_FIELDS;

  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  /*
   * `vehicleFormSchema` TRẦN, không phải bản có luật ảnh bắt buộc (07/10/2026): mỗi lần lưu chỉ gửi
   * các ô của mục này, và cổng ảnh thật vẫn ở backend + cổng gửi duyệt.
   */
  const resolver = useValidationResolver<VehicleFormValues>(
    vehicleFormSchema,
    'Vehicles.form.validation',
  );
  const { control, getValues, reset, setError, setValue, trigger, formState } =
    useForm<VehicleFormValues>({ resolver, defaultValues: initialValues });
  const [saving, setSaving] = useState(false);
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const fuelType = useWatch({ control, name: 'fuelType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;

  useEffect(() => {
    if (vehicleType !== VEHICLE_TYPE.CAR) setValue('bodyType', null);
    if (!isVehicleFuelTypeAllowed(vehicleType, fuelType)) {
      setValue('fuelType', null, { shouldValidate: true });
    }
  }, [fuelType, setValue, vehicleType]);

  /*
   * Chi nhánh ĐANG HOẠT ĐỘNG, BỔ SUNG chi nhánh hiện tại của xe nếu nó vừa bị ngừng — thiếu bước này
   * thì ô chi nhánh trống và người dùng tưởng xe mất vị trí.
   */
  const branches = useActiveBranches();
  const noProvince = tBranches('labels.noProvince');
  const branchOptions = useMemo(() => {
    const options = (branches.data?.items ?? []).map((b) => ({
      value: b.id,
      label: branchLabel(b, noProvince),
    }));
    const current = vehicle.branch;
    if (current && !options.some((o) => o.value === current.id)) {
      options.unshift({
        value: current.id,
        label: tEdit('branchInactive', { label: branchLabel(current, noProvince) }),
      });
    }
    return options;
  }, [branches.data, tEdit, noProvince, vehicle.branch]);

  /*
   * Xe ĐÃ ĐƯỢC DUYỆT: bốn ô căn cước bị KHOÁ (biển số · hộp số · nhiên liệu · năm sản xuất) —
   * 09/09/2026. Server chặn lại bằng `VEHICLE_FIELD_LOCKED`; đây chỉ là lớp trải nghiệm.
   */
  const lockedNotice =
    vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC
      ? tEdit('lockedField')
      : undefined;
  const errorCount = fields.filter((field) => formState.errors[field]).length;

  /*
   * Chỉ validate ô CỦA MỤC NÀY: một chiếc xe cũ thiếu một trường mục khác lo (vd tên xe của chủ xe
   * tuyến hoa hồng, thứ họ không sửa ở đây) không được chặn lần lưu bằng một lỗi không ai thấy.
   */
  async function submit(): Promise<boolean> {
    if (!(await trigger([...fields]))) return false;
    const values = getValues();
    setSaving(true);
    try {
      const updated = await onSave(
        isManage ? informationValuesToInput(values) : manageInformationValuesToInput(values),
      );
      reset(vehicleToFormValues(updated));
      return true;
    } catch (err) {
      // Server bắt được thứ yup bỏ lọt → gắn lỗi vào ĐÚNG ô thay vì chỉ một toast chung.
      applyApiFieldErrors(err, setError, { fields });
      return false;
    } finally {
      setSaving(false);
    }
  }

  const registered = useEditForm('information', {
    dirty: formState.isDirty,
    submitting: saving,
    submit,
    reset: () => reset(initialValues),
  });

  return (
    <Form component={false} layout="vertical" colon={false} disabled={!canUpdate}>
      <form
        noValidate
        className={styles.stack}
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
      >
        {errorMessage ? <Alert type="error" showIcon title={errorMessage} /> : null}
        {errorCount > 0 ? (
          <Alert type="error" showIcon title={tEdit('errors', { count: errorCount })} />
        ) : null}

        <EditCard title={t('general')}>
          {isManage ? (
            <BasicSection
              control={control}
              isCar={isCar}
              codeReadOnly
              branchOptions={branchOptions}
              branchLoading={branches.isLoading}
              branchDisabled={!canUpdate}
              hideServiceTypes
            />
          ) : null}
          <VehicleIdentitySection
            control={control}
            isCar={isCar}
            lockedNotice={lockedNotice}
            setValue={setValue}
            bodyTypeElsewhere
          />
        </EditCard>

        {isManage ? null : <OwnerAddressCard vehicle={vehicle} canEdit={canUpdate && !support} />}

        {isCar ? (
          <EditCard title={t('bodyType')} subtitle={t('bodyTypeHint')}>
            <BodyTypePicker control={control} showLabel={false} />
          </EditCard>
        ) : null}

        <EditCard title={t('energy')}>
          <VehicleEnergySection
            control={control}
            isCar={isCar}
            lockedNotice={lockedNotice}
            setValue={setValue}
          />
        </EditCard>

        <EditCard title={t('features')}>
          <FeaturesSelect
            control={control}
            vehicleType={isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE}
          />
        </EditCard>

        {isManage ? (
          <EditCard title={t('advanced')} subtitle={t('advancedHint')}>
            <h3 className={styles.subheading}>{t('dimensions')}</h3>
            <DimensionsSection control={control} />
            <h3 className={styles.subheading}>{t('engine')}</h3>
            <EngineOutputSection control={control} />
            <h3 className={styles.subheading}>{t('consumption')}</h3>
            <ConsumptionSection control={control} />
          </EditCard>
        ) : null}

        <EditCard title={t('description')}>
          <TextAreaField
            control={control}
            name="description"
            label={t('description')}
            hideLabel
            placeholder={tMedia('descriptionPlaceholder')}
            maxLength={4000}
            rows={5}
          />
        </EditCard>

        {/* Ngoài màn sửa xe (không có cột phải) form giữ nút lưu riêng. */}
        {!registered && canUpdate ? (
          <StickyFormActions
            submitLabel={tActions('saveChanges')}
            onCancel={formState.isDirty ? () => reset(initialValues) : undefined}
            submitting={saving}
            disabled={!formState.isDirty}
          />
        ) : null}
      </form>
    </Form>
  );
}
