'use client';

import { ArrowDownOutlined, ArrowUpOutlined, DeleteOutlined, PlusOutlined } from '@ant-design/icons';
import { Alert, Button, Card, Col, Input, Row, Select } from 'antd';
import { yupResolver } from '@hookform/resolvers/yup';
import { Controller, useForm, useWatch } from 'react-hook-form';
import {
  SERVICE_TYPE,
  VEHICLE_FEATURE_KEYS,
  VEHICLE_FEATURE_LABEL,
  VEHICLE_OPERATION_STATUS,
  VEHICLE_TYPE,
} from '@xeprime/types';
import { vehicleFormSchema, type VehicleFormValues } from '@xeprime/validators';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import {
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
  manufactureYear: null,
  seatCount: null,
  weekdayPrice: null,
  weekendPrice: null,
  description: '',
  mainImageUrl: null,
  images: [],
  features: [],
};

const FEATURE_OPTIONS = VEHICLE_FEATURE_KEYS.map((key) => ({
  value: key,
  label: VEHICLE_FEATURE_LABEL[key],
}));

/** Chuyển phần tử trong mảng từ `from` sang `to` (giữ thứ tự gallery). */
function moveItem<T>(arr: readonly T[], from: number, to: number): T[] {
  const next = [...arr];
  const item = next[from];
  if (item === undefined) return next;
  next.splice(from, 1);
  next.splice(to, 0, item);
  return next;
}

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
  const { control, handleSubmit } = useForm<VehicleFormValues>({
    resolver: yupResolver(vehicleFormSchema),
    defaultValues: initialValues ?? EMPTY_DEFAULTS,
  });

  const imageUrl = useWatch({ control, name: 'mainImageUrl' });

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
            <TextField control={control} name="brand" label="Hãng" placeholder="VD: Toyota" />
          </Col>
          <Col xs={24} sm={12}>
            <TextField control={control} name="model" label="Dòng xe" placeholder="VD: Vios" />
          </Col>
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

      <Card title="Giá thuê" className={styles.section}>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="weekdayPrice"
              label="Giá ngày thường"
              placeholder="VD: 600.000"
              min={0}
              money
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
            />
          </Col>
        </Row>
      </Card>

      <Card title="Hình ảnh, tiện ích & mô tả" className={styles.section}>
        <TextField
          control={control}
          name="mainImageUrl"
          label="Ảnh đại diện (URL)"
          placeholder="https://..."
        />
        {imageUrl ? (
          // eslint-disable-next-line @next/next/no-img-element -- ảnh ngoài từ URL người dùng nhập, không tối ưu qua next/image
          <img src={imageUrl} alt="Xem trước ảnh xe" className={styles.preview} />
        ) : null}

        <div className={styles.galleryBlock}>
          <div className={styles.fieldLabel}>Ảnh gallery (URL, theo thứ tự hiển thị)</div>
          <Controller
            control={control}
            name="images"
            render={({ field }) => {
              const items = field.value ?? [];
              return (
                <div className={styles.gallery}>
                  {items.map((url, idx) => (
                    <div key={idx} className={styles.galleryRow}>
                      <Input
                        value={url}
                        placeholder="https://..."
                        onChange={(e) => {
                          const next = [...items];
                          next[idx] = e.target.value;
                          field.onChange(next);
                        }}
                      />
                      <Button
                        aria-label="Lên"
                        icon={<ArrowUpOutlined />}
                        disabled={idx === 0}
                        onClick={() => field.onChange(moveItem(items, idx, idx - 1))}
                      />
                      <Button
                        aria-label="Xuống"
                        icon={<ArrowDownOutlined />}
                        disabled={idx === items.length - 1}
                        onClick={() => field.onChange(moveItem(items, idx, idx + 1))}
                      />
                      <Button
                        aria-label="Xoá ảnh"
                        danger
                        icon={<DeleteOutlined />}
                        onClick={() => field.onChange(items.filter((_, i) => i !== idx))}
                      />
                    </div>
                  ))}
                  <Button
                    type="dashed"
                    icon={<PlusOutlined />}
                    onClick={() => field.onChange([...items, ''])}
                    disabled={items.length >= 20}
                  >
                    Thêm ảnh
                  </Button>
                </div>
              );
            }}
          />
        </div>

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
