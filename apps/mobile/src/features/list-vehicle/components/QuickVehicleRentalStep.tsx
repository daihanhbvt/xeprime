import { useState } from 'react';
import { useController, useWatch, type Control } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MILEAGE_LIMIT } from '@xeprime/types';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { StepSlider } from '@/components/ui/StepSlider';
import { TextField } from '@/components/ui/TextField';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { discountedPriceVnd } from '@/features/vehicles/pricing';
import { useAppFormat } from '@/i18n/use-app-format';
import { colors, fontSize, space } from '@/theme/tokens';
import type { QuickVehicleValues } from '../quick-schema';

/** Dải phần trăm giảm giá của luồng nhanh — hẹp hơn luật chung để tránh gõ nhầm một số 0. */
const DISCOUNT_RANGE = { min: 5, max: 40 } as const;

/** Trần điều khoản — khớp `termsText` của `quickVehicleSchema` và `maxLength={4000}` của web. */
const TERMS_MAX = 4000;

/**
 * Bước CHO THUÊ của wizard đăng xe nhanh — bản native của `QuickVehicleRentalStep`.
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
export function QuickVehicleRentalStep({
  control,
  branchOptions,
  branchLoading,
  branchError,
}: {
  control: Control<QuickVehicleValues>;
  branchOptions: readonly { value: string; label: string }[];
  branchLoading: boolean;
  branchError: boolean;
}) {
  const t = useTranslations('ListYourVehicle.rental');
  const fmt = useAppFormat();

  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const discountEnabled = useWatch({ control, name: 'discountEnabled' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });
  const deliveryEnabled = useWatch({ control, name: 'deliveryEnabled' });
  const mileageLimitEnabled = useWatch({ control, name: 'mileageLimitEnabled' });

  const discounted = discountEnabled
    ? discountedPriceVnd(weekdayPrice == null ? null : String(weekdayPrice), discountPercent)
    : null;

  return (
    <YStack gap={space.md}>
      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('priceTitle')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('priceHint')}
          </Text>
          <MoneyField control={control} name="weekdayPrice" label={t('priceLabel')} required />
          {discounted != null ? (
            <Text col={colors.text} fos={fontSize.bodySm}>
              {t('pricePreview', { price: fmt.money(discounted) })}
            </Text>
          ) : null}
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <ToggleField
            control={control}
            name="discountEnabled"
            label={t('discountTitle')}
            hint={t('discountHint')}
          />
          {discountEnabled ? <DiscountSlider control={control} /> : null}
        </YStack>
      </Card>

      <Card>
        <ToggleField
          control={control}
          name="autoAcceptEnabled"
          label={t('autoAcceptTitle')}
          hint={t('autoAcceptHint')}
        />
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('addressTitle')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('addressHint')}
          </Text>
          <SelectField
            control={control}
            name="branchId"
            label={t('addressLabel')}
            options={branchOptions}
            disabled={branchLoading || branchError}
            required
          />
          {branchError ? <Callout tone="warning">{t('addressLoadError')}</Callout> : null}
          {/*
            KHÔNG có lối sang "quản lý chi nhánh" ở đây (web có, app cố ý bỏ).

            Wizard này là cửa của TUYẾN HOA HỒNG: người đi qua đây phần lớn chưa có gian hàng và
            vừa mới tạo hồ sơ chủ xe ở bước 1. Ném họ sang `/manage/shop/branches` giữa lúc đang
            khai dở một chiếc xe là bỏ luôn form đang điền, và đưa họ vào đúng khu mà cả luồng
            này sinh ra để tránh. Chi nhánh mặc định đã được chọn sẵn ở trên.
          */}
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <ToggleField
            control={control}
            name="deliveryEnabled"
            label={t('deliveryTitle')}
            hint={t('deliveryHint')}
          />
          {deliveryEnabled ? (
            <>
              <NumberField
                control={control}
                name="deliveryFreeWithinKm"
                label={t('deliveryFreeLabel')}
                hint={t('deliveryFreeHelp')}
                suffix="km"
                min={0}
                max={500}
              />
              <NumberField
                control={control}
                name="deliveryMaxRadiusKm"
                label={t('deliveryRadiusLabel')}
                hint={t('deliveryRadiusHelp')}
                suffix="km"
                min={1}
                max={500}
                required
              />
              <MoneyField
                control={control}
                name="deliveryFee"
                label={t('deliveryFeeLabel')}
                hint={t('deliveryFeeHelp')}
                required
              />
            </>
          ) : null}
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <ToggleField
            control={control}
            name="mileageLimitEnabled"
            label={t('mileageTitle')}
            hint={t('mileageHint')}
          />
          {mileageLimitEnabled ? (
            <>
              <NumberField
                control={control}
                name="includedDistanceKmPerDay"
                label={t('mileageIncludedLabel')}
                hint={t('mileageIncludedHelp')}
                suffix="km"
                integer
                min={MILEAGE_LIMIT.minKmPerDay}
                max={MILEAGE_LIMIT.maxKmPerDay}
                required
              />
              <MoneyField
                control={control}
                name="excessDistanceFeePerKm"
                label={t('mileageExcessLabel')}
                hint={t('mileageExcessHelp')}
                required
              />
            </>
          ) : null}
        </YStack>
      </Card>

      <Card>
        <YStack gap={space.md}>
          <BlockTitle>{t('termsTitle')}</BlockTitle>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('termsHint')}
          </Text>
          <TextField
            control={control}
            name="termsText"
            label={t('termsLabel')}
            placeholder={t('termsPlaceholder')}
            multiline
            rows={4}
            maxLength={TERMS_MAX}
          />
        </YStack>
      </Card>
    </YStack>
  );
}

