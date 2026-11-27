'use client';

import { App } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useRef, useState } from 'react';
import { useForm, type Path } from 'react-hook-form';
import {
  POLICY_SECTION_VALUES,
  POLICY_SOURCE,
  SERVICE_TYPE,
  type PolicySection,
} from '@xeprime/types';

import { useValidationResolver } from '@/i18n/use-validation-resolver';

import { POLICY_SECTION_FORM_FIELDS, formToSaveInput, policyToForm } from '../form';
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
  /*
   * Kế thừa gian hàng THEO MỤC (ADR 0112 điều 1). `savedInherited` là bản server đang lưu; `inherited`
   * là bản người dùng đang bật/tắt - chỉ commit khi bấm Lưu. Không có dòng riêng ⇒ cả năm mục kế thừa.
   */
  const savedKey = (pricing.inheritedSections ?? POLICY_SECTION_VALUES).join(',');
  const savedInherited: readonly PolicySection[] = savedKey
    ? (savedKey.split(',') as PolicySection[])
    : [];
  const [inherited, setInherited] = useState<readonly PolicySection[]>(savedInherited);
  // Lưu xong (hoặc dữ liệu đổi từ nơi khác) ⇒ về đúng bản server. Chỉnh ngay trong lúc render khi
  // bản server đổi (mẫu "điều chỉnh state khi prop đổi" của React), không qua effect.
  const [syncedKey, setSyncedKey] = useState(savedKey);
  if (syncedKey !== savedKey) {
    setSyncedKey(savedKey);
    setInherited(savedInherited);
  }
  const inheritedRef = useRef(inherited);
  useEffect(() => {
    inheritedRef.current = inherited;
  }, [inherited]);
  const [submitting, setSubmitting] = useState(false);
  const showPolicy = policyMode === 'full';
  const direct = policySource === 'direct';
  /** Còn ít nhất một mục riêng của xe ⇒ lưu là ghi dòng chính sách theo xe. */
  const editMode = inherited.length < POLICY_SECTION_VALUES.length;
  const inheritedChanged = [...inherited].sort().join(',') !== [...savedInherited].sort().join(',');
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
        return showPolicy && (direct ? policyDirtyRef.current : true);
      },
      // Mục đang theo gian hàng không có ô nào để sửa ⇒ không được chặn nút Lưu.
      get inheritedSections() {
        return direct ? [] : inheritedRef.current;
      },
    },
    /*
     * Ô của form = bộ RIÊNG của xe (giữ cả cột của mục đang kế thừa - tắt kế thừa là thấy lại cấu hình
     * cũ); chưa có dòng riêng thì bắt đầu từ chính sách gian hàng. Mục đang kế thừa hiện số của gian
     * hàng qua `shopForm`.
     */
    values: {
      ...policyToForm(pricing.ownPolicy ?? pricing.policy ?? pricing.shopPolicy),
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
  /** Bản CHỈ ĐỌC của chính sách gian hàng - các mục đang kế thừa vẽ từ đây (ô khoá). */
  const shopForm = useForm<VehiclePricingFormValues>({
    values: {
      ...policyToForm(pricing.shopPolicy),
      weekdayPrice: null,
      weekendPrice: null,
      hourlyPrice: null,
      discountPercent: null,
      monthlyPrice: null,
      withDriverDailyPrice: null,
      withDriverInterCityPrice: null,
      withDriverOneWayPrice: null,
    },
  });

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

  /** Đưa các ô của MỘT mục về giá trị đã lưu, hoặc về số của gian hàng. */
  function fillSection(section: PolicySection, from: 'saved' | 'shop') {
    for (const field of POLICY_SECTION_FORM_FIELDS[section]) {
      const name = field as Path<VehiclePricingFormValues>;
      if (from === 'saved') form.resetField(name);
      else form.setValue(name, shopForm.getValues(name), { shouldDirty: true });
    }
  }

  /**
   * Bật/tắt "Áp dụng chính sách của gian hàng" của MỘT mục. Bật lại một mục đang RIÊNG (đã lưu) thì
   * hỏi trước: tuỳ chỉnh của mục đó thôi áp dụng sau khi lưu. Tắt (tuỳ chỉnh riêng) mà xe chưa có
   * dòng riêng thì bắt đầu từ chính số của gian hàng, không nhảy về trống.
   */
  function setSectionInherited(section: PolicySection, next: boolean, sectionLabel: string) {
    if (!next) {
      if (!pricing.ownPolicy) fillSection(section, 'shop');
      setInherited((current) => current.filter((item) => item !== section));
      return;
    }
    const add = () => {
      fillSection(section, 'saved');
      setInherited((current) => (current.includes(section) ? current : [...current, section]));
    };
    if (savedInherited.includes(section)) {
      add();
      return;
    }
    modal.confirm({
      title: t('source.sectionResetTitle'),
      content: t('source.sectionResetBody', { section: sectionLabel }),
      okText: t('source.resetOk'),
      okButtonProps: { danger: true },
      cancelText: t('source.resetCancel'),
      onOk: add,
    });
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
    /*
     * `switch`: còn mục riêng ⇒ ghi dòng theo xe kèm danh sách mục kế thừa; đủ năm mục kế thừa ⇒
     * `shop` (server xoá dòng riêng). `direct`: chỉ ghi khi một ô chính sách THẬT SỰ đổi, riêng toàn
     * bộ. Chế độ chỉ-giá giữ nguyên nguồn và các mục đang có.
     */
    const sendPolicy = showPolicy ? (direct ? overriding || policyDirty : editMode) : overriding;
    const sections: PolicySection[] =
      direct && !overriding ? [] : [...(showPolicy && !direct ? inherited : savedInherited)];
    return {
      source: sendPolicy ? POLICY_SOURCE.VEHICLE : POLICY_SOURCE.SHOP,
      ...(sendPolicy ? { inheritedSections: sections } : {}),
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
     * Có gì để lưu không: ô đã đổi, HOẶC vừa bật/tắt "Áp dụng chính sách của gian hàng" của một mục
     * mà chưa lưu.
     */
    dirty: formState.isDirty || (showPolicy && !direct && inheritedChanged),
    /** Hoàn tác: về giá trị đã lưu và về lại các mục kế thừa đang lưu. */
    discard: () => {
      setInherited(savedInherited);
      reset();
    },
    direct,
    showPolicy,
    submitting,
    /** Form CHỈ ĐỌC của chính sách gian hàng - mục kế thừa vẽ từ đây. */
    shopForm,
    /** Mục đang theo gian hàng (chế độ `direct` luôn sửa thẳng - không có khái niệm này). */
    isInherited: (section: PolicySection) => !direct && inherited.includes(section),
    setSectionInherited,
    submit,
  };
}

export type VehiclePricingFormApi = ReturnType<typeof useVehiclePricingForm>;
