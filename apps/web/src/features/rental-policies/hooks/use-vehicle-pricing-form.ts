'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm } from 'react-hook-form';
import { POLICY_SOURCE, SERVICE_TYPE } from '@xeprime/types';

import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { formToSaveInput, policyToForm } from '../form';
import { vehiclePricingFormSchema, type VehiclePricingFormValues } from '../schema';
import type { SaveVehiclePricingInput, VehiclePricing } from '../types';

/** Ô GIÁ của form — mọi ô còn lại thuộc khối chính sách. */
const PRICE_FIELDS = new Set<string>([
  'weekdayPrice',
  'weekendPrice',
  'hourlyPrice',
  'discountPercent',
  'monthlyPrice',
  'withDriverDailyPrice',
  'withDriverInterCityPrice',
  'withDriverOneWayPrice',
]);

const toNumber = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

export interface VehiclePricingFormOptions {
  vehicleName: string;
  pricing: VehiclePricing;
  /**
   * `full` — khối chính sách (cọc, giao xe, km, quá giờ, ưu đãi) có mặt trên màn và được sửa.
   * `hidden` — chỉ giá; nguồn chính sách giữ nguyên như đang có.
   */
  policyMode?: 'full' | 'hidden';
  /**
   * `switch` (cổng quản lý) — công tắc "Áp dụng chính sách của gian hàng" quyết định có ghi bộ chính
   * sách riêng hay không. `direct` (chủ xe tuyến hoa hồng) — không có công tắc: chỉ khi một ô chính
   * sách THẬT SỰ đổi mới ghi bộ chính sách riêng.
   */
  policySource?: 'switch' | 'direct';
  /** Ghi `PUT /vehicles/:id/pricing` — ném lỗi khi server từ chối (nơi gọi đã báo lỗi). */
  save: (body: SaveVehiclePricingInput) => Promise<void>;
  /**
   * Validate trượt — nhận tên các ô lỗi. Màn bày form thành nhiều tab dùng nó để mở đúng tab đang
   * chứa ô lỗi, thay vì để nút Lưu "không làm gì" vì một ô nằm khuất.
   */
  onInvalid?: (fields: string[]) => void;
}

/**
 * Form "Giá & chính sách" của MỘT xe — logic dùng chung cho mọi nơi bày nó.
 *
 * Màn sửa xe (design `23731:37932`) bày form này thành nhiều mảnh: giá + cọc/km/quá giờ ở tab Tự lái,
 * giá có tài xế ở tab Có tài xế, giá tháng + ưu đãi dài hạn ở tab Dài hạn, giao xe ở mục Giao nhận.
 * Mảnh nào cũng đọc/ghi CÙNG bộ giá trị và lưu bằng CÙNG một lệnh `PUT` trọn gói như trước: ô không
 * hiện trên màn vẫn giữ giá trị đã nạp và được gửi lại nguyên vẹn.
 *
 * Luật nguồn chính sách (20/08): `source` chỉ nói về CHÍNH SÁCH. Đặt giá không kéo theo ghi đè chính
 * sách — gửi `vehicle` khi không sửa chính sách sẽ đóng băng một bản sao người dùng không hề yêu cầu.
 */
