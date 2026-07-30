'use client';

import { Alert, Button, Card, Col, Row, Select } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { useEffect } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  SERVICE_TYPE,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_FEATURE_LABEL,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { AutoCompleteField } from '@/components/form/AutoCompleteField';
import { ImageGalleryField } from '@/components/form/ImageGalleryField';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { presignVehicleImage } from '@/services/upload';
import {
  BODY_TYPE_OPTIONS,
  BRAND_OPTIONS,
  FUEL_TYPE_OPTIONS,
  OPERATION_STATUS_OPTIONS,
  SERVICE_TYPE_OPTIONS,
  VEHICLE_TYPE_OPTIONS,
} from '../constants';
import styles from './VehicleForm.module.css';

const CURRENT_YEAR = new Date().getFullYear();

/** Mặc định khi tạo mới: chọn sẵn giá trị hợp lệ để select bắt buộc không rỗng. */
const EMPTY_DEFAULTS: VehicleFormValues = {
  code: '',
  name: '',
  vehicleType: VEHICLE_TYPE.CAR,
  serviceType: SERVICE_TYPE.SELF_DRIVE,
  operationStatus: VEHICLE_OPERATION_STATUS.AVAILABLE,
  plateNumber: '',
  brand: '',
  model: '',
  color: '',
  fuelType: null,
  bodyType: null,
  manufactureYear: null,
  seatCount: null,
  weekdayPrice: null,
  weekendPrice: null,
  hourlyPrice: null,
  deliveryEnabled: false,
  noCollateral: false,
  discountPercent: null,
  description: '',
  mainImageUrl: null,
  images: [],
  features: [],
};

const FEATURE_OPTIONS = VEHICLE_FEATURE_KEYS.map((key) => ({
  value: key,
  label: VEHICLE_FEATURE_LABEL[key],
}));

interface VehicleFormProps {
  initialValues?: VehicleFormValues;
  submitLabel: string;
  submitting: boolean;
  errorMessage?: string | null;
  onSubmit: (values: VehicleFormValues) => void;
  onCancel: () => void;
}

