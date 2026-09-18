import { useState } from 'react';
import { useController, useWatch, type Control } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { MILEAGE_LIMIT, PERMISSION } from '@xeprime/types';
import { formatAddress } from '@xeprime/domain';
import type { OwnerProfileValues } from '@xeprime/validators';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { MoneyField } from '@/components/ui/MoneyField';
import { NumberField } from '@/components/ui/NumberField';
import { SelectField } from '@/components/ui/SelectField';
import { StepSlider } from '@/components/ui/StepSlider';
import { TextField } from '@/components/ui/TextField';
import { InlineAction } from '@/components/ui/InlineAction';
import { SkeletonText } from '@/components/ui/Skeleton';
import { BranchFormSheet } from '@/features/branches/components/BranchFormSheet';
import type { Branch } from '@/features/branches/api';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useWardOptions } from '@/features/locations/hooks/use-wards';
import { ToggleRow } from '@/features/rental-policies/components/PolicySections';
import { discountedPriceVnd } from '@/features/vehicles/pricing';
import { MarketPriceHint } from '@/features/vehicles/components/MarketPriceHint';
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
  branchProvince,
  selectedBranch,
  onRetryBranches,
  pendingAddress,
  onEditPendingAddress,
  onApplyPrice,
}: {
  control: Control<QuickVehicleValues>;
  branchOptions: readonly { value: string; label: string }[];
  branchLoading: boolean;
  branchError: boolean;
  /**
   * Tỉnh của CHI NHÁNH đang chọn — chiều so sánh sát nhất của gợi ý giá.
   *
   * Nơi gọi tra sẵn thay vì truyền cả danh sách chi nhánh xuống: bước này chỉ cần một tỉnh, và
   * đưa cả mảng vào nghĩa là nó phải biết hình dạng DTO chi nhánh chỉ để đọc đúng hai trường.
   */
  branchProvince?: { code: string | null; name: string | null } | undefined;
  /** Chi nhánh đang chọn — nơi gọi đã tra sẵn cho khối gợi ý giá, không tra lần hai. */
  selectedBranch: Branch | null;
  onRetryBranches: () => void;
  /**
   * Địa chỉ đã khai ở bước "Hồ sơ chủ xe" nhưng CHƯA gửi lên server — người đang đăng ký chiếc
   * xe đầu tiên. Có giá trị ⇒ chưa có chi nhánh nào để đọc, và đây là nguồn địa chỉ duy nhất.
   */
  pendingAddress?: OwnerProfileValues | null;
  /** Bấm "Sửa địa chỉ" khi địa chỉ còn nằm ở hồ sơ chưa gửi — wizard quay lại bước hồ sơ. */
  onEditPendingAddress?: () => void;
  /** Bấm "dùng giá này" → điền vào ô giá. Nơi gọi giữ ; bước này chỉ có . */
  onApplyPrice: (price: number) => void;
}) {
  const t = useTranslations('ListYourVehicle.rental');
  const fmt = useAppFormat();

  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const vehicleType = useWatch({ control, name: 'vehicleType' });
  const motorbikeCategory = useWatch({ control, name: 'motorbikeCategory' });
  const seatCount = useWatch({ control, name: 'seatCount' });
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
          {/*
            Gợi ý giá đặt SAU ô nhập, không phải chữ mờ trong ô: chữ mờ biến mất ngay khi gõ ký tự
            đầu tiên — đúng lúc người dùng cần đối chiếu nhất.
          */}
          <MarketPriceHint
            vehicleType={vehicleType}
            motorbikeCategory={motorbikeCategory}
            seatCount={seatCount}
            provinceCode={branchProvince?.code ?? null}
            provinceName={branchProvince?.name ?? null}
            onApply={onApplyPrice}
          />
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

      <VehicleAddressBlock
        control={control}
        options={branchOptions}
        loading={branchLoading}
        error={branchError}
        onRetry={onRetryBranches}
        selected={selectedBranch}
        pendingAddress={pendingAddress ?? null}
        {...(onEditPendingAddress ? { onEditPendingAddress } : {})}
      />

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

/**
 * "Địa chỉ xe" — địa chỉ khách tới nhận xe, tức là CHI NHÁNH đang giữ xe (`Vehicle.branchId`).
 *
 * Hai hình dạng, quyết định bằng SỐ chi nhánh đang hoạt động chứ không bằng tuyến:
 *
 *  - **Một chi nhánh** (chủ xe cá nhân tuyến hoa hồng, và cả gian hàng một cơ sở): không có gì
 *    để chọn, nên không hiện bộ chọn. Địa chỉ hiện ra như một dòng chữ kèm nút sửa — đúng thứ
 *    người dùng cần ở đây, thay vì một ô chọn chỉ có một dòng.
 *  - **Nhiều chi nhánh**: bộ chọn, và địa chỉ của chi nhánh đang chọn hiện ngay bên dưới để
 *    người dùng thấy mình vừa chọn CHỖ NÀO, không chỉ một cái tên.
 *
 * Nút sửa mở `BranchFormSheet` dùng chung (`PATCH /branches/:id`) — form địa chỉ duy nhất của sản
 * phẩm, đã có danh mục hành chính, gợi ý địa điểm và ghim toạ độ. Một ô địa chỉ riêng cho wizard
 * sẽ trôi khỏi nó ngay lần danh mục đổi tiếp theo, và toạ độ ghim là thứ mọi phép tính phí giao
 * xe tận nơi đọc.
 *
 * Sửa được hay không đọc từ quyền `branches.manage`: nhân viên được cử đi đăng xe không phải người
 * quyết định địa chỉ của gian hàng.
 *
 * KHÔNG có lối sang "quản lý chi nhánh" (web có ở cổng gian hàng, app cố ý bỏ): wizard này là
 * cửa của TUYẾN HOA HỒNG, và ném người đang khai dở một chiếc xe sang khu quản lý là bỏ luôn form
 * họ đang điền — đúng khu mà cả luồng này sinh ra để tránh.
 */
function VehicleAddressBlock({
  control,
  options,
  loading,
  error,
  onRetry,
  selected,
  pendingAddress,
  onEditPendingAddress,
}: {
  control: Control<QuickVehicleValues>;
  options: readonly { value: string; label: string }[];
  loading: boolean;
  error: boolean;
  onRetry: () => void;
  selected: Branch | null;
  pendingAddress: OwnerProfileValues | null;
  onEditPendingAddress?: () => void;
}) {
  const t = useTranslations('ListYourVehicle.rental');
  const tActions = useTranslations('Common.actions');
  const { has } = usePermissions();
  const [editing, setEditing] = useState(false);
  /*
   * Lỗi của `branchId` phải có CHỖ ĐỂ HIỆN kể cả khi không vẽ bộ chọn. Bấm "Tiếp tục" trong lúc
   * danh sách chi nhánh còn đang tải thì `branchId` vẫn rỗng: không có dòng này, bước 2 đứng im
   * mà không nói vì sao.
   */
  const branchField = useController({ control, name: 'branchId' });
  const branchError = branchField.fieldState.error?.message;

  const multiple = options.length > 1;
  const canEdit = has(PERMISSION.BRANCH_MANAGE);

  /*
   * GIAN HÀNG CHƯA TỒN TẠI: địa chỉ duy nhất đang có là thứ người dùng vừa khai ở bước hồ sơ.
   */
  if (pendingAddress) {
    return (
      <PendingAddressBlock
        address={pendingAddress}
        {...(onEditPendingAddress ? { onEdit: onEditPendingAddress } : {})}
      />
    );
  }

  return (
    <Card>
      <YStack gap={space.md}>
        <BlockTitle>{t('addressTitle')}</BlockTitle>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {multiple ? t('addressHintMulti') : t('addressHint')}
        </Text>

        {loading ? <SkeletonText lines={2} /> : null}

        {/* Lỗi tải: nói ra và cho bấm lại NGAY TẠI CHỖ — bắt mở lại wizard là mất hết dữ liệu đã nhập. */}
        {error ? (
          <Callout tone="warning">
            <YStack gap={space.sm}>
              <Text col={colors.textMuted} fos={fontSize.bodySm}>
                {t('addressLoadError')}
              </Text>
              <InlineAction label={tActions('retry')} onPress={onRetry} />
            </YStack>
          </Callout>
        ) : null}

        {/*
          Không có chi nhánh nào đang hoạt động: dữ liệu cũ chưa qua đợt chi nhánh. Xe BẮT BUỘC
          thuộc một chi nhánh nên đây là ngõ cụt thật — nói thẳng thay vì để một ô chọn rỗng.
        */}
        {!loading && !error && options.length === 0 ? (
          <Callout tone="warning">{t('addressMissing')}</Callout>
        ) : null}

        {multiple ? (
          <SelectField
            control={control}
            name="branchId"
            label={t('addressLabel')}
            options={options}
            required
          />
        ) : null}

        {!multiple && branchError ? (
          <Text col={colors.danger} fos={fontSize.label}>
            {branchError}
          </Text>
        ) : null}

        {selected ? (
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.bodySm}>
              {selected.address ?? selected.provinceName ?? ''}
            </Text>
            {canEdit ? (
              <InlineAction label={t('addressEdit')} onPress={() => setEditing(true)} />
            ) : null}
          </YStack>
        ) : null}
      </YStack>

      {/*
        Chỉ gắn khi MỞ: form chi nhánh dựng `defaultValues` đúng một lần lúc mount, nên một bản
        luôn nằm sẵn trong cây sẽ mở lại bằng địa chỉ CŨ ngay sau lần lưu đầu tiên.
      */}
      {selected && canEdit && editing ? (
        <BranchFormSheet
          open
          branch={selected}
          onClose={() => setEditing(false)}
          notice={
            selected.vehicleCount > 0 ? (
              <Callout tone="warning" title={t('addressSharedTitle', { count: selected.vehicleCount })}>
                {t('addressSharedBody')}
              </Callout>
            ) : null
          }
        />
      ) : null}
    </Card>
  );
}