export function useVehiclePricingForm({
  vehicleName,
  pricing,
  policyMode = 'full',
  policySource = 'switch',
  save,
  onInvalid,
}: VehiclePricingFormOptions) {
  const t = useTranslations('Vehicles.pricing');
  const { modal } = App.useApp();

  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  // Bật form ghi đè trước khi lưu lần đầu — state cục bộ, chỉ commit khi bấm Lưu.
  const [editingOverride, setEditingOverride] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const editMode = overriding || editingOverride;
  const showPolicy = policyMode === 'full';
  const direct = policySource === 'direct';
  /*
   * Chế độ `direct`: khối chính sách có ô bị đổi hay chưa — đọc ở lúc VALIDATE (qua getter của
   * `context`) và lúc lưu. Ref vì context được RHF đọc ngoài render; đồng bộ trong effect.
   */
  const policyDirtyRef = useRef(false);

  const services = pricing.serviceTypes ?? [];
  const hasSelfDrive = services.includes(SERVICE_TYPE.SELF_DRIVE);
  const hasLongTerm = services.includes(SERVICE_TYPE.LONG_TERM);
  const hasWithDriver = services.includes(SERVICE_TYPE.WITH_DRIVER);

  const resolver = useValidationResolver<VehiclePricingFormValues>(
    vehiclePricingFormSchema,
    'Vehicles.pricing.validation',
  );
  const form = useForm<VehiclePricingFormValues>({
    resolver,
    /*
     * Giá ngày thường chỉ bắt buộc khi xe đăng tự lái (schema đọc `$serviceTypes` từ context).
     *
     * `policyEditable` tắt mọi ràng buộc của khối CHÍNH SÁCH khi xe đang kế thừa: các ô đó không
     * hiện ra để sửa, nên chúng không được phép chặn nút Lưu. Không có cờ này thì một gian hàng
     * CHƯA cấu hình chính sách sẽ không bao giờ đặt nổi giá cho xe.
     */
    context: {
      serviceTypes: services,
      get policyEditable() {
        return showPolicy && (editMode || (direct && policyDirtyRef.current));
      },
    },
    values: {
      ...policyToForm(pricing.policy ?? pricing.shopPolicy),
      weekdayPrice: toNumber(pricing.weekdayPrice),
      weekendPrice: toNumber(pricing.weekendPrice),
      hourlyPrice: toNumber(pricing.hourlyPrice),
      discountPercent: pricing.discountPercent ?? null,
      monthlyPrice: toNumber(pricing.monthlyPrice),
      withDriverDailyPrice: toNumber(pricing.withDriverDailyPrice),
      withDriverInterCityPrice: toNumber(pricing.withDriverInterCityPrice),
      withDriverOneWayPrice: toNumber(pricing.withDriverOneWayPrice),
    },
  });
  const { handleSubmit, formState, reset } = form;

  const policyDirty = Object.keys(formState.dirtyFields).some((field) => !PRICE_FIELDS.has(field));
  useEffect(() => {
    policyDirtyRef.current = policyDirty;
  }, [policyDirty]);

  async function persist(body: SaveVehiclePricingInput): Promise<boolean> {
    setSubmitting(true);
    try {
      await save(body);
      return true;
    } catch {
      return false;
    } finally {
      setSubmitting(false);
    }
  }

  /** "Đặt lại theo gian hàng" — XOÁ bản ghi đè (có xác nhận: tuỳ chỉnh sẽ mất). */
  function confirmReset() {
    modal.confirm({
      title: t('source.resetTitle'),
      content: t('source.resetBody'),
      okText: t('source.resetOk'),
      okButtonProps: { danger: true },
      cancelText: t('source.resetCancel'),
      onOk: async () => {
        setEditingOverride(false);
        await persist({ source: POLICY_SOURCE.SHOP });
      },
    });
  }

  /** Bật/tắt "Áp dụng chính sách của gian hàng" (chế độ `switch`). */
  function setUseShopPolicy(useShop: boolean) {
    if (!useShop) {
      setEditingOverride(true);
      return;
    }
    if (overriding) {
      confirmReset();
    } else {
      setEditingOverride(false);
      reset();
    }
  }

  function buildBody(values: VehiclePricingFormValues): SaveVehiclePricingInput {
    // null tường minh = XOÁ giá đó (server nhận null-clear); chỉ gửi nhóm giá của dịch vụ xe đang
    // đăng — giá dịch vụ khác server từ chối đặt (validation chéo).
    const money = (v: number | null | undefined): string | null =>
      v != null ? String(Math.round(v)) : null;
    /*
     * Ở chế độ chỉ-giá (`policyMode="hidden"`) nguồn hiện có được giữ nguyên: đang ghi đè thì gửi lại
     * đúng bộ chính sách đang có (form đã nạp nó), đang kế thừa thì không đụng. Chế độ `direct` chỉ
     * ghi bộ chính sách riêng khi một ô chính sách THẬT SỰ đổi.
     */
    const sendPolicy = overriding || (showPolicy && (direct ? policyDirty : editMode));
    return {
      source: sendPolicy ? POLICY_SOURCE.VEHICLE : POLICY_SOURCE.SHOP,
      ...(hasSelfDrive || values.weekdayPrice != null
        ? { weekdayPrice: money(values.weekdayPrice) ?? '0' }
        : {}),
      weekendPrice: money(values.weekendPrice),
      hourlyPrice: money(values.hourlyPrice),
      ...(hasSelfDrive
        ? {
            discountPercent:
              values.discountPercent != null && values.discountPercent > 0
                ? Math.round(values.discountPercent)
                : null,
          }
        : {}),
      ...(hasLongTerm ? { monthlyPrice: money(values.monthlyPrice) } : {}),
      ...(hasWithDriver
        ? {
            withDriverDailyPrice: money(values.withDriverDailyPrice),
            withDriverInterCityPrice: money(values.withDriverInterCityPrice),
            withDriverOneWayPrice: money(values.withDriverOneWayPrice),
          }
        : {}),
      ...(sendPolicy ? { policy: formToSaveInput(values) } : {}),
    };
  }

  /**
   * Validate → hộp xác nhận nói đúng thứ sắp được lưu → ghi. `true` khi đã lưu; `false` khi form
   * còn lỗi, người dùng huỷ hộp xác nhận hoặc server từ chối.
   *
   * Đổi giá của xe ĐANG công khai có hiệu lực NGAY ngoài chợ (09/09/2026 — không còn hạ xe về chờ
   * duyệt lại), nên hộp xác nhận không còn cảnh báo về chuyện đó.
   */
  function submit(): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      void handleSubmit(
        (values) => {
          const body = buildBody(values);
          const withPolicy = body.source === POLICY_SOURCE.VEHICLE && showPolicy;
          modal.confirm({
            // Chế độ `direct` không nói về "chính sách gian hàng" — chủ xe không có trang đó.
            title: direct
              ? t('confirm.ownerTitle')
              : withPolicy
                ? t('confirm.overrideTitle')
                : t('confirm.inheritTitle'),
            content: direct
              ? t('confirm.ownerBody', { vehicle: vehicleName })
              : withPolicy
                ? t('confirm.overrideBody', { vehicle: vehicleName })
                : t('confirm.inheritBody', { vehicle: vehicleName }),
            okText: t('confirm.ok'),
            cancelText: t('confirm.cancel'),
            onOk: async () => resolve(await persist(body)),
            onCancel: () => resolve(false),
          });
        },
        (errors) => {
          onInvalid?.(Object.keys(errors));
          resolve(false);
        },
      )();
    });
  }

  return {
    form,
    overriding,
    editMode,
    /**
     * Có gì để lưu không: ô đã đổi, HOẶC vừa tắt "Áp dụng chính sách của gian hàng" mà chưa lưu —
     * lần lưu đó ghi bộ chính sách riêng dù chưa ô nào đổi.
     */
    dirty: formState.isDirty || (editingOverride && !overriding),
    /** Hoàn tác: về giá trị đã lưu và về lại nguồn chính sách đang có. */
    discard: () => {
      setEditingOverride(false);
      reset();
    },
    direct,
    showPolicy,
    submitting,
    setEditingOverride,
    setUseShopPolicy,
    confirmReset,
    submit,
  };
}

export type VehiclePricingFormApi = ReturnType<typeof useVehiclePricingForm>;
