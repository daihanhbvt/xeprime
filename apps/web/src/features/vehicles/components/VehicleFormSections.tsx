'use client';

import { BankOutlined, HomeOutlined, KeyOutlined, TeamOutlined } from '@ant-design/icons';
import { Alert, Checkbox, Col, Radio, Row, Skeleton } from 'antd';
import { useMemo } from 'react';
import { useTranslations } from 'next-intl';
import { Controller, useFormState, useWatch, type Control } from 'react-hook-form';
import {
  CATALOG_TYPE,
  SERVICE_TYPE,
  TRANSMISSION_TYPE_VALUES,
  VEHICLE_TYPE,
  VEHICLE_SOURCE_TYPE,
  VEHICLE_SOURCE_TYPE_VALUES,
  vehicleFuelTypesFor,
  type VehicleSourceType,
} from '@xeprime/types';
import type { VehicleFormValues } from '@xeprime/validators';
import { CatalogCardPicker } from '@/features/catalog/components/CatalogCardPicker';
import { LongTermPriceHint } from '@/features/rental-policies/components/LongTermPriceHint';
import { useCatalogItems, useCatalogOptions } from '@/features/catalog/use-catalog';
import { ImageGalleryField } from '@/components/form/ImageGalleryField';
import { ImageUploadField } from '@/components/form/ImageUploadField';
import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { TextField } from '@/components/form/TextField';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { presignVehicleImage } from '@/services/upload';
import { useVehicleOptions } from '../hooks/use-vehicle-options';
import { PublishRequiredLabel } from './VehicleCompleteness';
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
 *
 * Chỉ có `fields` — tiêu đề của phần nằm ở message (`Vehicles.form.wizard.*` cho wizard tạo,
 * `Vehicles.form.sections.*` cho các nhóm trong bước): một hằng module scope không dịch được.
 */
