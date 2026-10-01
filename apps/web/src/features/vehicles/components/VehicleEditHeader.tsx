'use client';

import {
  CarOutlined,
  CheckOutlined,
  DownOutlined,
  EditOutlined,
  LoadingOutlined,
} from '@ant-design/icons';
import { App, Dropdown, Tooltip } from 'antd';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  VEHICLE_OPERATION_STATUS_META,
  VEHICLE_OPERATION_STATUS_VALUES,
  VEHICLE_PUBLIC_STATUS_META,
  type VehicleOperationStatus,
  type VehiclePublicStatus,
} from '@xeprime/types';

import { StatusTag } from '@/components/data-display/StatusTag';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { decorativeIcon } from '@/lib/decorative-icon';

import { useUpdateVehicle } from '../hooks/use-vehicle-mutations';
import { useVehicleSummary } from '../hooks/use-vehicle-summary';
import type { VehicleDetail } from '../types';
import { MarketplaceVisibilitySwitch } from './MarketplaceVisibilitySwitch';
import { VehicleThumbStrip } from './VehicleThumbStrip';
import styles from './VehicleEditHeader.module.css';

/**
 * Thẻ đầu của màn sửa xe ở cổng quản lý (30/09/2026) — người đang sửa luôn thấy mình sửa chiếc
 * xe NÀO và nó đang ở đâu: ảnh chính, tên + mã, biển số · loại xe / dịch vụ, số KM, hai trục
 * trạng thái (vận hành · kiểm duyệt) và công tắc "Trên chợ".
 *
 * CÙNG câu chữ (`Vehicles.overview`) và CÙNG công tắc (`MarketplaceVisibilitySwitch`, ADR 0048)
 * với Hồ sơ 360 — công tắc tự gác quyền `vehicles.submit_public` và phiên hỗ trợ, nên đặt nó ở
 * đây không mở thêm quyền nào.
 *
 * TRẠNG THÁI VẬN HÀNH sửa tại chỗ (30/09/2026): chọn là lưu ngay (`PATCH` chỉ gửi
 * `operationStatus`). Đây là ĐƯỜNG GHI DUY NHẤT của trường này trên màn sửa — ô cùng tên đã rời
 * form Thông tin, và form không gửi nó nữa (không thì lưu form sẽ ghi đè lần đổi ở đây).
 */
