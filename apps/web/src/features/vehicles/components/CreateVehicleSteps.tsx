'use client';

import { Col, Divider, Row, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import { useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { VEHICLE_TYPE, requiredVehicleImageTypes } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import type { RegistrationCaptureState } from '../registration-capture';
import { RegistrationFieldsBlock, RegistrationPhotoTile } from './RegistrationCapture';
import { TypedMediaFields } from './TypedMediaFields';
import { VehiclePickupAddressField } from './VehiclePickupAddressField';
import { RegistrationBusyContext } from '../registration-busy';
import type { Branch } from '@/features/branches/types';
import {
  BasicSection,
  FeaturesDescriptionSection,
  SourceTypeSection,
  SpecsSection,
} from './VehicleFormSections';
import { WizardSection } from './VehicleWizard';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import styles from './VehicleForm.module.css';

interface StepProps {
  control: Control<VehicleFormValues>;
  isCar: boolean;
  setValue: UseFormSetValue<VehicleFormValues>;
}

/** Cà vẹt (ADR 0089) của bước 1 - state riêng của wizard, không phải trường RHF. */
export interface RegistrationSlot {
  state: RegistrationCaptureState;
  onChange: (update: (prev: RegistrationCaptureState) => RegistrationCaptureState) => void;
  beforeUpload?: () => Promise<void>;
  showErrors: boolean;
}

/**
 * Bước 1 "Thông tin xe" - Figma `24352:79234`: thẻ "Ảnh xe" (các góc bắt buộc + cà vẹt) rồi thẻ
 * "Thông tin xe" (thông tin cơ bản · thông số · kiểu dáng · hình thức nguồn xe).
 *
 * "Loại dịch vụ" KHÔNG còn ở đây: nó thành công tắc trên từng thẻ dịch vụ ở bước 2.
 */
export function CreateVehicleInfoStep({
  control,
  isCar,
  setValue,
  branchOptions,
  branchLoading,
  branchDisabled,
  branchHidden = false,
  pickupAddress = null,
  registration,
  sourceHidden,
}: StepProps & {
  branchOptions: readonly { value: string; label: string }[];
  branchLoading: boolean;
  branchDisabled: boolean;
  /** Chủ xe tuyến hoa hồng: chỉ có chi nhánh mặc định - điền ngầm, không hỏi. */
  branchHidden?: boolean;
  /** Ô "Địa chỉ nhận xe" thay chỗ ô chi nhánh khi `branchHidden` (chủ xe một chi nhánh). */
  pickupAddress?: { branch: Branch | null; loading: boolean } | null;
  /** `null` = không hỏi cà vẹt (xe máy, phiên hỗ trợ). */
  registration: RegistrationSlot | null;
  sourceHidden: boolean;
}) {
  const t = useTranslations('Vehicles.form.createSteps');
  const pricingHidden = useSupportHides(SUPPORT_HIDDEN_AREA.MONEY_TERMS);
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const plateNumber = useWatch({ control, name: 'plateNumber' });
  // Ảnh cà vẹt TUỲ CHỌN (ADR 0100) — nhãn chỉ đếm các góc ảnh xe bắt buộc.
  const required = requiredVehicleImageTypes(vehicleType ?? VEHICLE_TYPE.CAR).length;
  const props = { control, isCar, setValue };
  /*
   * Máy đang đọc ảnh cà vẹt (18/11/2026): chỉ các ô SẼ được điền từ cà vẹt (biển số, màu, bộ ô
   * cà vẹt) khoá + báo đang đọc - qua `RegistrationBusyContext`; hãng, mẫu xe… vẫn chọn được.
   */
  const reading = registration?.state.phase === 'working';

  return (
    <>
      <WizardSection
        id="create-vehicle-photos"
        title={t('photosTitle')}
        description={t('photosDescription')}
        badge={<Tag className={styles.requiredBadge}>{t('photosRequired', { count: required })}</Tag>}
      >
        {/* Figma: lưới 3 cột các góc bắt buộc, ô "Cà vẹt xe" ở cuối lưới. */}
        <TypedMediaFields
          control={control}
          vehicleType={vehicleType ?? VEHICLE_TYPE.CAR}
          variant="compact"
          extraTiles={
            registration ? (
              <RegistrationPhotoTile
                state={registration.state}
                onChange={registration.onChange}
                vehiclePlate={plateNumber}
                showErrors={registration.showErrors}
                {...(registration.beforeUpload ? { beforeUpload: registration.beforeUpload } : {})}
              />
            ) : null
          }
        />
      </WizardSection>

      <WizardSection
        id="create-vehicle-info"
        title={t('infoTitle')}
        description={t('infoDescription')}
      >
        <RegistrationBusyContext.Provider value={reading}>
        <div
          className={styles.threeColumnFields}
          aria-busy={reading || undefined}
        >
        {/*
          Tiêu đề 3 nhóm theo nguồn điền (18/11/2026): CSS xếp mỗi tiêu đề trước ô của nhóm mình (`order`), nên vị
          trí trong DOM không quan trọng.
        */}
        <h3 className={styles.fieldGroupTitle} data-group="model">
          {t('groups.model')}
        </h3>
        {registration ? (
          <h3 className={styles.fieldGroupTitle} data-group="registration">
            {t('groups.registration')}
          </h3>
        ) : null}
        <h3 className={styles.fieldGroupTitle} data-group="vehicle">
          {t('groups.location')}
        </h3>
        {pickupAddress ? (
          <Row gutter={24}>
            <Col xs={24} sm={12} data-field="branchId">
              <VehiclePickupAddressField
                branch={pickupAddress.branch}
                loading={pickupAddress.loading}
              />
            </Col>
          </Row>
        ) : null}
        <BasicSection
          {...props}
          creating
          // Phiên hỗ trợ không có bước 2 ⇒ chip dịch vụ vẫn hỏi ở đây (ADR 0050 §13).
          hideServiceTypes={!pricingHidden}
          branchOptions={branchOptions}
          branchLoading={branchLoading}
          branchDisabled={branchDisabled}
          hideBranch={branchHidden}
        />
        {/* Figma: Số khung · Số máy ngay dưới chi nhánh - máy đọc ảnh cà vẹt tự điền. */}
        {registration ? (
          <RegistrationFieldsBlock
            state={registration.state}
            onChange={registration.onChange}
            vehiclePlate={plateNumber}
            showErrors={registration.showErrors}
          />
        ) : null}
        <SpecsSection {...props} creating registrationReading={registration?.state.reading} />
        {!sourceHidden ? (
          <>
            <Divider className={styles.sectionDivider} />
            <SourceTypeSection control={control} />
          </>
        ) : null}
        </div>
        </RegistrationBusyContext.Provider>
      </WizardSection>
    </>
  );
}

/** Bước 3 "Tiện ích & mô tả" - Figma `24352:81824`. Mô tả giữ văn bản thường, tối đa 4.000 ký tự. */
export function CreateVehicleFeaturesStep({ control, isCar, setValue }: StepProps) {
  const t = useTranslations('Vehicles.form.createSteps');
  return (
    <WizardSection
      id="create-vehicle-features"
      title={t('featuresTitle')}
      description={t('featuresDescription')}
    >
      <FeaturesDescriptionSection control={control} isCar={isCar} setValue={setValue} />
    </WizardSection>
  );
}