export function VehicleForm({
  initialValues,
  submitLabel,
  submitting,
  errorMessage,
  onSubmit,
  onCancel,
}: VehicleFormProps) {
  const { control, handleSubmit, setValue } = useForm<VehicleFormValues>({
    resolver: yupResolver(vehicleFormSchema),
    defaultValues: initialValues ?? EMPTY_DEFAULTS,
  });

  // Kiểu dáng thân xe chỉ có nghĩa với ô tô — đổi sang xe máy thì ẩn field và xoá giá trị.
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const isCar = vehicleType === VEHICLE_TYPE.CAR;
  useEffect(() => {
    if (!isCar) setValue('bodyType', null);
  }, [isCar, setValue]);

  const submit = handleSubmit((values) => onSubmit(values));

  return (
    <form onSubmit={submit} noValidate className={styles.form}>
      {errorMessage ? (
        <Alert type="error" showIcon message={errorMessage} className={styles.alert} />
      ) : null}

      <Card title="Thông tin cơ bản" className={styles.section}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <TextField control={control} name="code" label="Mã xe" placeholder="VD: XE-001" />
          </Col>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="name"
              label="Tên xe"
              placeholder="VD: Toyota Vios 2022"
            />
          </Col>
          <Col xs={24} sm={8}>
            <SelectField
              control={control}
              name="vehicleType"
              label="Loại xe"
              options={VEHICLE_TYPE_OPTIONS}
            />
          </Col>
          <Col xs={24} sm={8}>
            <SelectField
              control={control}
              name="serviceType"
              label="Loại dịch vụ"
              options={SERVICE_TYPE_OPTIONS}
            />
          </Col>
          <Col xs={24} sm={8}>
            <SelectField
              control={control}
              name="operationStatus"
              label="Trạng thái vận hành"
              options={OPERATION_STATUS_OPTIONS}
            />
          </Col>
        </Row>
      </Card>

      <Card title="Chi tiết xe" className={styles.section}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <TextField
              control={control}
              name="plateNumber"
              label="Biển số"
              placeholder="VD: 51K-123.45"
            />
          </Col>
          <Col xs={24} sm={12}>
            <SelectField
              control={control}
              name="fuelType"
              label="Nhiên liệu"
              options={FUEL_TYPE_OPTIONS}
              placeholder="Chọn nhiên liệu"
              allowClear
            />
          </Col>
          <Col xs={24} sm={12}>
            <AutoCompleteField
              control={control}
              name="brand"
              label="Hãng"
              options={BRAND_OPTIONS}
              placeholder="VD: Toyota"
            />
          </Col>
          <Col xs={24} sm={12}>
            <TextField control={control} name="model" label="Dòng xe" placeholder="VD: Vios" />
          </Col>
          {isCar ? (
            <Col xs={24} sm={8}>
              <SelectField
                control={control}
                name="bodyType"
                label="Kiểu dáng"
                options={BODY_TYPE_OPTIONS}
                placeholder="Sedan, SUV…"
                allowClear
              />
            </Col>
          ) : null}
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="manufactureYear"
              label="Đời xe"
              placeholder={String(CURRENT_YEAR)}
              min={1980}
              max={CURRENT_YEAR + 1}
            />
          </Col>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="seatCount"
              label="Số chỗ"
              placeholder="VD: 5"
              min={1}
              max={64}
            />
          </Col>
          <Col xs={24} sm={8}>
            <TextField control={control} name="color" label="Màu sắc" placeholder="VD: Trắng" />
          </Col>
        </Row>
      </Card>

      <Card title="Giá thuê & chính sách" className={styles.section}>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="weekdayPrice"
              label="Giá ngày thường"
              placeholder="VD: 600.000"
              min={0}
              money
            />
          </Col>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="weekendPrice"
              label="Giá cuối tuần"
              placeholder="VD: 750.000"
              min={0}
              money
            />
          </Col>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="hourlyPrice"
              label="Giá thuê theo giờ"
              placeholder="Bỏ trống nếu không cho thuê giờ"
              min={0}
              money
            />
          </Col>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="discountPercent"
              label="Giảm giá đang chạy"
              placeholder="VD: 10"
              min={0}
              max={100}
              addonAfter="%"
            />
          </Col>
        </Row>
        <div className={styles.policyBlock}>
          <SwitchField
            control={control}
            name="deliveryEnabled"
            label="Giao xe tận nơi"
            description="Khách trên marketplace lọc được xe có hỗ trợ giao nhận"
          />
          <SwitchField
            control={control}
            name="noCollateral"
            label="Miễn thế chấp"
            description="Không yêu cầu khách cọc tài sản khi nhận xe"
          />
        </div>
      </Card>

      <Card title="Hình ảnh, tiện ích & mô tả" className={styles.section}>
        <ImageUploadField
          control={control}
          name="mainImageUrl"
          label="Ảnh đại diện"
          presign={presignVehicleImage}
        />

        <ImageGalleryField
          control={control}
          name="images"
          label="Ảnh gallery"
          presign={presignVehicleImage}
          max={20}
        />

        <div className={styles.galleryBlock}>
          <div className={styles.fieldLabel}>Tiện ích</div>
          <Controller
            control={control}
            name="features"
            render={({ field }) => (
              <Select
                mode="multiple"
                className={styles.fullWidth}
                value={field.value ?? []}
                onChange={field.onChange}
                options={FEATURE_OPTIONS}
                placeholder="Chọn tiện ích (Bluetooth, camera lùi…)"
                allowClear
              />
            )}
          />
        </div>

        <div className={styles.descBlock}>
          <TextAreaField
            control={control}
            name="description"
            label="Mô tả"
            placeholder="Mô tả tình trạng, trang bị, điều kiện thuê…"
            maxLength={4000}
            rows={5}
          />
        </div>
      </Card>

      <div className={styles.actions}>
        <Button size="large" onClick={onCancel} disabled={submitting}>
          Huỷ
        </Button>
        <Button type="primary" size="large" htmlType="submit" loading={submitting}>
          {submitLabel}
        </Button>
      </div>
    </form>
  );
}
