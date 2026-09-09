'use client';

import { Alert, App, Button, Col, Form, Row } from 'antd';
import { useTranslations } from 'next-intl';
import { useMemo, useState } from 'react';
import { useForm } from 'react-hook-form';
import {
  TRANSMISSION_TYPE_VALUES,
  VEHICLE_PUBLIC_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';

import { EmbedMap } from '@/components/data-display/EmbedMap';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { ResponsiveDialog } from '@/components/overlay/ResponsiveDialog';
import { BranchFormDialog } from '@/features/branches/components/BranchFormDialog';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { PublishRequiredLabel } from '@/features/vehicles/components/VehicleCompleteness';
import {
  BrandSelect,
  FeaturesSelect,
  FuelTypeSelect,
} from '@/features/vehicles/components/VehicleFormSections';
import { useSensitiveChangeLabels } from '@/features/vehicles/hooks/use-publication-labels';
import { useUpdateVehicle } from '@/features/vehicles/hooks/use-vehicle-mutations';
import { manageInformationValuesToInput, vehicleToFormValues } from '@/features/vehicles/mappers';
import { sensitiveChanges } from '@/features/vehicles/sensitive-changes';
import { useApiFieldErrors } from '@/hooks/use-api-field-errors';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
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
  'engineDisplacementCc',
  'horsepowerHp',
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
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const fmt = useAppFormat();
  const sensitiveLabels = useSensitiveChangeLabels();
  const errorMessage = useErrorMessage();
  const applyApiFieldErrors = useApiFieldErrors();
  const { message } = App.useApp();
  const update = useUpdateVehicle(vehicle.id);

  const initialValues = useMemo(() => vehicleToFormValues(vehicle), [vehicle]);
  const resolver = useValidationResolver<VehicleFormValues>(vehicleFormSchema, 'Vehicles.form.validation');
  const { control, getValues, handleSubmit, reset, setError, trigger, formState } =
    useForm<VehicleFormValues>({ resolver, values: initialValues });
  const [confirmSensitive, setConfirmSensitive] = useState(false);
  const isPublic = vehicle.publicStatus === VEHICLE_PUBLIC_STATUS.APPROVED_PUBLIC;
  const isCar = vehicle.vehicleType === VEHICLE_TYPE.CAR;

  const changesOf = (values: VehicleFormValues) =>
    sensitiveChanges(initialValues, values, fmt, domainLabel, sensitiveLabels);

  async function save() {
    if (!(await trigger([...FIELDS]))) return;
    const values = getValues();
    if (isPublic && changesOf(values).length > 0) {
      setConfirmSensitive(true);
      return;
    }
    await submit(values);
  }

  async function submit(values: VehicleFormValues) {
    try {
      const updated = await update.mutateAsync(manageInformationValuesToInput(values));
      reset(vehicleToFormValues(updated));
      setConfirmSensitive(false);
      message.success(t('information.saved'));
    } catch (err) {
      const applied = applyApiFieldErrors(err, setError, { fields: FIELDS });
      if (applied.length === 0) message.error(errorMessage(err));
      setConfirmSensitive(false);
    }
  }

  const transmissionOptions = TRANSMISSION_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('transmissionType', value),
  }));

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
        {isPublic ? <Alert type="warning" showIcon message={tEdit('publicWarning')} /> : null}

        <div className={styles.grid}>
          <div className={styles.column}>
            <SectionCard title={t('information.plateTitle')} headingLevel={1}>
              <TextField
                control={control}
                name="plateNumber"
                label={<PublishRequiredLabel label={tForm('specs.plateNumber')} />}
                placeholder={tForm('specs.platePlaceholder')}
                help={t('information.plateHelp')}
                disabled={!canEdit}
              />
            </SectionCard>
            <AddressCard canEdit={canEdit} />
          </div>

          <SectionCard title={t('information.basicTitle')}>
            <Row gutter={16}>
              <Col xs={24} sm={12}>
                <NumberField
                  control={control}
                  name="seatCount"
                  label={tForm('specs.seatCount')}
                  placeholder={tForm('specs.seatPlaceholder')}
                  min={1}
                  max={64}
                />
              </Col>
              <Col xs={24} sm={12}>
                <SelectField
                  control={control}
                  name="transmission"
                  label={tForm('advanced.transmission')}
                  options={transmissionOptions}
                  allowClear
                  placeholder={tForm('advanced.transmissionPlaceholder')}
                />
              </Col>
              <Col xs={24} sm={12}>
                <FuelTypeSelect control={control} vehicleType={vehicle.vehicleType} />
              </Col>
              <Col xs={24} sm={12}>
                <NumberField
                  control={control}
                  name="fuelConsumptionCombined"
                  label={tForm('advanced.consumptionCombined')}
                  placeholder={tForm('advanced.consumptionCombinedPlaceholder')}
                  min={0}
                />
              </Col>
              <Col xs={24} sm={12}>
                <BrandSelect control={control} />
              </Col>
              <Col xs={24} sm={12}>
                <TextField
                  control={control}
                  name="model"
                  label={tForm('specs.model')}
                  placeholder={tForm('specs.modelPlaceholder')}
                />
              </Col>
              <Col xs={24} sm={12}>
                <NumberField
                  control={control}
                  name="manufactureYear"
                  label={tForm('specs.manufactureYear')}
                  min={1980}
                  max={new Date().getFullYear() + 1}
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
              {isCar ? (
                <>
                  <Col xs={24} sm={12}>
                    <NumberField
                      control={control}
                      name="engineDisplacementCc"
                      label={tForm('advanced.engineDisplacementCc')}
                      placeholder={tForm('advanced.enginePlaceholder')}
                      min={1}
                    />
                  </Col>
                  <Col xs={24} sm={12}>
                    <NumberField
                      control={control}
                      name="horsepowerHp"
                      label={tForm('advanced.horsepowerHp')}
                      placeholder={tForm('advanced.horsepowerPlaceholder')}
                      min={1}
                    />
                  </Col>
                </>
              ) : null}
            </Row>
          </SectionCard>
        </div>

        <SectionCard title={t('information.descriptionTitle')}>
          <TextAreaField
            control={control}
            name="description"
            label={<PublishRequiredLabel label={tForm('media.description')} />}
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
            <FeaturesSelect control={control} />
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

      <ResponsiveDialog
        open={confirmSensitive}
        title={tEdit('sensitive.title')}
        size="sm"
        confirmLoading={update.isPending}
        onClose={() => setConfirmSensitive(false)}
        onOk={() => void submit(getValues())}
        okText={tEdit('sensitive.ok')}
        cancelText={tCommon('actions.cancel')}
      >
        <p>{tEdit('sensitive.body')}</p>
        <ul>
          {changesOf(getValues()).map((change) => (
            <li key={change.field}>
              <strong>{tEdit('sensitive.change', { label: change.label })}</strong> {change.before} →{' '}
              {change.after}
            </li>
          ))}
        </ul>
      </ResponsiveDialog>
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
