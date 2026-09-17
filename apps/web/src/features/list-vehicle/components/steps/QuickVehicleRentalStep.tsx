'use client';

import { Alert, Button, Slider } from 'antd';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState } from 'react';
import {
  Controller,
  useFormState,
  useWatch,
  type Control,
  type UseFormSetValue,
} from 'react-hook-form';
import { formatAddress } from '@xeprime/domain';
import { MILEAGE_LIMIT, PERMISSION } from '@xeprime/types';
import type { OwnerProfileValues } from '@xeprime/validators';

import { NumberField } from '@/components/form/NumberField';
import { SelectField } from '@/components/form/SelectField';
import { SwitchField } from '@/components/form/SwitchField';
import { TextAreaField } from '@/components/form/TextAreaField';
import { LoadingState } from '@/components/feedback/LoadingState';
import { usePermissions } from '@/hooks/use-permissions';
import { useWorkspace } from '@/hooks/use-workspace';
import { branchLabel } from '@/features/branches/branch-label';
import { BranchFormDialog } from '@/features/branches/components/BranchFormDialog';
import type { Branch } from '@/features/branches/types';
import type { useActiveBranches } from '@/features/branches/hooks/use-branches';
import { useProvinceOptions } from '@/features/locations/hooks/use-provinces';
import { useWardOptions } from '@/features/locations/hooks/use-wards';
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
  /**
   * Địa chỉ đã khai ở bước "Hồ sơ chủ xe" nhưng CHƯA gửi lên server — người đang đăng ký chiếc
   * xe đầu tiên. Có giá trị ⇒ chưa có chi nhánh nào để đọc, và đây là nguồn địa chỉ duy nhất.
   */
  pendingAddress?: OwnerProfileValues | null;
  /** Bấm "Sửa địa chỉ" khi địa chỉ còn nằm ở hồ sơ chưa gửi — wizard quay lại bước hồ sơ. */
  onEditPendingAddress?: () => void;
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
export function QuickVehicleRentalStep({
  control,
  setValue,
  vehicleType,
  branches,
  pendingAddress,
  onEditPendingAddress,
}: Props) {
  const t = useTranslations('ListYourVehicle.rental');
  const fmt = useAppFormat();

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
          provinceCode={branch?.provinceCode ?? pendingAddress?.provinceCode ?? null}
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

      <VehicleAddressBlock
        control={control}
        branches={branches}
        selected={branch}
        pendingAddress={pendingAddress ?? null}
        onEditPendingAddress={onEditPendingAddress}
      />

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

/**
 * "Địa chỉ xe" — địa chỉ khách tới nhận xe, tức là CHI NHÁNH đang giữ xe (`Vehicle.branchId`).
 *
 * Hai hình dạng, quyết định bằng SỐ chi nhánh đang hoạt động chứ không bằng tuyến:
 *
 *  - **Một chi nhánh** (chủ xe cá nhân tuyến hoa hồng, và cả gian hàng một cơ sở): không có gì
 *    để chọn, nên không hiện bộ chọn. Địa chỉ hiện ra như một dòng chữ kèm nút sửa — đúng thứ
 *    người dùng cần ở đây, thay vì một ô select chỉ có một dòng.
 *  - **Nhiều chi nhánh**: bộ chọn, và địa chỉ của chi nhánh đang chọn hiện ngay bên dưới để
 *    người dùng thấy mình vừa chọn CHỖ NÀO, không chỉ một cái tên.
 *
 * Nút sửa mở `BranchFormDialog` dùng chung (`PATCH /branches/:id`) — hộp thoại địa chỉ duy nhất
 * của sản phẩm, đã có danh mục hành chính hai cấp, gợi ý địa điểm và ghim toạ độ. Một ô địa chỉ
 * riêng cho wizard sẽ trôi khỏi nó ngay lần danh mục đổi tiếp theo, và toạ độ ghim là thứ mọi
 * phép tính phí giao xe tận nơi đọc.
 *
 * Sửa được hay không đọc từ quyền `branches.manage`: nhân viên được cử đi đăng xe không phải
 * người quyết định địa chỉ của gian hàng.
 */
function VehicleAddressBlock({
  control,
  branches,
  selected,
  pendingAddress,
  onEditPendingAddress,
}: {
  control: Control<QuickVehicleValues>;
  branches: ReturnType<typeof useActiveBranches>;
  /** Chi nhánh đang chọn — parent đã tra sẵn cho khối gợi ý giá, không tra lần hai. */
  selected: Branch | null;
  pendingAddress: OwnerProfileValues | null;
  onEditPendingAddress?: () => void;
}) {
  const t = useTranslations('ListYourVehicle.rental');
  const tBranches = useTranslations('Branches');
  const tCommon = useTranslations('Common.actions');
  const { paths, isManage } = useWorkspace();
  const { has } = usePermissions();
  const [editing, setEditing] = useState(false);
  /*
   * Lỗi của `branchId` phải có CHỖ ĐỂ HIỆN kể cả khi không vẽ bộ chọn. Bấm "Tiếp tục" trong lúc
   * danh sách chi nhánh còn đang tải thì `branchId` vẫn rỗng: không có dòng này, bước 2 đứng im
   * mà không nói vì sao.
   */
  const { errors } = useFormState({ control, name: 'branchId' });

  const items = branches.data?.items ?? [];
  const multiple = items.length > 1;
  const canEdit = has(PERMISSION.BRANCH_MANAGE);

  const noProvince = tBranches('labels.noProvince');
  const options = items.map((b) => ({ value: b.id, label: branchLabel(b, noProvince) }));

  /*
   * GIAN HÀNG CHƯA TỒN TẠI: địa chỉ duy nhất đang có là thứ người dùng vừa khai ở bước hồ sơ.
   *
   * Chuỗi hiển thị ghép bằng `formatAddress` của `@xeprime/domain` — CÙNG hàm mà backend dùng
   * để sinh `branch.address`, nên dòng chữ ở đây và dòng chữ sau khi lưu là một.
   */
  if (pendingAddress) {
    return (
      <PendingAddressBlock address={pendingAddress} onEdit={onEditPendingAddress} />
    );
  }

  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>{t('addressTitle')}</h3>
      <p className={styles.blockHint}>{multiple ? t('addressHintMulti') : t('addressHint')}</p>

      {branches.isLoading ? <LoadingState variant="inline" /> : null}

      {/* Lỗi tải: nói ra và cho bấm lại ngay tại chỗ — bắt F5 cả wizard là mất hết dữ liệu đã nhập. */}
      {branches.isError ? (
        <Alert
          type="warning"
          showIcon
          title={t('addressLoadError')}
          action={
            <Button size="small" onClick={() => void branches.refetch()}>
              {tCommon('retry')}
            </Button>
          }
        />
      ) : null}

      {/*
        Không có chi nhánh nào đang hoạt động: dữ liệu cũ chưa qua đợt chi nhánh. Xe BẮT BUỘC
        thuộc một chi nhánh nên đây là ngõ cụt thật — nói thẳng thay vì để một ô select rỗng.
      */}
      {!branches.isLoading && !branches.isError && items.length === 0 ? (
        <Alert type="warning" showIcon title={t('addressMissing')} />
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

      {!multiple && errors.branchId ? (
        <p className={styles.addressError} role="alert">
          {errors.branchId.message}
        </p>
      ) : null}

      {selected ? (
        <div className={styles.addressRow}>
          <p className={styles.address}>{selected.address ?? selected.provinceName ?? ''}</p>
          {canEdit ? (
            <Button type="link" className={styles.addressEdit} onClick={() => setEditing(true)}>
              {t('addressEdit')}
            </Button>
          ) : null}
        </div>
      ) : null}

      {/*
        Chỉ gắn khi MỞ: `BranchFormDialog` dựng `defaultValues` đúng một lần lúc mount, nên một
        bản luôn nằm sẵn trong cây sẽ mở lại bằng địa chỉ CŨ ngay sau lần lưu đầu tiên.
      */}
      {selected && canEdit && editing ? (
        <BranchFormDialog
          open
          branch={selected}
          onClose={() => setEditing(false)}
          notice={
            selected.vehicleCount > 0 ? (
              <Alert
                type="warning"
                showIcon
                title={t('addressSharedTitle', { count: selected.vehicleCount })}
                description={t('addressSharedBody')}
              />
            ) : null
          }
        />
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
  );
}

/**
 * Địa chỉ xe của người CHƯA có gian hàng — nguồn là hồ sơ họ vừa khai ở bước 1, còn nằm trong
 * bộ nhớ của wizard.
 *
 * Không có bộ chọn: họ có đúng một địa chỉ, và nó sẽ thành chi nhánh mặc định ngay khi chiếc xe
 * được lưu. Nút sửa đưa họ về chính bước hồ sơ — chứ không mở một ô địa chỉ thứ hai ở đây, thứ
 * sẽ phải tự đồng bộ ngược lại với hồ sơ và sẽ lệch ngay lần sửa đầu tiên.
 *
 * Tên tỉnh/xã tra từ danh mục đã nạp sẵn ở bước hồ sơ (cùng `queryKey`, `staleTime` 30 phút),
 * nên khối này không phát thêm request nào. Chưa tra ra tên thì hiện phần người dùng tự gõ —
 * thà thiếu một vế còn hơn một dòng trống ở chỗ nói "xe của bạn nằm ở đâu".
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
  const wardName = wards.options.find((o) => o.value === address.wardCode)?.label ?? null;
  const line =
    formatAddress({
      addressLine: address.addressLine || null,
      wardName,
      provinceName,
    }) ??
    address.addressLine ??
    '';

  return (
    <section className={styles.block}>
      <h3 className={styles.blockTitle}>{t('addressTitle')}</h3>
      <p className={styles.blockHint}>{t('addressHint')}</p>
      <div className={styles.addressRow}>
        <p className={styles.address}>{line}</p>
        {onEdit ? (
          <Button type="link" className={styles.addressEdit} onClick={onEdit}>
            {t('addressEdit')}
          </Button>
        ) : null}
      </div>
      <p className={styles.blockHint}>{t('addressPendingNote')}</p>
    </section>
  );
}
