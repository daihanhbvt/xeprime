'use client';

import { App, Switch } from 'antd';
import { useTranslations } from 'next-intl';

import { InfoHint } from '@/components/data-display/InfoHint';
import { SUPPORT_HIDDEN_AREA, useSupportHides } from '@/features/tenant-support/support-session';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useSetVehicleVatInvoiceSupport } from '../hooks/use-vehicle-mutations';
import type { VehicleDetail } from '../types';
import styles from './VatInvoiceSupportRow.module.css';

/**
 * Hàng "Xuất hoá đơn VAT" trong thẻ Giá & chính sách của Hồ sơ 360 (ADR 0059).
 *
 * ## Vì sao ở đây
 *
 * Hồ sơ 360 là MỘT màn cho cả hai tuyến (gian hàng và chủ xe tuyến hoa hồng cùng mở
 * `/vehicles/:id`), và thẻ này đã là nơi chủ xe đọc những điều khoản công bố cho khách — giao
 * xe tận nơi nằm ngay hàng trên. Một component, một chỗ ghi: cờ không có bản thứ hai trong form
 * sửa xe, nên không có hai nơi để lệch nhau.
 *
 * ## Lưu ngay khi bấm
 *
 * Không có nút Lưu: `checked` bám vào bản ghi xe trong cache, và mutation chỉ ghi cache khi
 * server trả về thành công — lỗi thì công tắc tự đứng nguyên chỗ cũ, kèm thông báo lỗi theo mã.
 * `loading` vừa báo đang lưu vừa chặn bấm lặp (AntD bỏ qua sự kiện khi Switch đang loading).
 *
 * ## Không gắn với trục nào khác
 *
 * Công tắc mở ở MỌI trạng thái duyệt/hiển thị và ở cả hai tuyến — nó không phải điều kiện lên
 * chợ hay nhận chuyến. Chỉ hai thứ đóng nó: `canEdit` của thẻ chứa nó (= `vehicles.update`, cùng
 * quyền backend gác — một phép suy quyền, không tự suy lần hai ở đây), và phiên hỗ trợ của nền
 * tảng (backend không khai `@SupportAction`). Khi đóng, hàng chỉ còn chữ — không vẽ nút cho một
 * hành động không mở.
 */
export function VatInvoiceSupportRow({
  vehicle,
  canEdit,
  className,
}: {
  vehicle: VehicleDetail;
  /** Người xem có `vehicles.update` — thẻ chứa đã suy, truyền xuống thay vì hỏi lại. */
  canEdit: boolean;
  /** Lớp của một hàng nhãn–giá trị trong thẻ chứa nó — hàng này đứng cùng nhịp các hàng bên trên. */
  className?: string;
}) {
  const t = useTranslations('Vehicles.overview.pricing.vatInvoice');
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const toggle = useSetVehicleVatInvoiceSupport(vehicle.id);
  const supportHides = useSupportHides(SUPPORT_HIDDEN_AREA.VAT_INVOICE_TOGGLE);
  const canToggle = canEdit && !supportHides;

  function onChange(next: boolean) {
    toggle.mutate(next, {
      onSuccess: () => message.success(next ? t('enabled') : t('disabled')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  return (
    <div className={className}>
      <dt className={styles.label}>
        {t('label')}
        <InfoHint label={t('hintLabel')} content={t('hint')} />
      </dt>
      <dd className={styles.value}>
        <span className={cx(styles.state, vehicle.vatInvoiceSupported && styles.on)}>
          {vehicle.vatInvoiceSupported ? t('on') : t('off')}
        </span>
        {canToggle ? (
          <Switch
            size="small"
            checked={vehicle.vatInvoiceSupported}
            loading={toggle.isPending}
            onChange={onChange}
            aria-label={t('ariaLabel', { name: vehicle.name })}
          />
        ) : null}
      </dd>
    </div>
  );
}