export function VehicleEditHeader({
  vehicle,
  onEditImages,
  statusEditable = false,
  extraActions,
}: {
  /** Nút riêng của từng khu, đặt dưới công tắc "Trên chợ" (khu tài khoản: Hồ sơ xe · Trang xe). */
  extraActions?: ReactNode;
  vehicle: VehicleDetail;
  /** Mở mục Hình ảnh — `undefined` khi người này không tới được mục đó. */
  onEditImages?: () => void;
  /** `vehicles.update` ∧ phiên hỗ trợ không khoá ô này — không thì chỉ hiện thẻ trạng thái. */
  statusEditable?: boolean;
}) {
  const t = useTranslations('Vehicles.overview');
  const tEdit = useTranslations('Vehicles.edit.aside');
  const tLabels = useTranslations('Common.labels');
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const { message } = App.useApp();
  const update = useUpdateVehicle(vehicle.id);

  async function changeStatus(next: VehicleOperationStatus) {
    if (next === vehicle.operationStatus) return;
    try {
      await update.mutateAsync({ operationStatus: next });
      message.success(tEdit('statusSaved'));
    } catch (err) {
      message.error(errorMessage(err));
    }
  }
  // Số KM có thẩm quyền đến từ tổng hợp 360 — cùng nguồn, cùng cách nói "Chưa có".
  const summary = useVehicleSummary(vehicle.id).data;

  /*
   * Ảnh đại diện CỐ ĐỊNH ở trên + DẢI ảnh theo vị trí bên dưới (30/09/2026). Mỗi ảnh nhỏ mang
   * nhãn vị trí ngay trên ảnh (Mặt trước, Bên trái…), bấm để phóng to; hai mũi tên ở hai đầu
   * dải lướt qua lại khi nhiều ảnh hơn chỗ. Chỉ đọc: sửa ảnh là nút bút chì, dẫn tới mục Hình ảnh.
   */
  return (
    <section className={styles.root} aria-label={t('profileLabel')}>
      <div className={styles.mediaCol}>
        <div className={styles.media}>
          {vehicle.mainImageUrl ? (
            // eslint-disable-next-line @next/next/no-img-element -- ảnh R2 ngoài miền, không qua next/image
            <img className={styles.image} src={vehicle.mainImageUrl} alt={vehicle.name} />
          ) : (
            <span className={styles.imageFallback} aria-hidden="true">
              <CarOutlined />
            </span>
          )}
          {onEditImages ? (
            <Tooltip title={tEdit('changeImage')}>
              <button
                type="button"
                className={styles.mediaEdit}
                onClick={onEditImages}
                aria-label={tEdit('changeImage')}
              >
                {decorativeIcon(<EditOutlined />)}
              </button>
            </Tooltip>
          ) : null}
        </div>

        <VehicleThumbStrip vehicle={vehicle} />
      </div>

      <div className={styles.info}>
        <div className={styles.nameRow}>
          <h1 className={styles.name}>{vehicle.name}</h1>
          {vehicle.code ? <span className={styles.code}>{vehicle.code}</span> : null}
        </div>
        <p className={styles.meta}>
          {t.rich('plate', {
            value: vehicle.plateNumber || tLabels('notAvailable'),
            b: (chunks) => <b>{chunks}</b>,
          })}
          <span className={styles.dot} aria-hidden="true">
            •
          </span>
          {domainLabel('vehicleType', vehicle.vehicleType)} /{' '}
          {fmt.serviceTypes(vehicle.serviceTypes)}
        </p>
        <p className={styles.meta}>
          {t.rich('odometer', {
            value: fmt.km(summary?.currentOdometerKm ?? null),
            b: (chunks) => <b>{chunks}</b>,
          })}
          {summary?.currentOdometerSource ? (
            <span className={styles.muted}>
              {' '}
              · {domainLabel('odometerSource', summary.currentOdometerSource)}
            </span>
          ) : null}
        </p>
        <div className={styles.axes}>
          <span className={styles.axis}>
            <span className={styles.axisLabel}>{t('axisOperation')}</span>
            {statusEditable ? (
              /*
               * CHÍNH cái chip là chỗ đổi (30/09/2026): bấm mở menu các trạng thái — mỗi dòng là
               * đúng chip màu của trạng thái đó, dòng hiện tại có dấu ✓. Không thêm một ô chọn
               * thứ hai cạnh chip đang nói cùng một điều.
               */
              <Dropdown
                trigger={['click']}
                disabled={update.isPending}
                menu={{
                  selectable: true,
                  selectedKeys: [vehicle.operationStatus],
                  items: VEHICLE_OPERATION_STATUS_VALUES.map((status) => ({
                    key: status,
                    label: (
                      <span className={styles.statusOption}>
                        <StatusTag
                          value={status}
                          meta={VEHICLE_OPERATION_STATUS_META}
                          group="vehicleOperationStatus"
                        />
                        {status === vehicle.operationStatus
                          ? decorativeIcon(<CheckOutlined className={styles.statusCheck} />)
                          : null}
                      </span>
                    ),
                  })),
                  onClick: ({ key }) => void changeStatus(key as VehicleOperationStatus),
                }}
              >
                <button
                  type="button"
                  className={styles.statusTrigger}
                  aria-label={tEdit('changeStatus', {
                    status: domainLabel('vehicleOperationStatus', vehicle.operationStatus),
                  })}
                >
                  <StatusTag
                    value={vehicle.operationStatus as VehicleOperationStatus}
                    meta={VEHICLE_OPERATION_STATUS_META}
                    group="vehicleOperationStatus"
                  />
                  {update.isPending
                    ? decorativeIcon(<LoadingOutlined className={styles.statusCaret} />)
                    : decorativeIcon(<DownOutlined className={styles.statusCaret} />)}
                </button>
              </Dropdown>
            ) : (
              <StatusTag
                value={vehicle.operationStatus as VehicleOperationStatus}
                meta={VEHICLE_OPERATION_STATUS_META}
                group="vehicleOperationStatus"
              />
            )}
          </span>
          <span className={styles.axis}>
            <span className={styles.axisLabel}>{t('axisPublic')}</span>
            <StatusTag
              value={vehicle.publicStatus as VehiclePublicStatus}
              meta={VEHICLE_PUBLIC_STATUS_META}
              group="vehiclePublicStatus"
            />
          </span>
        </div>
      </div>

      <div className={styles.actions}>
        <MarketplaceVisibilitySwitch vehicle={vehicle} />
        {extraActions ? <div className={styles.extraActions}>{extraActions}</div> : null}
      </div>
    </section>
  );
}
