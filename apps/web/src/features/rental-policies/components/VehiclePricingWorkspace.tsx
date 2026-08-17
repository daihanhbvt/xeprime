'use client';

import { yupResolver } from '@hookform/resolvers/yup';
import { Alert, App, Button, Switch } from 'antd';
import Link from 'next/link';
import { useState } from 'react';
import { useForm, useWatch, type Control, type UseFormSetValue } from 'react-hook-form';
import { LONG_TERM_MIN_DAYS, POLICY_SOURCE, SERVICE_TYPE } from '@xeprime/types';
import { NumberField } from '@/components/form/NumberField';
import { StickyFormActions } from '@/components/form/StickyFormActions';
import { ROUTES } from '@/constants/routes';
import { formatMoneyVnd } from '@/lib/money';
import { discountedPriceVnd } from '@/features/vehicles/pricing';
import { formToSaveInput, policyToForm } from '../form';
import { vehiclePricingFormSchema, type VehiclePricingFormValues } from '../schema';
import type { RentalPolicyValues, SaveVehiclePricingInput, VehiclePricing } from '../types';
import { LongTermPriceHint } from './LongTermPriceHint';
import { PolicySections } from './PolicySections';

import styles from './VehiclePricingWorkspace.module.css';

interface VehiclePricingWorkspaceProps {
  vehicleName: string;
  vehiclePlate: string | null;
  pricing: VehiclePricing;
  canEdit: boolean;
  submitting: boolean;
  onSave: (body: SaveVehiclePricingInput) => void;
}

const toNumber = (v: string | null | undefined): number | null => (v == null ? null : Number(v));

/**
 * Tab "Giá & chính sách" của một xe (Figma `236:3495`, states `237:1911`, mobile `247:1645/1706`).
 *
 * Hai chế độ theo đúng thiết kế:
 *  - **Kế thừa** (State A): mọi thông số read-only từ chính sách gian hàng; đổi ở trang
 *    Cấu hình gian hàng sẽ tự áp cho xe này.
 *  - **Ghi đè** (State B): sửa giá + toàn bộ chính sách riêng cho xe. "Đặt lại theo gian hàng"
 *    XOÁ bản ghi đè (có xác nhận — tùy chỉnh sẽ mất).
 *
 * Thay đổi nhạy cảm (State D — theo hành vi THẬT của hệ thống, ADR 0008): xe đang công khai mà
 * đổi GIÁ sẽ bị đưa về chờ duyệt lại và tạm ẩn khỏi sàn — hộp xác nhận nói đúng điều đó, không
 * hứa "áp dụng ngay" như bản nháp thiết kế.
 */
