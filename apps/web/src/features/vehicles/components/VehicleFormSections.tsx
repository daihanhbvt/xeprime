'use client';

import { Col, Radio, Row, Select } from 'antd';
import { Controller, type Control } from 'react-hook-form';
import { VEHICLE_FEATURE_KEYS, VEHICLE_FEATURE_LABEL } from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
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
import { publishRequiredLabel } from './VehicleCompleteness';
import styles from './VehicleForm.module.css';

const CURRENT_YEAR = new Date().getFullYear();

const FEATURE_OPTIONS = VEHICLE_FEATURE_KEYS.map((key) => ({
  value: key,
  label: VEHICLE_FEATURE_LABEL[key],
}));

export type VehicleSectionKey = 'basic' | 'specs' | 'pricing' | 'media';

/**
 * Bốn phần của form xe — **một nguồn duy nhất** cho cả hai hình thái:
 * tạo mới đi từng bước (Figma `60:7`→`60:490`), sửa hiện hết một trang (`62:5`).
 *
 * `fields` là danh sách tên trường của từng phần, dùng để validate **riêng bước đang mở** trước
 * khi cho đi tiếp. Không có nó thì "Tiếp tục" phải validate cả schema và người dùng bị chặn bởi
 * lỗi của một phần chưa mở ra.
 */
export const VEHICLE_SECTIONS: ReadonlyArray<{
  key: VehicleSectionKey;
  title: string;
  fields: ReadonlyArray<keyof VehicleFormValues>;
}> = [
  {
    key: 'basic',
    title: 'Thông tin cơ bản',
    fields: ['code', 'name', 'vehicleType', 'serviceType', 'operationStatus'],
  },
  {
    key: 'specs',
    title: 'Chi tiết kỹ thuật & phân loại',
    fields: [
      'plateNumber',
      'brand',
      'model',
      'bodyType',
      'manufactureYear',
      'seatCount',
      'fuelType',
      'color',
    ],
  },
  {
    key: 'pricing',
    title: 'Giá thuê & chính sách',
    fields: [
      'weekdayPrice',
      'weekendPrice',
      'hourlyPrice',
      'discountPercent',
      'deliveryEnabled',
      'noCollateral',
    ],
  },
  {
    key: 'media',
    title: 'Hình ảnh, tiện ích & mô tả',
    fields: ['mainImageUrl', 'images', 'features', 'description'],
  },
];

interface SectionProps {
  control: Control<VehicleFormValues>;
  isCar: boolean;
}

export function BasicSection({ control, isCar: _isCar }: SectionProps) {
  return (
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="code"
          label="Mã quản lý xe"
          placeholder="VD: XE-001"
          required
          help="Mã nội bộ, không trùng trong gian hàng"
        />
      </Col>
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="name"
          label="Tên xe hiển thị"
          placeholder="VD: Toyota Vios 2022"
          required
        />
      </Col>
      <Col xs={24} sm={12}>
        {/* Radio thay Select: chỉ hai lựa chọn, Figma `60:105` vẽ radio — bấm một lần là xong. */}
        <Controller
          control={control}
          name="vehicleType"
          render={({ field }) => (
            <fieldset className={styles.fieldset}>
              <legend className={styles.fieldsetLegend}>
                Loại phương tiện
                <span className={styles.requiredMark} aria-hidden="true">
                  *
                </span>
              </legend>
              <Radio.Group
                value={field.value}
                onChange={(event) => field.onChange(event.target.value)}
                options={[...VEHICLE_TYPE_OPTIONS]}
              />
            </fieldset>
          )}
        />
      </Col>
      <Col xs={24} sm={12}>
        <SelectField
          control={control}
          name="serviceType"
          label="Loại hình dịch vụ"
          options={SERVICE_TYPE_OPTIONS}
          required
        />
      </Col>
      <Col xs={24}>
        <SelectField
          control={control}
          name="operationStatus"
          label="Trạng thái vận hành"
          options={OPERATION_STATUS_OPTIONS}
          required
        />
      </Col>
    </Row>
  );
}