/**
 * Mức giảm giá — thanh kéo 5–40%, đúng dải của web.
 *
 * Không phải ô gõ số: một ô cho gõ "0" hoặc "95" rồi mới báo lỗi, còn thanh kéo không có cách
 * nào tạo ra một giá trị ngoài dải. `onSlide` chỉ nuôi dòng chữ đang chạy theo ngón tay; giá trị
 * thật chỉ vào form khi thả tay.
 */
function DiscountSlider({ control }: { control: Control<QuickVehicleValues> }) {
  const t = useTranslations('ListYourVehicle.rental');
  const { field } = useController({ control, name: 'discountPercent' });
  const value = field.value ?? DISCOUNT_RANGE.min;
  const [preview, setPreview] = useState(value);

  return (
    <YStack gap={space.xs}>
      <Text col={colors.text} fos={fontSize.bodySm}>
        {t('discountValue', { percent: preview })}
      </Text>
      <StepSlider
        min={DISCOUNT_RANGE.min}
        max={DISCOUNT_RANGE.max}
        step={1}
        value={value}
        onSlide={setPreview}
        onChange={(next) => {
          setPreview(next);
          field.onChange(next);
        }}
      />
    </YStack>
  );
}

/**
 * Công tắc gắn với react-hook-form.
 *
 * `ToggleRow` là thành phần KHÔNG gắn form (nó chỉ nhận `checked` + `onToggle`), nên mỗi công
 * tắc ở đây phải tự nối vào RHF. Gói một lần ở đây thay vì lặp bốn lần trong thân bước.
 */
function ToggleField({
  control,
  name,
  label,
  hint,
}: {
  control: Control<QuickVehicleValues>;
  name: 'discountEnabled' | 'autoAcceptEnabled' | 'deliveryEnabled' | 'mileageLimitEnabled';
  label: string;
  hint?: string;
}) {
  const { field } = useController({ control, name });
  return (
    <ToggleRow
      label={label}
      {...(hint ? { hint } : {})}
      checked={Boolean(field.value)}
      onToggle={() => field.onChange(!field.value)}
    />
  );
}
