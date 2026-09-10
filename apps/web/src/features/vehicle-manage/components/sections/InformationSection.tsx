'use client';

import { Alert, App, Button, Col, Form, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { VEHICLE_PUBLIC_STATUS } from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';

import { EmbedMap } from '@/components/data-display/EmbedMap';
import { NumberField } from '@/components/form/NumberField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { BranchFormDialog } from '@/features/branches/components/BranchFormDialog';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { PublishRequiredLabel } from '@/features/vehicles/components/VehicleCompleteness';
import { VehicleClassificationFields } from '@/features/vehicles/components/VehicleClassificationFields';
import { VehicleEnergyFields } from '@/features/vehicles/components/VehicleEnergyFields';
import { VehicleIdentityFields } from '@/features/vehicles/components/VehicleIdentityFields';
import {
  FeaturesSelect,
  useTransmissionOptions,
} from '@/features/vehicles/components/VehicleFormSections';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { manageInformationValuesToInput, vehicleToFormValues } from '@/features/vehicles/mappers';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { mapPlaceUrl, toGeoPoint } from '@/lib/map-embed';

import { useManagedVehicle } from '../VehicleManageContext';
import { SectionCard } from '../SectionCard';
import formStyles from '@/features/vehicles/components/VehicleForm.module.css';
import styles from './InformationSection.module.css';

/** Trường màn này SỞ HỮU — chỉ chúng được validate và gửi đi. */
const FIELDS: ReadonlyArray<keyof VehicleFormValues> = [
  'plateNumber',
  'brand',
  'model',
  'manufactureYear',
  'seatCount',
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
 * Mục "Thông tin xe" (mockup 1) — cùng schema, cùng section và cùng mapper với
 * `VehicleEditWorkspace`, chỉ khác cách xếp thẻ. Lưu chỉ gửi trường của màn này
 * (`manageInformationValuesToInput`) nên giá, ảnh, dịch vụ, chi nhánh không bị đụng.
 *
 * Địa chỉ của xe = chi nhánh đang giữ xe (`Vehicle.branchId → TenantBranch`) — không có nguồn
 * địa chỉ thứ hai. "Chỉnh sửa" mở đúng `BranchFormDialog`, và nói rõ khi chi nhánh đang giữ nhiều xe.
 */
export function InformationSection() {
  const { vehicle, canEdit } = useManagedVehicle();
  const t = useTranslations('VehicleManage');
  const tForm = useTranslations('Vehicles.form');
  const tEdit = useTranslations('Vehicles.edit');
  const tActions = useTranslations('Common.actions');
  const errorMessage = useErrorMessage();
  const applyApiFieldErrors = useApiFieldErrors();
  const { message } = App.useApp();
  const update = useUpdateVehicle(vehicle.id);

  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  const resolver = useValidationResolver<VehicleFormValues>(vehicleFormSchema, 'Vehicles.form.validation');
  const { control, getValues, handleSubmit, reset, setError, setValue, trigger, formState } =
    useForm<VehicleFormValues>({ resolver, values: initialValues });
  // Nguồn năng lượng quyết định bộ truyền động hợp lệ — theo dõi để ô chọn đổi ngay khi
  // người dùng đổi từ xăng sang điện, chứ không đợi lưu rồi mới biết.
  const fuelType = useWatch({ control, name: `fuelType` });
  /** Xe đã lên chợ: căn cước bị khoá (biển số, hộp số, nhiên liệu, năm SX) — server chặn lại. */
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;

  async function save() {
    if (!(await trigger([...FIELDS]))) return;
    await submit(getValues());
  }

  async function submit(values: VehicleFormValues) {
    try {
      const updated = await update.mutateAsync(manageInformationValuesToInput(values));
      reset(vehicleToFormValues(updated));
      message.success(t('information.saved'));
    } catch (err) {
      const applied = applyApiFieldErrors(err, setError, { fields: FIELDS });
      if (applied.length === 0) message.error(errorMessage(err));
    }
  }

  /*
   * Bộ truyền động theo LOẠI XE + nguồn năng lượng: một chiếc SH không có "số sàn", còn xe điện
   * thì truyền động một cấp. Cùng hàm mà backend dùng để từ chối giá trị sai, nên form không đưa
   * ra một lựa chọn mà server sẽ chặn.
   */
  const transmissionOptions = useTransmissionOptions(vehicle.vehicleType, fuelType);

  return (
    <Form component={false} layout="vertical" colon={false}>
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void handleSubmit(() => save())();
        }}
        className={styles.form}
      >
        {/*
          Xe đang trên chợ: căn cước của nó bị khoá, phần còn lại sửa là hiệu lực ngay. Nói rõ
          ở đầu màn để chủ xe không phải thử từng ô mới biết ô nào không bấm được.
        */}
        {isPublic ? (
          <Alert type="info" showIcon message={t('information.lockedNotice')} />
        ) : null}

        <div className={styles.grid}>
          <div className={styles.column}>
            <SectionCard title={t('information.plateTitle')} headingLevel={1}>
              <TextField
                control={control}
                name="plateNumber"
                label={<PublishRequiredLabel label={tForm('specs.plateNumber')} />}
                placeholder={tForm('specs.platePlaceholder')}
                help={isPublic ? t('information.lockedField') : t('information.plateHelp')}
                disabled={!canEdit || isPublic}
              />
            </SectionCard>
            <AddressCard canEdit={canEdit} />
          </div>

          <SectionCard title={t('information.basicTitle')}>
            <Row gutter={16}>
              {/*
                Hãng → Mẫu xe, rồi phân loại theo loại xe. Cùng component với wizard đăng nhanh
                và form đầy đủ ở `/manage` — ba màn không thể hỏi khác nhau.
              */}
              <Col xs={24}>
                <VehicleIdentityFields
                  control={control}
                  vehicleType={vehicle.vehicleType}
                  lockedNotice={isPublic ? t('information.lockedField') : undefined}
                  disabled={!canEdit}
                  setValue={setValue}
                />
              </Col>
              <Col xs={24}>
                <VehicleClassificationFields
                  control={control}
                  vehicleType={vehicle.vehicleType}
                  disabled={!canEdit}
                  setValue={setValue}
                />
              </Col>
              <Col xs={24}>
                {/*
                  Nguồn năng lượng và thông số của nó dùng CHUNG khối với hai wizard đăng xe —
                  cùng ma trận `vehicleEnergySpecPolicy`, nên ba màn không bao giờ hỏi khác nhau.
                  Nhiên liệu và hộp số bị khoá khi xe đang trên chợ (ADR 0030).
                */}
                <VehicleEnergyFields
                  control={control}
                  vehicleType={vehicle.vehicleType}
                  transmissionOptions={transmissionOptions}
                  lockedNotice={isPublic ? t('information.lockedField') : undefined}
                  disabled={!canEdit || isPublic}
                  setValue={setValue}
                />
              </Col>
              <Col xs={24} sm={12}>
                <NumberField
                  control={control}
                  name="manufactureYear"
                  label={tForm('specs.manufactureYear')}
                  min={1980}
                  max={new Date().getFullYear() + 1}
                  help={isPublic ? t('information.lockedField') : undefined}
                  disabled={!canEdit || isPublic}
                />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="color"
                  label={tForm('specs.color')}
                  placeholder={tForm('specs.colorPlaceholder')}
                />
              </Col>
            </Row>
          </SectionCard>
        </div>

        <SectionCard title={t('information.descriptionTitle')}>
          <TextAreaField
            control={control}
            name="description"
            label={tForm('media.description')}
            placeholder={tForm('media.descriptionPlaceholder')}
            maxLength={4000}
            rows={5}
          />
        </SectionCard>

        <SectionCard title={t('information.featuresTitle')}>
          <div className={formStyles.galleryBlock}>
            <div className={formStyles.fieldLabel} id="vehicle-features-label">
              {tForm('media.features')}
            </div>
            <FeaturesSelect control={control} vehicleType={vehicle.vehicleType} />
          </div>
        </SectionCard>

        <StickyFormActions
          submitLabel={tActions('saveChanges')}
          cancelLabel={tEdit('revert')}
          onCancel={formState.isDirty ? () => reset(initialValues) : undefined}
          submitting={update.isPending}
          disabled={!canEdit || !formState.isDirty}
        />
      </form>

    </Form>
  );
}