export function SpecsSection({ control, isCar }: SectionProps) {
  return (
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="plateNumber"
          label={publishRequiredLabel('Biển số xe')}
          placeholder="VD: 51K-123.45"
          help="Cần có trước khi gửi duyệt công khai lên sàn"
        />
      </Col>
      <Col xs={24} sm={12}>
        <AutoCompleteField
          control={control}
          name="brand"
          label="Hãng sản xuất"
          options={BRAND_OPTIONS}
          placeholder="VD: Toyota"
        />
      </Col>
      <Col xs={24} sm={12}>
        <TextField control={control} name="model" label="Mẫu xe (model)" placeholder="VD: Vios" />
      </Col>
      {isCar ? (
        <Col xs={24} sm={12}>
          <SelectField
            control={control}
            name="bodyType"
            label="Kiểu dáng thân xe"
            options={BODY_TYPE_OPTIONS}
            placeholder="Sedan, SUV…"
            allowClear
            help="Chỉ áp dụng cho ô tô. Tự động xoá khi chuyển sang xe máy."
          />
        </Col>
      ) : null}
      <Col xs={24} sm={12}>
        <NumberField
          control={control}
          name="manufactureYear"
          label="Năm sản xuất"
          placeholder={String(CURRENT_YEAR)}
          min={1980}
          max={CURRENT_YEAR + 1}
        />
      </Col>
      <Col xs={24} sm={12}>
        <NumberField
          control={control}
          name="seatCount"
          label="Số chỗ ngồi đăng ký"
          placeholder="VD: 5"
          min={1}
          max={64}
        />
      </Col>
      <Col xs={24} sm={12}>
        <SelectField
          control={control}
          name="fuelType"
          label="Loại nhiên liệu"
          options={FUEL_TYPE_OPTIONS}
          placeholder="Chọn nhiên liệu"
          allowClear
        />
      </Col>
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="color"
          label="Màu sắc ngoại thất"
          placeholder="VD: Trắng"
        />
      </Col>
    </Row>
  );
}

export function PricingSection({
  control,
  pricePreview,
}: SectionProps & { pricePreview: React.ReactNode }) {
  return (
    <>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="weekdayPrice"
            label={publishRequiredLabel('Giá ngày thường')}
            placeholder="VD: 600.000"
            min={0}
            money
            help="Giá cho ngày trong tuần. Cần có trước khi gửi duyệt."
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="weekendPrice"
            label="Giá cuối tuần"
            placeholder="VD: 750.000"
            min={0}
            money
            help="Để trống nếu cùng giá ngày thường"
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="hourlyPrice"
            label="Giá thuê theo giờ"
            placeholder="Bỏ trống nếu không cho thuê giờ"
            min={0}
            money
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="discountPercent"
            label="Giảm giá đang chạy"
            placeholder="VD: 10"
            percent
            help="Giá sau giảm sẽ hiển thị trên marketplace"
          />
        </Col>
      </Row>

      {pricePreview}

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
    </>
  );
}

export function MediaSection({ control }: SectionProps) {
  return (
    <>
      <ImageUploadField
        control={control}
        name="mainImageUrl"
        label={publishRequiredLabel('Ảnh đại diện')}
        presign={presignVehicleImage}
      />

      <ImageGalleryField
        control={control}
        name="images"
        label="Thư viện ảnh"
        presign={presignVehicleImage}
        max={20}
      />

      <div className={styles.galleryBlock}>
        <div className={styles.fieldLabel} id="vehicle-features-label">
          Tiện ích
        </div>
        <Controller
          control={control}
          name="features"
          render={({ field }) => (
            <Select
              mode="multiple"
              aria-labelledby="vehicle-features-label"
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
          label={publishRequiredLabel('Mô tả')}
          placeholder="Mô tả tình trạng, trang bị, điều kiện thuê…"
          maxLength={4000}
          rows={5}
        />
      </div>
    </>
  );
}

/** Dòng tóm tắt của phần đã điền, hiện ở hàng thu gọn (Figma `60:219`). */
export function sectionSummary(
  key: VehicleSectionKey,
  values: VehicleFormValues,
  labels: { vehicleType: string; serviceType: string; bodyType: string; fuelType: string },
): string {
  const join = (parts: Array<string | number | null | undefined>) =>
    parts.filter((part) => part !== null && part !== undefined && part !== '').join(' · ');

  switch (key) {
    case 'basic':
      return join([
        values.name,
        values.code && `Mã: ${values.code}`,
        labels.vehicleType,
        labels.serviceType,
      ]);
    case 'specs':
      return (
        join([
          values.plateNumber,
          labels.bodyType,
          values.seatCount ? `${values.seatCount} chỗ` : null,
          labels.fuelType,
        ]) || 'Chưa nhập thông tin kỹ thuật'
      );
    case 'pricing':
      return (
        join([
          values.weekdayPrice ? `${values.weekdayPrice.toLocaleString('vi-VN')} ₫/ngày` : null,
          values.discountPercent ? `giảm ${values.discountPercent}%` : null,
        ]) || 'Chưa nhập giá'
      );
    default:
      return join([
        values.mainImageUrl ? 'Có ảnh đại diện' : 'Chưa có ảnh đại diện',
        `${values.images?.length ?? 0} ảnh thư viện`,
      ]);
  }
}