/**
 * Địa chỉ xe của người CHƯA có gian hàng — nguồn là hồ sơ họ vừa khai ở bước 1, còn nằm trong bộ
 * nhớ của wizard.
 *
 * Không có bộ chọn: họ có đúng một địa chỉ, và nó sẽ thành chi nhánh mặc định ngay khi chiếc xe
 * được lưu. Nút sửa đưa họ về chính bước hồ sơ — chứ không mở một ô địa chỉ thứ hai ở đây, thứ sẽ
 * phải tự đồng bộ ngược lại với hồ sơ và sẽ lệch ngay lần sửa đầu tiên.
 *
 * Chuỗi hiển thị ghép bằng `formatAddress` của `@xeprime/domain` — CÙNG hàm mà backend dùng để sinh
 * `branch.address`, nên dòng chữ ở đây và dòng chữ sau khi lưu là một. Tên tỉnh/xã tra từ danh mục
 * đã nạp sẵn ở bước hồ sơ (cùng `queryKey`), nên khối này không phát thêm request nào. Chưa tra ra
 * tên thì hiện phần người dùng tự gõ — thà thiếu một vế còn hơn một dòng trống ở chỗ nói "xe của
 * bạn nằm ở đâu".
 */
function PendingAddressBlock({
  address,
  onEdit,
}: {
  address: OwnerProfileValues;
  onEdit?: () => void;
}) {
  const t = useTranslations('ListYourVehicle.rental');
  const provinces = useProvinceOptions();
  const wards = useWardOptions(address.provinceCode);

  const provinceName =
    provinces.options.find((o) => o.value === address.provinceCode)?.label ?? null;
  const wardName = wards.items.find((w) => w.code === address.wardCode)?.name ?? null;
  const line =
    formatAddress({
      addressLine: address.addressLine || null,
      wardName,
      provinceName,
    }) ??
    address.addressLine ??
    '';

  return (
    <Card>
      <YStack gap={space.md}>
        <BlockTitle>{t('addressTitle')}</BlockTitle>
        <Text col={colors.textMuted} fos={fontSize.bodySm}>
          {t('addressHint')}
        </Text>
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.bodySm}>
            {line}
          </Text>
          {onEdit ? <InlineAction label={t('addressEdit')} onPress={onEdit} /> : null}
        </YStack>
        <Text col={colors.textMuted} fos={fontSize.label}>
          {t('addressPendingNote')}
        </Text>
      </YStack>
    </Card>
  );
}