export const VEHICLE_SECTIONS: ReadonlyArray<{
  key: VehicleSectionKey;
  fields: ReadonlyArray<keyof VehicleFormValues>;
}> = [
  {
    key: 'basic',
    fields: [
      'code',
      'name',
      // Chi nhánh thuộc bước "Cơ bản": nó là VỊ TRÍ của xe, phải validate ngay bước đầu chứ
      // không để lọt tới bước xác nhận rồi mới báo thiếu.
      'branchId',
      'vehicleType',
      'serviceTypes',
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
    fields: [
      'weekdayPrice',
      'weekendPrice',
      'hourlyPrice',
      'monthlyPrice',
      'withDriverDailyPrice',
      'discountPercent',
      'deliveryEnabled',
    ],
  },
  {
    key: 'media',
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
 *
 * Là HOOK, không hằng: cả ba nhãn của mỗi bước đều là chữ hiện cho người dùng.
 */
export function useCreateWizardSteps(): readonly VehicleWizardStep[] {
  const t = useTranslations('Vehicles.form.wizard');

  return useMemo(
    () => [
      {
        key: 'basic',
        title: t('basic.title'),
        shortTitle: t('basic.shortTitle'),
        heading: t('basic.heading'),
        fields: FIELDS_OF.basic,
      },
      {
        key: 'pricing',
        title: t('pricing.title'),
        shortTitle: t('pricing.shortTitle'),
        heading: t('pricing.heading'),
        fields: FIELDS_OF.pricing,
      },
      {
        key: 'media',
        title: t('media.title'),
        shortTitle: t('media.shortTitle'),
        heading: t('media.heading'),
        fields: FIELDS_OF.media,
      },
      {
        key: 'review',
        title: t('review.title'),
        shortTitle: t('review.shortTitle'),
        heading: t('review.heading'),
        fields: [],
      },
    ],
    [t],
  );
}

export interface SectionProps {
  control: Control<VehicleFormValues>;
  isCar: boolean;
  codeReadOnly?: boolean;
  /**
   * Options chi nhánh (id → tên · tỉnh). Caller nạp vì hai màn dùng nguồn khác nhau: wizard tạo
   * xe lấy chi nhánh ĐANG HOẠT ĐỘNG, còn workspace sửa xe phải kèm cả chi nhánh hiện tại của xe
   * kể cả khi nó vừa bị ngừng — nếu không, mở form sửa sẽ thấy ô chi nhánh trống.
   */
  branchOptions?: readonly { value: string; label: string }[];
  branchLoading?: boolean;
  branchDisabled?: boolean;
}

export function BasicSection({
  control,
  isCar: _isCar,
  codeReadOnly = false,
  branchOptions = [],
  branchLoading = false,
  branchDisabled = false,
}: SectionProps) {
  const t = useTranslations('Vehicles.form.basic');
  const options = useVehicleOptions();

  return (
    <Row gutter={24}>
      {/* Thứ tự và nhãn theo Figma `193:1617`: Tên xe TRÁI, Mã xe PHẢI. */}
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="name"
          label={t('name')}
          placeholder={t('namePlaceholder')}
          required
        />
      </Col>
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="code"
          label={t('code')}
          placeholder={t('codePlaceholder')}
          help={t('codeHelp')}
          disabled={codeReadOnly}
        />
      </Col>
      <Col xs={24} sm={12}>
        {/*
          Chi nhánh = VỊ TRÍ CÔNG KHAI của xe. Ngay cả khi gian hàng chỉ có một chi nhánh, ô này
          vẫn hiện (đã chọn sẵn) để người dùng biết xe sẽ hiển thị ở tỉnh nào — một trường bị ẩn
          là một quyết định không ai nhìn thấy.
        */}
        <SelectField
          control={control}
          name="branchId"
          label={t('branch')}
          options={branchOptions}
          loading={branchLoading}
          disabled={branchDisabled}
          showSearch
          required
          help={t('branchHelp')}
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
          label={t('vehicleType')}
          options={options.vehicleType}
          required
        />
      </Col>
      <Col xs={24} sm={12}>
        {/* MẢNG dịch vụ (17/08) — một xe đăng đồng thời tự lái / có tài xế / dài hạn. */}
        <SelectField
          control={control}
          name="serviceTypes"
          label={t('serviceTypes')}
          options={options.serviceType}
          mode="multiple"
          required
          help={t('serviceTypesHelp')}
        />
      </Col>
      <Col xs={24}>
        <VehicleTypePolicyWarning control={control} />
      </Col>
      <Col xs={24}>
        <ServicePriceRemovalWarning control={control} />
      </Col>
    </Row>
  );
}

/**
 * Đổi LOẠI XE của một xe đã tồn tại → chính sách thuê kế thừa đổi theo (17/08: policy mặc
 * định tách theo loại xe). Xe có chính sách riêng thì không ảnh hưởng — nói rõ cả hai vế.
 */
function VehicleTypePolicyWarning({ control }: Pick<SectionProps, 'control'>) {
  const t = useTranslations('Vehicles.form.warnings');
  const domainLabel = useDomainLabel();
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const { defaultValues } = useFormState({ control });
  const initial = defaultValues?.vehicleType;
  if (!initial || initial === vehicleType) return null;

  return (
    <Alert
      type="info"
      showIcon
      message={t('typePolicyTitle', { label: domainLabel('vehicleType', vehicleType) })}
      description={t('typePolicyBody')}
    />
  );
}

/**
 * Cảnh báo NGAY khi bỏ một dịch vụ mà xe đang có giá chuyên biệt (17/08): lưu là giá đó bị
 * xoá theo (server `orphanPriceClears`), thêm lại dịch vụ thì phải nhập giá lại. Đây là lời
 * báo trước; nút Lưu bấm sau khi đã thấy cảnh báo chính là xác nhận.
 */
function ServicePriceRemovalWarning({ control }: Pick<SectionProps, 'control'>) {
  const t = useTranslations('Vehicles.form.warnings');
  const serviceTypes = useWatch({ control, name: 'serviceTypes' }) ?? [];
  const monthlyPrice = useWatch({ control, name: 'monthlyPrice' });
  const withDriverDailyPrice = useWatch({ control, name: 'withDriverDailyPrice' });
  const withDriverInterCityPrice = useWatch({ control, name: 'withDriverInterCityPrice' });
  const withDriverOneWayPrice = useWatch({ control, name: 'withDriverOneWayPrice' });

  const losses: string[] = [];
  if (!serviceTypes.includes(SERVICE_TYPE.LONG_TERM) && monthlyPrice != null) {
    losses.push(t('lossMonthly'));
  }
  if (
    !serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER) &&
    (withDriverDailyPrice != null ||
      withDriverInterCityPrice != null ||
      withDriverOneWayPrice != null)
  ) {
    losses.push(t('lossWithDriver'));
  }
  if (losses.length === 0) return null;

  /*
   * Nối bằng MESSAGE, không bằng `losses.join(' và ')`: liên từ là chữ, và tiếng Anh dùng
   * "and" ở đúng chỗ này. Chỉ có tối đa hai mục nên không cần `Intl.ListFormat`.
   */
  const summary =
    losses.length === 1
      ? losses[0]!
      : t('lossJoin', { first: losses[0]!, second: losses[1]! });

  return (
    <Alert
      type="warning"
      showIcon
      message={t('priceRemovalTitle', { losses: summary })}
      description={t('priceRemovalBody')}
    />
  );
}

/**
 * Trạng thái vận hành tách khỏi khối cơ bản: luồng TẠO không hỏi (xe mới mặc định "Sẵn sàng",
 * hỏi ngay lúc onboarding là thừa — thiết kế bước 1 không có trường này), luồng SỬA hiện nó
 * trong thẻ "Quản lý trạng thái" riêng. Trạng thái HIỂN THỊ (public) không nằm ở đây —
 * client không bao giờ tự đặt `approved_public`, phải đi qua duyệt (lằn ranh bảo mật số 2).
 */
export function StatusSection({ control }: Pick<SectionProps, 'control'>) {
  const t = useTranslations('Vehicles.form.status');
  const options = useVehicleOptions();

  return (
    <Row gutter={24}>
      <Col xs={24} sm={12}>
        <SelectField
          control={control}
          name="operationStatus"
          label={t('operationStatus')}
          options={options.operationStatus}
          required
        />
      </Col>
    </Row>
  );
}

/** Wave 3 chỉ lưu loại nguồn xe. Các form tài chính/hợp đồng chi tiết thuộc tab Nguồn xe ở Wave 4. */
export function SourceTypeSection({ control }: Pick<SectionProps, 'control'>) {
  const t = useTranslations('Vehicles.form.source');
  const domainLabel = useDomainLabel();

  const iconOf = (value: VehicleSourceType) => {
    if (value === VEHICLE_SOURCE_TYPE.OWNED) return <HomeOutlined />;
    if (value === VEHICLE_SOURCE_TYPE.FINANCED) return <BankOutlined />;
    if (value === VEHICLE_SOURCE_TYPE.RENTED) return <KeyOutlined />;
    return <TeamOutlined />;
  };

  /*
   * Bảng mô tả dựng TRONG component: nó cần bộ dịch của request. Liệt kê tường minh cả bốn
   * nhánh (thay cho chuỗi ba toán tử ba ngôi trước đây) nên thêm một hình thức nguồn xe mới là
   * lỗi biên dịch ngay tại đây, không phải một ô mô tả trống lúc chạy.
   */
  const description: Record<VehicleSourceType, string> = {
    [VEHICLE_SOURCE_TYPE.OWNED]: t('owned'),
    [VEHICLE_SOURCE_TYPE.FINANCED]: t('financed'),
    [VEHICLE_SOURCE_TYPE.RENTED]: t('rented'),
    [VEHICLE_SOURCE_TYPE.PARTNERSHIP]: t('partnership'),
  };

  return (
    <fieldset className={styles.sourceFieldset}>
      <legend className={styles.sourceLegend}>{t('legend')}</legend>
      <p className={styles.sourceDescription}>{t('description')}</p>
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
                    <strong>{domainLabel('vehicleSourceType', value)}</strong>
                    <small>{description[value]}</small>
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
      <Alert className={styles.sourceHint} type="info" showIcon message={t('hint')} />
    </fieldset>
  );
}

/** Thông số mở rộng là tuỳ chọn và chỉ xuất hiện trong vùng thu gọn của workspace chỉnh sửa. */
export function AdvancedSpecsSection({ control }: Pick<SectionProps, 'control'>) {
  const t = useTranslations('Vehicles.form.advanced');
  const tCommon = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();

  const transmissionOptions = TRANSMISSION_TYPE_VALUES.map((value) => ({
    value,
    label: domainLabel('transmissionType', value),
  }));

  return (
    <div className={styles.advancedStack}>
      <section className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>{t('dimensionsTitle')}</h3>
        <p className={styles.fieldHint}>{tCommon('optional')}</p>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="lengthMm"
              label={t('lengthMm')}
              placeholder={t('lengthPlaceholder')}
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="widthMm"
              label={t('widthMm')}
              placeholder={t('widthPlaceholder')}
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="heightMm"
              label={t('heightMm')}
              placeholder={t('heightPlaceholder')}
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="curbWeightKg"
              label={t('curbWeightKg')}
              placeholder={t('curbWeightPlaceholder')}
              min={1}
            />
          </Col>
        </Row>
      </section>
      <section className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>{t('engineTitle')}</h3>
        <Row gutter={16}>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="engineDisplacementCc"
              label={t('engineDisplacementCc')}
              placeholder={t('enginePlaceholder')}
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <NumberField
              control={control}
              name="horsepowerHp"
              label={t('horsepowerHp')}
              placeholder={t('horsepowerPlaceholder')}
              min={1}
            />
          </Col>
          <Col xs={24} sm={12}>
            <SelectField
              control={control}
              name="transmission"
              label={t('transmission')}
              options={transmissionOptions}
              allowClear
              placeholder={t('transmissionPlaceholder')}
            />
          </Col>
        </Row>
      </section>
      <section className={styles.subSection}>
        <h3 className={styles.subSectionTitle}>{t('consumptionTitle')}</h3>
        <Row gutter={16}>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="fuelConsumptionCity"
              label={t('consumptionCity')}
              placeholder={t('consumptionCityPlaceholder')}
              min={0}
            />
          </Col>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="fuelConsumptionHighway"
              label={t('consumptionHighway')}
              placeholder={t('consumptionHighwayPlaceholder')}
              min={0}
            />
          </Col>
          <Col xs={24} sm={8}>
            <NumberField
              control={control}
              name="fuelConsumptionCombined"
              label={t('consumptionCombined')}
              placeholder={t('consumptionCombinedPlaceholder')}
              min={0}
            />
          </Col>
        </Row>
      </section>
      <Alert type="info" showIcon message={t('hint')} />
    </div>
  );
}

export function SpecsSection({ control, isCar }: SectionProps) {
  const t = useTranslations('Vehicles.form.specs');

  return (
    <Row gutter={16}>
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="plateNumber"
          label={<PublishRequiredLabel label={t('plateNumber')} />}
          placeholder={t('platePlaceholder')}
          help={t('plateHelp')}
        />
      </Col>
      <Col xs={24} sm={12}>
        <BrandSelect control={control} />
      </Col>
      <Col xs={24} sm={12}>
        <TextField
          control={control}
          name="model"
          label={t('model')}
          placeholder={t('modelPlaceholder')}
        />
      </Col>
      <Col xs={24} sm={12}>
        <NumberField
          control={control}
          name="manufactureYear"
          label={t('manufactureYear')}
          placeholder={String(CURRENT_YEAR)}
          min={1980}
          max={CURRENT_YEAR + 1}
        />
      </Col>
      <Col xs={24} sm={12}>
        <NumberField
          control={control}
          name="seatCount"
          label={t('seatCount')}
          placeholder={t('seatPlaceholder')}
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
          label={t('color')}
          placeholder={t('colorPlaceholder')}
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
  const t = useTranslations('Vehicles.form.specs');
  const current = useWatch({ control, name: 'brand' });
  const options = useCatalogOptions(CATALOG_TYPE.VEHICLE_BRAND, current);
  return (
    <SelectField
      control={control}
      name="brand"
      label={t('brand')}
      options={options}
      placeholder={t('brandPlaceholder')}
      allowClear
      showSearch
    />
  );
}

function FuelTypeSelect({
  control,
  vehicleType,
}: Pick<SectionProps, 'control'> & { vehicleType: string }) {
  const t = useTranslations('Vehicles.form.specs');
  const current = useWatch({ control, name: 'fuelType' });
  const allOptions = useCatalogOptions(CATALOG_TYPE.FUEL_TYPE, current);
  const allowed = vehicleFuelTypesFor(vehicleType);
  const options = allOptions.filter((option) => allowed.some((value) => value === option.value));
  return (
    <SelectField
      control={control}
      name="fuelType"
      label={t('fuelType')}
      options={options}
      placeholder={
        vehicleType === VEHICLE_TYPE.CAR ? t('fuelPlaceholderCar') : t('fuelPlaceholderMotorbike')
      }
      allowClear
    />
  );
}

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

/**
 * Kiểu dáng xe — thẻ có ảnh thay vì dropdown chữ.
 *
 * Đây chính là chiều "Loại xe" khách dùng để lọc ngoài chợ, nên chọn sai là xe không ai tìm
 * thấy; ảnh minh hoạ làm việc chọn tường minh hơn hẳn danh sách "CUV / SUV / MPV" bằng chữ.
 * Cùng component với bộ lọc marketplace (`CatalogCardPicker`) nên hai màn không thể lệch ảnh.
 */
function BodyTypePicker({ control }: Pick<SectionProps, 'control'>) {
  const t = useTranslations('Vehicles.form.specs');
  const { items, isLoading } = useCatalogItems(CATALOG_TYPE.BODY_TYPE);

  return (
    <div className={styles.galleryBlock}>
      <div className={styles.fieldLabel} id="vehicle-body-type-label">
        {t('bodyType')}
      </div>
      <div className={styles.fieldHint}>{t('bodyTypeHint')}</div>
      {isLoading ? (
        <Skeleton active paragraph={{ rows: 2 }} title={false} />
      ) : (
        <Controller
          control={control}
          name="bodyType"
          render={({ field }) => (
            <CatalogCardPicker
              ariaLabel={t('bodyType')}
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
  const t = useTranslations('Vehicles.form.prices');
  // Ô giá dài hạn/có tài xế chỉ hiện khi xe ĐĂNG dịch vụ đó (bước Cơ bản) — không bắt shop
  // nhìn hai ô giá vô nghĩa với xe chỉ tự lái.
  const serviceTypes = useWatch({ control, name: 'serviceTypes' }) ?? [];
  const offersLongTerm = serviceTypes.includes(SERVICE_TYPE.LONG_TERM);
  const offersWithDriver = serviceTypes.includes(SERVICE_TYPE.WITH_DRIVER);
  // Hook gọi vô điều kiện (rules of hooks) — hint chỉ RENDER khi có khối dài hạn.
  const weekdayPriceValue = useWatch({ control, name: 'weekdayPrice' });
  const monthlyPriceValue = useWatch({ control, name: 'monthlyPrice' });

  return (
    <>
      <Row gutter={16}>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="weekdayPrice"
            label={<PublishRequiredLabel label={t('weekday')} />}
            placeholder={t('weekdayPlaceholder')}
            min={0}
            money
            help={t('weekdayHelp')}
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="weekendPrice"
            label={t('weekend')}
            placeholder={t('weekendPlaceholder')}
            min={0}
            money
            help={t('weekendHelp')}
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="hourlyPrice"
            label={t('hourly')}
            placeholder={t('hourlyPlaceholder')}
            min={0}
            money
          />
        </Col>
        <Col xs={24} sm={12}>
          <NumberField
            control={control}
            name="discountPercent"
            label={t('discountPercent')}
            placeholder={t('discountPlaceholder')}
            percent
            help={t('discountHelp')}
          />
        </Col>
        {offersLongTerm ? (
          <>
            <Col xs={24} sm={12}>
              <NumberField
                control={control}
                name="monthlyPrice"
                label={<PublishRequiredLabel label={t('monthly')} />}
                placeholder={t('monthlyPlaceholder')}
                min={0}
                money
                help={t('monthlyHelp')}
              />
            </Col>
            <Col xs={24}>
              {/* Gợi ý giá tháng theo giá ngày ĐANG NHẬP (17/08 đợt 3) — cùng component với
                  tab Giá & chính sách, hai bề mặt không lệch lời khuyên. */}
              <LongTermPriceHint
                weekdayPrice={weekdayPriceValue}
                monthlyPrice={monthlyPriceValue}
              />
            </Col>
          </>
        ) : null}
        {offersWithDriver ? (
          <>
            <Col xs={24} sm={12}>
              <NumberField
                control={control}
                name="withDriverDailyPrice"
                label={<PublishRequiredLabel label={t('withDriverDaily')} />}
                placeholder={t('withDriverDailyPlaceholder')}
                min={0}
                money
                help={t('withDriverDailyHelp')}
              />
            </Col>
            <Col xs={24} sm={12}>
              <NumberField
                control={control}
                name="withDriverInterCityPrice"
                label={t('withDriverInterCity')}
                placeholder={t('withDriverInterCityPlaceholder')}
                min={0}
                money
                help={t('withDriverInterCityHelp')}
              />
            </Col>
            <Col xs={24} sm={12}>
              <NumberField
                control={control}
                name="withDriverOneWayPrice"
                label={t('withDriverOneWay')}
                placeholder={t('withDriverOneWayPlaceholder')}
                min={0}
                money
                help={t('withDriverOneWayHelp')}
              />
            </Col>
          </>
        ) : null}
      </Row>

      {pricePreview}
    </>
  );
}

export function PoliciesSection({ control }: SectionProps) {
  const t = useTranslations('Vehicles.form.policies');

  return (
    <div className={styles.policyBlock}>
      <SwitchField
        control={control}
        name="deliveryEnabled"
        label={t('delivery')}
        description={t('deliveryDescription')}
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
  const t = useTranslations('Vehicles.form.media');

  return (
    <>
      <ImageUploadField
        control={control}
        name="mainImageUrl"
        label={<PublishRequiredLabel label={t('mainImage')} />}
        presign={presignVehicleImage}
      />

      <ImageGalleryField
        control={control}
        name="images"
        label={t('gallery')}
        presign={presignVehicleImage}
        max={20}
      />
    </>
  );
}

export function FeaturesDescriptionSection({ control }: SectionProps) {
  const t = useTranslations('Vehicles.form.media');

  return (
    <>
      <div className={styles.galleryBlock}>
        <div className={styles.fieldLabel} id="vehicle-features-label">
          {t('features')}
        </div>
        <FeaturesSelect control={control} />
      </div>

      <div className={styles.descBlock}>
        <TextAreaField
          control={control}
          name="description"
          label={<PublishRequiredLabel label={t('description')} />}
          placeholder={t('descriptionPlaceholder')}
          maxLength={4000}
          rows={5}
        />
      </div>
    </>
  );
}