/**
 * Địa chỉ hiện tại của xe = chi nhánh giữ xe. Đọc từ danh sách chi nhánh (đã có toạ độ và số xe)
 * chứ không gọi endpoint riêng; bản đồ là `EmbedMap` với `NEXT_PUBLIC_GOOGLE_MAPS_EMBED_KEY` —
 * thiếu key/toạ độ thì chỉ hiện chữ, không bao giờ chặn sửa.
 */
function AddressCard({ canEdit }: { canEdit: boolean }) {
  const { vehicle } = useManagedVehicle();
  const t = useTranslations('VehicleManage.information');
  const tBranches = useTranslations('Branches');
  const branches = useBranches();
  const [editing, setEditing] = useState(false);

  const branch = branches.data?.items.find((b) => b.id === vehicle.branch?.id) ?? null;
  const point = branch
    ? toGeoPoint(
        branch.latitude == null ? null : Number(branch.latitude),
        branch.longitude == null ? null : Number(branch.longitude),
      )
    : null;
  const mapUrl = mapPlaceUrl(point);
  const addressLine = [branch?.address, branch?.provinceName ?? vehicle.branch?.provinceName]
    .filter(Boolean)
    .join(', ');

  return (
    <SectionCard
      title={t('addressTitle')}
      extra={
        branch && canEdit ? (
          <Button type="link" onClick={() => setEditing(true)}>
            {t('addressEdit')}
          </Button>
        ) : null
      }
    >
      {!vehicle.branch ? (
        <Alert type="warning" showIcon message={t('addressMissing')} />
      ) : (
        <>
          <p className={styles.address}>
            {addressLine || t('addressNoStreet')}
          </p>
          {branch?.name ? <p className={styles.branchName}>{branch.name}</p> : null}
          {mapUrl ? (
            <EmbedMap src={mapUrl} title={t('addressMapTitle')} height={220} />
          ) : branch?.address ? (
            <p className={styles.mapHint}>{t('addressMapPending')}</p>
          ) : null}
        </>
      )}
      {branch ? (
        <BranchFormDialog
          open={editing}
          branch={branch}
          onClose={() => setEditing(false)}
          notice={
            branch.vehicleCount > 1 ? (
              <Alert
                type="warning"
                showIcon
                message={t('addressSharedTitle', { count: branch.vehicleCount })}
                description={t('addressSharedBody')}
              />
            ) : (
              <Alert type="info" showIcon message={tBranches('form.provinceHelp')} />
            )
          }
        />
      ) : null}
    </SectionCard>
  );
}
