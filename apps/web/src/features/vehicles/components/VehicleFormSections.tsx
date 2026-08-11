'use client';

import { BankOutlined, HomeOutlined, KeyOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Checkbox, Col, Radio, Row, Skeleton } from 'antd';
import { useMemo } from 'react';
import { Controller, useWatch, type Control } from 'react-hook-form';
import {
  CATALOG_TYPE,
  TRANSMISSION_TYPE_LABEL,
  TRANSMISSION_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_SOURCE_TYPE_LABEL,
  VEHICLE_SOURCE_TYPE_VALUES,
  vehicleFuelTypesFor,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { CatalogCardPicker } from '@/features/catalog/components/CatalogCardPicker';
import { useCatalogItems, useCatalogOptions } from '@/features/catalog/use-catalog';
import { ImageGalleryField } from '@/components/form/ImageGalleryField';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { presignVehicleImage } from '@/services/upload';
import { OPERATION_STATUS_OPTIONS, SERVICE_TYPE_OPTIONS, VEHICLE_TYPE_OPTIONS } from '../constants';
import { publishRequiredLabel } from './VehicleCompleteness';
import styles from './VehicleForm.module.css';

const CURRENT_YEAR = new Date().getFullYear();

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
    fields: [
      'code',
      'name',
      'vehicleType',
      'serviceType',
      'operationStatus',
      'plateNumber',
      'brand',
      'model',
      'bodyType',
      'manufactureYear',
      'seatCount',
      'fuelType',
      'color',
      'sourceType',
    ],
  },
  {
    key: 'specs',
    title: 'Thông số kỹ thuật',
    fields: [
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

/** Một bước của wizard: nhãn trên thanh bước + tiêu đề trong thẻ + các trường phải validate. */
export interface VehicleWizardStep {
  key: string;
  /** Nhãn thanh bước ở desktop — dùng ĐÚNG chữ Figma. */
  title: string;
  /** Nhãn rút gọn cho mobile: giữ toàn bộ wizard trên một hàng. */
  shortTitle: string;
  /** Tiêu đề trong thẻ nội dung, đã đánh số. */
  heading: string;
  fields: ReadonlyArray<keyof VehicleFormValues>;
}

const FIELDS_OF = Object.fromEntries(
  VEHICLE_SECTIONS.map((section) => [section.key, section.fields]),
) as Record<VehicleSectionKey, ReadonlyArray<keyof VehicleFormValues>>;

/**
 * Wizard **tạo xe** — 4 bước. Thông số kỹ thuật nâng cao được nhập sau ở workspace chỉnh sửa;
 * không bắt chủ xe đi qua một bước tuỳ chọn trong lúc onboarding.
 *
 * Bước xác nhận không có trường nào để validate: nó tổng kết ba bước trước rồi gửi.
 */
export const CREATE_WIZARD_STEPS: readonly VehicleWizardStep[] = [
  {
    key: 'basic',
    title: 'Cơ bản',
    shortTitle: 'Cơ bản',
    heading: '1. Thông tin cơ bản của xe',
    fields: FIELDS_OF.basic,
  },
  {
    key: 'pricing',
    title: 'Giá & chính sách',
    shortTitle: 'Giá',
    heading: '2. Giá thuê & chính sách',
    fields: FIELDS_OF.pricing,
  },
  {
    key: 'media',
    title: 'Hình ảnh',
    shortTitle: 'Hình ảnh',
    heading: '3. Hình ảnh, tiện ích & mô tả xe',
    fields: FIELDS_OF.media,
  },
  {
    key: 'review',
    title: 'Xác nhận',
    shortTitle: 'Xác nhận',
    heading: '4. Xác nhận thông tin hồ sơ xe',
    fields: [],
  },
];

/**
 * Wizard **sửa xe** — nhãn lấy nguyên văn Figma `193:2297` (`StepperBar`).
 *
 * Nhóm trường khác luồng tạo có chủ đích: người sửa nhảy thẳng tới thứ muốn đổi, nên ảnh, giá và
 * điều khoản tách thành ba bước riêng thay vì gộp.
 *
 * ⚠️ Figma chỉ vẽ bước 1 và bước 3 của luồng sửa, và bước 1 chỉ có 5 trường cơ bản — tức **không
 * frame nào chứa thông số kỹ thuật** (biển số, hãng, số chỗ…). Bỏ chúng đi thì `plateNumber` —
 * một trường NHẠY CẢM — không còn sửa được ở đâu cả. Nên chúng nằm ở "Thông tin chung", nghĩa
 * rộng của nhãn này cho phép. Ghi lại ở báo cáo Wave 3B.
 */
export const EDIT_WIZARD_STEPS: readonly VehicleWizardStep[] = [
  {
    key: 'general',
    title: 'Thông tin chung',
    shortTitle: 'Chung',
    heading: '1. Thông tin chung',
    fields: [...FIELDS_OF.basic, ...FIELDS_OF.specs],
  },
  {
    key: 'images',
    title: 'Hình ảnh xe',
    shortTitle: 'Hình ảnh',
    heading: '2. Hình ảnh xe',
    fields: ['mainImageUrl', 'images'],
  },
  {
    key: 'prices',
    title: 'Thiết lập giá',
    shortTitle: 'Giá',
    heading: '3. Thiết lập giá thuê',
    fields: ['weekdayPrice', 'weekendPrice', 'hourlyPrice', 'discountPercent'],
  },
  {
    key: 'terms',
    title: 'Điều khoản thuê',
    shortTitle: 'Điều khoản',
    heading: '4. Điều khoản thuê',
    fields: ['deliveryEnabled', 'noCollateral', 'features', 'description'],
  },
  {
    key: 'review',
    title: 'Xác nhận lại',
    shortTitle: 'Xác nhận',
    heading: '5. Xác nhận & Hoàn tất chỉnh sửa',
    fields: [],
  },
];

export interface SectionProps {
  control: Control<VehicleFormValues>;
  isCar: boolean;
  codeReadOnly?: boolean;
}

export function BasicSection({ control, isCar: _isCar, codeReadOnly = false }: SectionProps) {
  return (
    <Row gutter={24}>
      {/* Thứ tự và nhãn theo Figma `193:1617`: Tên xe TRÁI, Mã xe PHẢI. */}
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="name"
          label="Tên xe"
          placeholder="Nhập tên xe (Ví dụ: Toyota Vios 2023)"
          required
        />
      </Col>
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="code"
          label="Mã xe"
          placeholder="Hệ thống tự sinh nếu bỏ trống"
          help="Mã định danh nội bộ, duy nhất trong gian hàng"
          disabled={codeReadOnly}
        />
      </Col>
      <Col xs={24} sm={12}>
        {/*
          Figma `193:1636` vẽ Loại xe là dropdown chứ không phải radio.
          Hôm nay chỉ có hai lựa chọn nên radio cũng dùng được, nhưng danh sách loại xe là thứ
          sẽ dài ra (xe tải, xe khách…) — dropdown chịu được điều đó mà radio thì không.
        */}
        <SelectField
          control={control}
          name="vehicleType"
          label="Loại xe"
          options={VEHICLE_TYPE_OPTIONS}
          required
        />
      </Col>
      <Col xs={24} sm={12}>
        <SelectField
          control={control}
          name="serviceType"
          label="Loại dịch vụ"
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

/** Wave 3 chỉ lưu loại nguồn xe. Các form tài chính/hợp đồng chi tiết thuộc tab Nguồn xe ở Wave 4. */
export function SourceTypeSection({ control }: Pick<SectionProps, 'control'>) {
  const iconOf = (value: (typeof VEHICLE_SOURCE_TYPE_VALUES)[number]) => {
    if (value === VEHICLE_SOURCE_TYPE.OWNED) return <HomeOutlined />;
    if (value === VEHICLE_SOURCE_TYPE.FINANCED) return <BankOutlined />;
    if (value === VEHICLE_SOURCE_TYPE.RENTED) return <KeyOutlined />;
    return <TeamOutlined />;
  };

  return (
    <fieldset className={styles.sourceFieldset}>
      <legend className={styles.sourceLegend}>Hình thức nguồn xe *</legend>
      <p className={styles.sourceDescription}>
        Xác định cách quản lý tài chính và phân chia lợi nhuận của xe
      </p>
      <Controller
        control={control}
        name="sourceType"
        render={({ field, fieldState }) => (
          <>
            <Radio.Group
              value={field.value}
              onChange={(event) => field.onChange(event.target.value)}
              className={styles.sourceGrid}
            >
              {VEHICLE_SOURCE_TYPE_VALUES.map((value) => (
                <Radio key={value} value={value} className={styles.sourceOption}>
                  <span className={styles.sourceIcon} aria-hidden="true">
                    {iconOf(value)}
                  </span>
                  <span className={styles.sourceCopy}>
                    <strong>{VEHICLE_SOURCE_TYPE_LABEL[value]}</strong>
                    <small>
                      {value === VEHICLE_SOURCE_TYPE.OWNED
                        ? 'Xe thuộc quyền sở hữu của bạn'
                        : value === VEHICLE_SOURCE_TYPE.FINANCED
                          ? 'Đang góp qua ngân hàng'
                          : value === VEHICLE_SOURCE_TYPE.RENTED
                            ? 'Thuê từ chủ xe khác để kinh doanh'
                            : 'Ký gửi/chia doanh thu với chủ xe'}
                    </small>
                  </span>
                </Radio>
              ))}
            </Radio.Group>
            {fieldState.error ? (
              <div className={styles.fieldError}>{fieldState.error.message}</div>
            ) : null}
          </>
        )}
      />
      <Alert
        className={styles.sourceHint}
        type="info"
        showIcon
        message="Bạn sẽ bổ sung hồ sơ tài chính hoặc hợp đồng chi tiết sau khi tạo xe."
      />
    </fieldset>
  );
}

/** Thông số mở rộng là tuỳ chọn và chỉ xuất hiện trong vùng thu gọn của workspace chỉnh sửa. */
export function AdvancedSpecsSection({ control }: Pick<SectionProps, 'control'>) {
  const transmissionOptions = TRANSMISSION_TYPE_VALUES.map((value) => ({
    value,
    label: TRANSMISSION_TYPE_LABEL[value],
  }));

  return (
    <div className={styles.advancedStack}>
      <section className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>Kích thước & Trọng lượng</h3>
        <p className={styles.fieldHint}>Không bắt buộc</p>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="lengthMm"
              label="Chiều dài (mm)"
              placeholder="VD: 4630"
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="widthMm"
              label="Chiều rộng (mm)"
              placeholder="VD: 1780"
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="heightMm"
              label="Chiều cao (mm)"
              placeholder="VD: 1435"
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="curbWeightKg"
              label="Trọng lượng bản thân (kg)"
              placeholder="VD: 1250"
              min={1}
            />
          </Col>
        </Row>
      </section>
      <section className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>Động cơ & Vận hành</h3>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="engineDisplacementCc"
              label="Dung tích động cơ (cc)"
              placeholder="VD: 1798"
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="horsepowerHp"
              label="Công suất cực đại (HP)"
              placeholder="VD: 138"
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <SelectField
              control={control}
              name="transmission"
              label="Hộp số"
              options={transmissionOptions}
              allowClear
              placeholder="Chọn hộp số"
            />
          </Col>
        </Row>
      </section>
      <section className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>Mức tiêu thụ nhiên liệu (L/100km)</h3>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="fuelConsumptionCity"
              label="Trong đô thị"
              placeholder="VD: 8.5"
              min={0}
            />
          </Col>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="fuelConsumptionHighway"
              label="Ngoài đô thị"
              placeholder="VD: 5.2"
              min={0}
            />
          </Col>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="fuelConsumptionCombined"
              label="Kết hợp"
              placeholder="VD: 6.5"
              min={0}
            />
          </Col>
        </Row>
      </section>
      <Alert
        type="info"
        showIcon
        message="Các thông số kỹ thuật giúp tăng khả năng tìm thấy xe; bạn có thể cập nhật sau."
      />
    </div>
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
        <BrandSelect control={control} />
      </Col>
      <Col xs={24} sm={12}>
        <TextField control={control} name="model" label="Mẫu xe (model)" placeholder="VD: Vios" />
      </Col>
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
        <FuelTypeSelect
          control={control}
          vehicleType={isCar ? VEHICLE_TYPE.CAR : VEHICLE_TYPE.MOTORBIKE}
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
      {isCar ? (
        <Col xs={24}>
          <BodyTypePicker control={control} />
        </Col>
      ) : null}
    </Row>
  );
}

/**
 * Hãng xe — chọn trong danh mục do quản trị nền tảng cấu hình, KHÔNG còn nhập tự do.
 *
 * Trước đây đây là ô AutoComplete gõ gì cũng lưu, nên bộ lọc ngoài chợ mọc ra "Toyota",
 * "toyota " và "TOYOTA" thành ba hãng khác nhau. Giá trị lưu xuống là `key` của danh mục.
 */
function BrandSelect({ control }: Pick<SectionProps, 'control'>) {
  const current = useWatch({ control, name: 'brand' });
  const options = useCatalogOptions(CATALOG_TYPE.VEHICLE_BRAND, current);
  return (
    <SelectField
      control={control}
      name="brand"
      label="Hãng sản xuất"
      options={options}
      placeholder="Chọn hãng xe"
      allowClear
      showSearch
    />
  );
}

function FuelTypeSelect({
  control,
  vehicleType,
}: Pick<SectionProps, 'control'> & { vehicleType: string }) {
  const current = useWatch({ control, name: 'fuelType' });
  const allOptions = useCatalogOptions(CATALOG_TYPE.FUEL_TYPE, current);
  const allowed = vehicleFuelTypesFor(vehicleType);
  const options = allOptions.filter((option) => allowed.some((value) => value === option.value));
  return (
    <SelectField
      control={control}
      name="fuelType"
      label="Nguồn năng lượng"
      options={options}
      placeholder={
        vehicleType === VEHICLE_TYPE.CAR ? 'Xăng, dầu, điện hoặc hybrid' : 'Xăng hoặc điện'
      }
      allowClear
    />
  );
}

/**
 * Kiểu dáng xe — thẻ có ảnh thay vì dropdown chữ.
 *
 * Đây chính là chiều "Loại xe" khách dùng để lọc ngoài chợ, nên chọn sai là xe không ai tìm
 * thấy; ảnh minh hoạ làm việc chọn tường minh hơn hẳn danh sách "CUV / SUV / MPV" bằng chữ.
 * Cùng component với bộ lọc marketplace (`CatalogCardPicker`) nên hai màn không thể lệch ảnh.
 */
/** Tiện ích — cùng danh mục `vehicle_feature` mà bộ lọc ngoài chợ dùng. */
function FeaturesSelect({ control }: Pick<SectionProps, 'control'>) {
  const { items } = useCatalogItems(CATALOG_TYPE.VEHICLE_FEATURE);
  const options = useMemo(
    () => items.map((item) => ({ value: item.key, label: item.label })),
    [items],
  );
  return (
    <Controller
      control={control}
      name="features"
      render={({ field }) => (
        <Checkbox.Group
          aria-labelledby="vehicle-features-label"
          className={styles.featuresGrid}
          value={field.value ?? []}
          onChange={field.onChange}
        >
          {options.map((option) => (
            <Checkbox key={option.value} value={option.value} className={styles.featureOption}>
              {option.label}
            </Checkbox>
          ))}
        </Checkbox.Group>
      )}
    />
  );
}

function BodyTypePicker({ control }: Pick<SectionProps, 'control'>) {
  const { items, isLoading } = useCatalogItems(CATALOG_TYPE.BODY_TYPE);

  return (
    <div className={styles.galleryBlock}>
      <div className={styles.fieldLabel} id="vehicle-body-type-label">
        Kiểu dáng xe
      </div>
      <div className={styles.fieldHint}>Giúp khách lọc xe trên chợ. Bấm lại để bỏ chọn.</div>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      ) : (
        <Controller
          control={control}
          name="bodyType"
          render={({ field }) => (
            <CatalogCardPicker
              ariaLabel="Kiểu dáng xe"
              items={items}
              value={field.value ? [field.value] : []}
              onChange={(next) => field.onChange(next[0] ?? null)}
            />
          )}
        />
      )}
    </div>
  );
}

/**
 * Giá và chính sách tách làm hai khối rời.
 *
 * Wizard **tạo** gộp chúng vào một bước ("Giá thuê & chính sách", Figma `193:1779`), wizard
 * **sửa** tách thành hai bước ("Thiết lập giá" `193:2441` và "Điều khoản thuê"). Cùng một khối
 * dùng cho cả hai nên hai luồng không bao giờ lệch nhau về trường hay nhãn.
 */
export function PricingSection({
  control,
  isCar,
  pricePreview,
}: SectionProps & { pricePreview: React.ReactNode }) {
  return (
    <>
      <PricesSection control={control} isCar={isCar} pricePreview={pricePreview} />
      <PoliciesSection control={control} isCar={isCar} />
    </>
  );
}

export function PricesSection({
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
    </>
  );
}

export function PoliciesSection({ control }: SectionProps) {
  return (
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
  );
}

/** Ảnh + thư viện + tiện ích + mô tả — một bước ở luồng tạo, hai bước ở luồng sửa. */
export function MediaSection({ control, isCar }: SectionProps) {
  return (
    <>
      <ImagesSection control={control} isCar={isCar} />
      <FeaturesDescriptionSection control={control} isCar={isCar} />
    </>
  );
}

export function ImagesSection({ control }: SectionProps) {
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
    </>
  );
}

export function FeaturesDescriptionSection({ control }: SectionProps) {
  return (
    <>
      <div className={styles.galleryBlock}>
        <div className={styles.fieldLabel} id="vehicle-features-label">
          Tiện ích trên xe
        </div>
        <FeaturesSelect control={control} />
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