export function VehiclePricingWorkspace({
  vehicleName,
  vehiclePlate,
  pricing,
  canEdit,
  submitting,
  onSave,
}: VehiclePricingWorkspaceProps) {
  const { modal } = App.useApp();
  const overriding = pricing.source === POLICY_SOURCE.VEHICLE;
  // Bật form ghi đè trước khi lưu lần đầu — state cục bộ, chỉ commit khi bấm Lưu.
  const [editingOverride, setEditingOverride] = useState(false);
  const editMode = overriding || editingOverride;

  // Nhóm giá hiện theo NĂNG LỰC dịch vụ của xe — không trộn mọi ô giá thành một danh sách.
  const services = pricing.serviceTypes ?? [];
  const hasSelfDrive = services.includes(SERVICE_TYPE.SELF_DRIVE);
  const hasLongTerm = services.includes(SERVICE_TYPE.LONG_TERM);
  const hasWithDriver = services.includes(SERVICE_TYPE.WITH_DRIVER);

  const { control, handleSubmit, reset, setValue, formState } = useForm<VehiclePricingFormValues>({
    resolver: yupResolver(vehiclePricingFormSchema),
    // Giá ngày thường chỉ bắt buộc khi xe đăng tự lái (schema đọc $serviceTypes từ context).
    context: { serviceTypes: services },
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

  function confirmReset() {
    modal.confirm({
      title: 'Đặt lại về mặc định?',
      content:
        'Đặt lại về chính sách gian hàng: toàn bộ tùy chỉnh riêng của xe này sẽ bị xóa và xe quay về kế thừa cấu hình chung.',
      okText: 'Đặt lại',
      okButtonProps: { danger: true },
      cancelText: 'Giữ tùy chỉnh',
      onOk: () => {
        setEditingOverride(false);
        onSave({ source: POLICY_SOURCE.SHOP });
      },
    });
  }

  const submit = handleSubmit((values) => {
    // null tường minh = XOÁ giá đó (server nhận null-clear); chỉ gửi nhóm giá của dịch vụ
    // xe đang đăng — giá dịch vụ khác server từ chối đặt (validation chéo).
    const money = (v: number | null | undefined): string | null =>
      v != null ? String(Math.round(v)) : null;
    const body: SaveVehiclePricingInput = {
      source: POLICY_SOURCE.VEHICLE,
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
      policy: formToSaveInput(values),
    };

    const changed = (next: string | null | undefined, prev: string | null | undefined): boolean =>
      next !== undefined && (next ?? null) !== (prev ?? null);
    const priceChanged =
      changed(body.weekdayPrice, pricing.weekdayPrice) ||
      changed(body.weekendPrice ?? null, pricing.weekendPrice) ||
      changed(body.hourlyPrice, pricing.hourlyPrice) ||
      (body.discountPercent !== undefined &&
        (body.discountPercent ?? null) !== (pricing.discountPercent ?? null)) ||
      changed(body.monthlyPrice, pricing.monthlyPrice) ||
      changed(body.withDriverDailyPrice, pricing.withDriverDailyPrice) ||
      changed(body.withDriverInterCityPrice, pricing.withDriverInterCityPrice) ||
      changed(body.withDriverOneWayPrice, pricing.withDriverOneWayPrice);

    if (pricing.isPublic && priceChanged) {
      // Nói đúng hệ quả thật (ADR 0008): đổi giá xe công khai → chờ duyệt lại + tạm ẩn listing.
      modal.confirm({
        title: 'Xác nhận thay đổi chính sách & giá thuê?',
        content: `${vehicleName}${vehiclePlate ? ` (${vehiclePlate})` : ''} đang hiển thị công khai. Đổi giá sẽ đưa xe về trạng thái chờ duyệt lại và tạm ẩn khỏi sàn cho tới khi được nền tảng duyệt. Các đơn thuê đã chốt trước đó vẫn giữ nguyên mốc giá cũ.`,
        okText: 'Xác nhận thay đổi',
        cancelText: 'Hủy bỏ',
        onOk: () => onSave(body),
      });
      return;
    }

    modal.confirm({
      title: 'Lưu chính sách riêng cho xe này?',
      content: `Thay đổi chỉ áp dụng cho ${vehicleName}, tính từ các lượt đặt mới — không ảnh hưởng các xe khác và các đơn đã chốt.`,
      okText: 'Lưu thay đổi',
      cancelText: 'Hủy bỏ',
      onOk: () => onSave(body),
    });
  });

  return (
    <div className={styles.stack}>
      {/* Nguồn chính sách — Figma `policy-toggle-card`. */}
      <section className={styles.card} aria-label="Cấu hình nguồn chính sách">
        <h2 className={styles.cardTitle}>Cấu hình nguồn chính sách</h2>
        <p className={styles.desc}>
          Chọn áp dụng chính sách chung của gian hàng hoặc tùy chỉnh riêng cho xe này.
        </p>
        <label className={styles.sourceRow}>
          <Switch
            checked={!editMode}
            disabled={!canEdit || submitting}
            onChange={(useShop) => {
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
            }}
          />
          <span className={styles.sourceLabel}>Dùng chính sách chung của gian hàng</span>
          {editMode ? (
            <span className={styles.sourceCustom}>● Tùy chỉnh riêng cho xe này</span>
          ) : null}
        </label>
        {editMode ? (
          <Alert
            type="warning"
            showIcon
            message={`Thay đổi giá và chính sách dưới đây chỉ áp dụng cho ${vehicleName}${vehiclePlate ? ` (${vehiclePlate})` : ''}, không ảnh hưởng đến các xe khác sử dụng cấu hình chung của gian hàng.`}
          />
        ) : (
          <div className={styles.inheritBanner}>
            <span>
              Thiết lập chính sách chung đang được kích hoạt. Thay đổi tại phần Cấu hình gian hàng
              sẽ tự động cập nhật cho xe này.
            </span>
            <Link href={ROUTES.MANAGE.SHOP_POLICIES} className={styles.inheritLink}>
              Xem chính sách gian hàng →
            </Link>
          </div>
        )}
      </section>

      {editMode ? (
        <form onSubmit={submit} noValidate>
          <div className={styles.stack}>
            {overriding && canEdit ? (
              <div className={styles.resetRow}>
                <Button danger type="link" onClick={confirmReset} disabled={submitting}>
                  Đặt lại theo gian hàng
                </Button>
              </div>
            ) : null}

            {formState.isDirty ? (
              <Alert
                type="warning"
                showIcon
                message="Bạn có các thay đổi chưa được áp dụng"
                action={
                  <Button size="small" onClick={() => reset()} disabled={submitting}>
                    Hủy bỏ
                  </Button>
                }
              />
            ) : null}

            {/* Nhóm giá theo TỪNG DỊCH VỤ xe đăng (17/08) — không trộn thành một danh sách. */}
            {hasSelfDrive ? (
              <section className={styles.card} aria-label="Giá tự lái">
                <h2 className={styles.cardTitle}>Giá tự lái</h2>
                <div className={styles.priceRow}>
                  <NumberField
                    control={control}
                    name="weekdayPrice"
                    label="Giá ngày thường"
                    money
                    addonAfter="đ / ngày"
                    required
                  />
                  <NumberField
                    control={control}
                    name="weekendPrice"
                    label="Giá cuối tuần (tuỳ chọn)"
                    money
                    addonAfter="đ / ngày"
                    help="Bỏ trống = dùng giá ngày thường cho cả cuối tuần"
                  />
                  <NumberField
                    control={control}
                    name="hourlyPrice"
                    label="Giá theo giờ (tuỳ chọn)"
                    money
                    addonAfter="đ / giờ"
                    help="Bỏ trống = xe không cho thuê theo giờ"
                  />
                </div>
                <DirectDiscountEditor control={control} setValue={setValue} />
              </section>
            ) : null}

            {hasLongTerm ? (
              <section className={styles.card} aria-label="Giá thuê dài hạn">
                <h2 className={styles.cardTitle}>Thuê dài hạn</h2>
                <div className={styles.priceRow}>
                  <NumberField
                    control={control}
                    name="monthlyPrice"
                    label="Giá tháng tham chiếu"
                    money
                    addonAfter="đ / tháng"
                    help={`Ước tính = số ngày × giá tháng ÷ 30, thuê tối thiểu ${LONG_TERM_MIN_DAYS} ngày. Thiếu giá tháng thì không gửi duyệt public dịch vụ này được.`}
                  />
                </div>
                {/* Gợi ý sống theo GIÁ ĐANG NHẬP — chủ xe thấy ngay mức giảm khách sẽ thấy. */}
                <LongTermPriceHintLive control={control} />
              </section>
            ) : null}

            {hasWithDriver ? (
              <section className={styles.card} aria-label="Giá xe có tài xế">
                <h2 className={styles.cardTitle}>Xe có tài xế (giá đã gồm tài xế)</h2>
                <div className={styles.priceRow}>
                  <NumberField
                    control={control}
                    name="withDriverDailyPrice"
                    label="Nội thành (giá cơ bản)"
                    money
                    addonAfter="đ / ngày"
                    help="Bắt buộc để gửi duyệt public dịch vụ có tài xế"
                  />
                  <NumberField
                    control={control}
                    name="withDriverInterCityPrice"
                    label="Liên tỉnh — khứ hồi (tuỳ chọn)"
                    money
                    addonAfter="đ / ngày"
                    help="Bỏ trống = tạm tính theo giá nội thành, phụ phí xác nhận khi duyệt"
                  />
                  <NumberField
                    control={control}
                    name="withDriverOneWayPrice"
                    label="Liên tỉnh — 1 chiều (tuỳ chọn)"
                    money
                    addonAfter="đ / ngày"
                    help="Bỏ trống = tạm tính theo bậc gần nhất (liên tỉnh → nội thành)"
                  />
                </div>
              </section>
            ) : null}

            {/* Form giá xe là SUPERSET của PolicyFormValues — cấu trúc tương thích, TS không
                thu hẹp generic của RHF nên cần một cast tường minh tại biên. */}
            <PolicySections
              control={control as unknown as Parameters<typeof PolicySections>[0]['control']}
              numbered={false}
            />

            <StickyFormActions
              submitLabel="Lưu thay đổi"
              cancelLabel="Hủy bỏ"
              onCancel={formState.isDirty ? () => reset() : undefined}
              submitting={submitting}
              disabled={!canEdit}
            />
          </div>
        </form>
      ) : (
        <InheritedSummary
          pricing={pricing}
          policy={pricing.shopPolicy ?? null}
          canEdit={canEdit}
          onEdit={() => setEditingOverride(true)}
        />
      )}
    </div>
  );
}

/**
 * Khuyến mãi trực tiếp là một thiết lập giá riêng của xe, không phải bậc ưu đãi
 * dài hạn. Preview dùng cùng công thức với card/chi tiết sàn để chủ xe không phải
 * tự nhẩm giá sau giảm.
 */
function DirectDiscountEditor({
  control,
  setValue,
}: {
  control: Control<VehiclePricingFormValues>;
  setValue: UseFormSetValue<VehiclePricingFormValues>;
}) {
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const weekendPrice = useWatch({ control, name: 'weekendPrice' });
  const hourlyPrice = useWatch({ control, name: 'hourlyPrice' });
  const discountPercent = useWatch({ control, name: 'discountPercent' });
  const enabled = discountPercent != null && discountPercent > 0;
  const discountedWeekday = discountedPriceVnd(
    weekdayPrice == null ? null : String(weekdayPrice),
    discountPercent,
  );
  const discountedWeekend = discountedPriceVnd(
    weekendPrice == null ? null : String(weekendPrice),
    discountPercent,
  );
  const saving =
    weekdayPrice != null && discountedWeekday != null
      ? Math.max(0, Math.round(weekdayPrice) - Number(discountedWeekday))
      : null;

  return (
    <div className={styles.promoCard}>
      <div className={styles.promoSettings}>
        <div className={styles.promoHeadingRow}>
          <div>
            <h3 className={styles.promoTitle}>Khuyến mãi trực tiếp</h3>
            <p className={styles.promoDescription}>
              Giảm trực tiếp trên tiền thuê tự lái. Báo giá và đơn mới sẽ dùng đúng mức này.
            </p>
          </div>
          <Switch
            aria-label="Bật khuyến mãi trực tiếp"
            checked={enabled}
            checkedChildren="Bật"
            unCheckedChildren="Tắt"
            onChange={(checked) =>
              setValue('discountPercent', checked ? 10 : null, {
                shouldDirty: true,
                shouldValidate: true,
              })
            }
          />
        </div>

        {enabled ? (
          <div className={styles.promoInput}>
            <NumberField
              control={control}
              name="discountPercent"
              label="Mức giảm trực tiếp"
              percent
              min={1}
              max={100}
              required
              help="Áp dụng cho giá ngày thường, giá cuối tuần và giá riêng theo ngày của dịch vụ tự lái."
            />
          </div>
        ) : (
          <p className={styles.promoOffHint}>Khách đang thấy giá gốc, không có nhãn giảm giá.</p>
        )}

        <p className={styles.promoPolicyNote}>
          Khác với “Ưu đãi theo thời lượng” ở phần chính sách phía dưới: mức này chỉ dùng cho tự
          lái, không giảm giá thuê dài hạn, giá có tài xế, phụ phí hay tiền cọc.
        </p>
      </div>

      <aside className={styles.pricePreview} aria-live="polite" aria-label="Xem trước giá trên sàn">
        <span className={styles.previewEyebrow}>KHÁCH SẼ THẤY TRÊN SÀN</span>
        <span className={styles.previewLabel}>Giá tự lái ngày thường</span>
        {weekdayPrice != null ? (
          enabled && discountedWeekday ? (
            <>
              <div className={styles.previewPriceLine}>
                <span className={styles.previewOldPrice}>
                  {formatMoneyVnd(String(weekdayPrice))}
                </span>
                <span className={styles.previewDiscount}>-{discountPercent}%</span>
              </div>
              <div className={styles.previewFinalPrice}>
                {formatMoneyVnd(discountedWeekday)} <small>/ngày</small>
              </div>
              {saving != null ? (
                <span className={styles.previewSaving}>
                  Khách tiết kiệm {formatMoneyVnd(String(saving))} mỗi ngày
                </span>
              ) : null}
            </>
          ) : (
            <div className={styles.previewFinalPrice}>
              {formatMoneyVnd(String(weekdayPrice))} <small>/ngày</small>
            </div>
          )
        ) : (
          <span className={styles.previewEmpty}>Nhập giá ngày thường để xem trước</span>
        )}

        {enabled && discountedWeekend ? (
          <div className={styles.previewSecondary}>
            <span>Cuối tuần sau giảm</span>
            <strong>{formatMoneyVnd(discountedWeekend)}/ngày</strong>
          </div>
        ) : null}
        {hourlyPrice != null ? (
          <div className={styles.previewSecondary}>
            <span>Thuê theo giờ (không giảm)</span>
            <strong>{formatMoneyVnd(String(hourlyPrice))}/giờ</strong>
          </div>
        ) : null}
      </aside>
    </div>
  );
}

/** Cầu useWatch → LongTermPriceHint: gợi ý đổi ngay khi chủ xe gõ giá, không đợi lưu. */
function LongTermPriceHintLive({ control }: { control: Control<VehiclePricingFormValues> }) {
  const weekdayPrice = useWatch({ control, name: 'weekdayPrice' });
  const monthlyPrice = useWatch({ control, name: 'monthlyPrice' });
  return <LongTermPriceHint weekdayPrice={weekdayPrice} monthlyPrice={monthlyPrice} />;
}

/** State A — bảng thông số kế thừa read-only (Figma `247:1645`). */
function InheritedSummary({
  pricing,
  policy,
  canEdit,
  onEdit,
}: {
  pricing: VehiclePricing;
  policy: RentalPolicyValues | null;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const services = pricing.serviceTypes ?? [];
  const discountedWeekday = discountedPriceVnd(pricing.weekdayPrice, pricing.discountPercent);
  return (
    <section className={styles.card} aria-label="Thông số kế thừa đang áp dụng">
      <div className={styles.cardHeader}>
        <div>
          <h2 className={styles.cardTitle}>Giá & chính sách đang áp dụng</h2>
          <p className={styles.desc}>
            {policy
              ? 'Giá thuộc xe này; cọc, giao nhận và ưu đãi theo thời lượng đang kế thừa từ gian hàng.'
              : 'Giá thuộc xe này; gian hàng chưa có chính sách cọc, giao nhận và ưu đãi theo thời lượng.'}
          </p>
        </div>
        <div className={styles.summaryActions}>
          <span className={policy ? styles.inheritBadge : styles.missingPolicyBadge}>
            {policy ? 'Đang kế thừa' : 'Chưa có chính sách'}
          </span>
          {canEdit ? (
            <Button type="primary" onClick={onEdit}>
              Chỉnh sửa giá & khuyến mãi
            </Button>
          ) : null}
        </div>
      </div>

      <dl className={styles.summaryList}>
        {services.includes(SERVICE_TYPE.SELF_DRIVE) ? (
          <>
            <div className={styles.summaryRow}>
              <dt>Giá tự lái gốc (ngày thường)</dt>
              <dd>
                {pricing.weekdayPrice
                  ? `${formatMoneyVnd(pricing.weekdayPrice)}/ngày`
                  : 'Chưa có giá'}
              </dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>Khuyến mãi trực tiếp</dt>
              <dd className={pricing.discountPercent ? styles.summaryDiscount : undefined}>
                {pricing.discountPercent ? `-${pricing.discountPercent}%` : 'Tắt'}
              </dd>
            </div>
            {discountedWeekday ? (
              <div className={`${styles.summaryRow} ${styles.summaryHighlight}`}>
                <dt>Giá khách thấy trên sàn</dt>
                <dd>{formatMoneyVnd(discountedWeekday)}/ngày</dd>
              </div>
            ) : null}
          </>
        ) : null}
        {services.includes(SERVICE_TYPE.LONG_TERM) ? (
          <div className={styles.summaryRow}>
            <dt>Giá tháng (dài hạn)</dt>
            <dd>
              {pricing.monthlyPrice
                ? `${formatMoneyVnd(pricing.monthlyPrice)}/tháng`
                : 'Chưa có giá'}
            </dd>
          </div>
        ) : null}
        {services.includes(SERVICE_TYPE.WITH_DRIVER) ? (
          <div className={styles.summaryRow}>
            <dt>Giá có tài xế (nội thành)</dt>
            <dd>
              {pricing.withDriverDailyPrice
                ? `${formatMoneyVnd(pricing.withDriverDailyPrice)}/ngày`
                : 'Chưa có giá'}
            </dd>
          </div>
        ) : null}
        {policy ? (
          <>
            <div className={styles.summaryRow}>
              <dt>Tiền đặt cọc thế chấp</dt>
              <dd>{formatMoneyVnd(policy.depositAmount)}</dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>Giao nhận tận nơi</dt>
              <dd className={policy.deliveryEnabled ? styles.summaryOn : undefined}>
                {policy.deliveryEnabled
                  ? `Bật (${policy.deliveryTiers.length} khoảng cách)`
                  : 'Tắt'}
              </dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>Phí trả quá giờ</dt>
              <dd>
                {policy.overtimeFeePerHour
                  ? `${formatMoneyVnd(policy.overtimeFeePerHour)}/giờ`
                  : 'Cần cấu hình'}
              </dd>
            </div>
            <div className={styles.summaryRow}>
              <dt>Ưu đãi theo thời lượng (thuê dài hạn)</dt>
              <dd>
                {policy.discountEnabled && policy.discountTiers.length > 0
                  ? `Mức giảm tối đa ${Math.max(...policy.discountTiers.map((t) => t.percent))}%`
                  : 'Tắt'}
              </dd>
            </div>
          </>
        ) : null}
      </dl>

      {!policy ? (
        <Alert
          type="info"
          showIcon
          message="Gian hàng chưa cấu hình chính sách thuê"
          description={
            <span>
              Xe này chưa có tiền cọc, giao nhận hay ưu đãi. Cấu hình tại{' '}
              <Link href={ROUTES.MANAGE.SHOP_POLICIES}>Chính sách thuê của gian hàng</Link> hoặc
              chuyển sang tùy chỉnh riêng cho xe.
            </span>
          }
        />
      ) : null}
    </section>
  );
}
