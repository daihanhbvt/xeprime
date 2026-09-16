'use client';

import { Alert, Slider } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { Controller, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { MILEAGE_LIMIT } from '@xeprime/types';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { useWorkspace } from '@/hooks/use-workspace';
import { branchLabel } from '@/features/branches/branch-label';
import type { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { MarketPriceHint } from '@/features/vehicles/components/MarketPriceHint';
import { discountedPriceVnd } from '@/features/vehicles/pricing';
import { useAppFormat } from '@/i18n/use-app-format';

import type { QuickVehicleValues } from '../../schema';
import styles from './QuickVehicleSteps.module.css';

/** Dải phần trăm giảm giá của luồng nhanh — hẹp hơn luật chung để tránh gõ nhầm một số 0. */
const DISCOUNT_RANGE = { min: 5, max: 40 } as const;

interface Props {
  control: Control<QuickVehicleValues>;
  /** Nút "dùng giá này" của khối gợi ý giá ghi thẳng vào ô giá — hành động của người dùng. */
  setValue: UseFormSetValue<QuickVehicleValues>;
  vehicleType: string;
  branches: ReturnType<typeof useActiveBranches>;
}

/**
 * Bước 2 — cho thuê.
 *
 * Mọi thứ ở đây ghi vào NGUỒN THẬT đang chạy, không có cấu hình riêng của wizard:
 *
 *  - giá ngày và % giảm → `vehicles` + `PricingService` (máy giá vẫn là nơi tính tiền);
 *  - địa chỉ xe → chi nhánh (`Vehicle.branchId → TenantBranch`), không có ô địa chỉ thứ hai;
 *  - giao xe tận nơi → BẬC phí cố định theo khoảng cách của `RentalPolicy` (đúng ngữ nghĩa
 *    `deliveryFeeFor` đang dùng), không phải một đơn giá đ/km mới;
 *  - hạn mức km → `RentalPolicy.includedDistanceKmPerDay` + phí mỗi km vượt, công bố ở trang xe
 *    và đóng băng vào đơn;
 *  - tự động nhận chuyến → `VehicleServiceSetting` của dịch vụ tự lái.
 *
 * Mọi công tắc mặc định TẮT: không có ưu đãi, bán kính hay hạn mức nào tự sinh ra.
 */
export function QuickVehicleRentalStep({ control, setValue, vehicleType, branches }: Props) {
  const t = useTranslations('ListYourVehicle.rental');
  const tBranches = useTranslations('Branches');
  const fmt = useAppFormat();
  const { paths, isManage } = useWorkspace();

  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const discountEnabled = useWatch({ control, name: 'discountEnabled' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });
  const deliveryEnabled = useWatch({ control, name: 'deliveryEnabled' });
  const mileageEnabled = useWatch({ control, name: 'mileageLimitEnabled' });
  /*
   * Chiều phân khúc của gợi ý giá đọc từ bước 1 — wizard nhanh không hỏi kiểu dáng thân xe, nên
   * ô tô so theo SỐ CHỖ (backend tự quy về đúng nhóm của bộ lọc chợ). Đọc từ form chứ không
   * truyền xuống qua props: chúng là dữ liệu người dùng vừa khai ở bước trước, và `useWatch` là
   * đường duy nhất thấy nó đổi ngay.
   */
  const motorbikeCategory = useWatch({ control, name: 'motorbikeCategory' });
  const seatCount = useWatch({ control, name: 'seatCount' });
  const branchId = useWatch({ control, name: 'branchId' });

  const noProvince = tBranches('labels.noProvince');
  const branchOptions = (branches.data?.items ?? []).map((b) => ({
    value: b.id,
    label: branchLabel(b, noProvince),
  }));
  // Tỉnh của chi nhánh giữ xe — chiều hẹp nhất của gợi ý giá; chưa chọn chi nhánh thì bỏ qua vế đó.
  const branch = (branches.data?.items ?? []).find((b) => b.id === branchId) ?? null;
  const discounted = discountEnabled
    ? discountedPriceVnd(weekdayPrice == null ? null : String(weekdayPrice), discountPercent)
    : null;

  return (
    <div className={styles.stack}>
      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('priceTitle')}</h3>
        <p className={styles.blockHint}>{t('priceHint')}</p>
        <NumberField
          control={control}
          name="weekdayPrice"
          label={t('priceLabel')}
          money
          min={0}
          required
        />
        {/*
          Gợi ý giá đặt SAU ô nhập, không phải placeholder trong ô: placeholder biến mất ngay khi
          gõ ký tự đầu tiên — đúng lúc người dùng cần đối chiếu nhất.
        */}
        <MarketPriceHint
          vehicleType={vehicleType}
          motorbikeCategory={motorbikeCategory}
          seatCount={seatCount}
          provinceCode={branch?.provinceCode ?? null}
          provinceName={branch?.provinceName ?? null}
          onApply={(price) => setValue('weekdayPrice', price, { shouldValidate: true })}
        />
        {discounted != null ? (
          <p className={styles.preview}>{t('pricePreview', { price: fmt.money(discounted) })}</p>
        ) : null}
      </section>

      <section className={styles.block}>
        <SwitchField
          control={control}
          name="discountEnabled"
          label={t('discountTitle')}
          description={t('discountHint')}
        />
        {discountEnabled ? (
          <Controller
            control={control}
            name="discountPercent"
            render={({ field }) => (
              <div className={styles.sliderRow}>
                <Slider
                  min={DISCOUNT_RANGE.min}
                  max={DISCOUNT_RANGE.max}
                  value={field.value ?? DISCOUNT_RANGE.min}
                  onChange={(value: number) => field.onChange(value)}
                  className={styles.slider}
                  aria-label={t('discountAria')}
                />
                <span className={styles.sliderValue}>
                  {t('discountValue', { percent: field.value ?? DISCOUNT_RANGE.min })}
                </span>
              </div>
            )}
          />
        ) : null}
      </section>

      <section className={styles.block}>
        <SwitchField
          control={control}
          name="autoAcceptEnabled"
          label={t('autoAcceptTitle')}
          description={t('autoAcceptHint')}
        />
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('addressTitle')}</h3>
        <p className={styles.blockHint}>{t('addressHint')}</p>
        <SelectField
          control={control}
          name="branchId"
          label={t('addressLabel')}
          options={branchOptions}
          loading={branches.isLoading}
          disabled={branches.isError}
          required
        />
        {branches.isError ? (
          <Alert type="warning" showIcon title={t('addressLoadError')} />
        ) : null}
        {/*
          Quản lý chi nhánh chỉ có ở cổng gian hàng. Wizard này là cửa vào CÔNG KHAI của chủ xe
          mới — phần lớn người đứng ở đây là tuyến hoa hồng, chỉ có chi nhánh mặc định, và không
          vào `/manage` được (ADR 0027/0028). Hiện link cho họ là hứa một màn họ sẽ bị đá ra.
        */}
        {isManage ? (
          <p className={styles.blockHint}>
            <Link href={paths.branches}>{t('addressManageLink')}</Link>
          </p>
        ) : null}
      </section>

      <section className={styles.block}>
        <SwitchField
          control={control}
          name="deliveryEnabled"
          label={t('deliveryTitle')}
          description={t('deliveryHint')}
        />
        {deliveryEnabled ? (
          <div className={styles.grid}>
            <NumberField
              control={control}
              name="deliveryFreeWithinKm"
              label={t('deliveryFreeLabel')}
              help={t('deliveryFreeHelp')}
              min={0}
              max={500}
            />
            <NumberField
              control={control}
              name="deliveryMaxRadiusKm"
              label={t('deliveryRadiusLabel')}
              help={t('deliveryRadiusHelp')}
              min={1}
              max={500}
              required
            />
            <NumberField
              control={control}
              name="deliveryFee"
              label={t('deliveryFeeLabel')}
              help={t('deliveryFeeHelp')}
              money
              min={0}
              required
            />
          </div>
        ) : null}
      </section>

      <section className={styles.block}>
        <SwitchField
          control={control}
          name="mileageLimitEnabled"
          label={t('mileageTitle')}
          description={t('mileageHint')}
        />
        {mileageEnabled ? (
          <div className={styles.grid}>
            <NumberField
              control={control}
              name="includedDistanceKmPerDay"
              label={t('mileageIncludedLabel')}
              help={t('mileageIncludedHelp')}
              min={MILEAGE_LIMIT.minKmPerDay}
              max={MILEAGE_LIMIT.maxKmPerDay}
              required
            />
            <NumberField
              control={control}
              name="excessDistanceFeePerKm"
              label={t('mileageExcessLabel')}
              help={t('mileageExcessHelp')}
              money
              min={0}
              max={MILEAGE_LIMIT.maxFeePerKm}
              required
            />
          </div>
        ) : null}
      </section>

      <section className={styles.block}>
        <h3 className={styles.blockTitle}>{t('termsTitle')}</h3>
        <p className={styles.blockHint}>{t('termsHint')}</p>
        <TextAreaField
          control={control}
          name="termsText"
          label={t('termsLabel')}
          placeholder={t('termsPlaceholder')}
          maxLength={4000}
          rows={4}
        />
      </section>
    </div>
  );
}
