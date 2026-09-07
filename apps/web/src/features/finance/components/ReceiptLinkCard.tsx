'use client';

import { ExportOutlined } from '@ant-design/icons';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import type { ReactNode } from 'react';
import {
  BOOKING_STATUS_META,
  VEHICLE_OPERATION_STATUS_META,
  type BookingStatus,
  type VehicleOperationStatus,
} from '@xeprime/types';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { EntityIdentity } from '@/components/data-display/EntityIdentity';
import { StatusTag } from '@/components/data-display/StatusTag';
import { bookingPath, vehiclePath } from '@/constants/routes';
import { useAppFormat } from '@/i18n/use-app-format';
import { vehicleLabel } from '@/lib/vehicle-label';
import type { ReceiptBookingOption, ReceiptVehicleOption } from '../types';
import styles from './ReceiptLinkCard.module.css';

/**
 * Thẻ "phiếu này sẽ gắn vào đây" — đọc lại đối tượng đã chọn trước khi tiền được ghi vào nó.
 *
 * Vì sao là một THẺ chứ không phải một dòng chữ dưới ô chọn: một gian hàng có bốn chiếc Vios cùng
 * màu và ba đơn cùng khách, nên xác nhận bằng chữ là xác nhận bằng cách đọc lướt. Ảnh + trạng
 * thái + một dòng bối cảnh là ba thứ làm người dùng DỪNG LẠI đúng lúc họ chọn nhầm.
 *
 * Một component cho cả hai chế độ, không phải hai: hai thẻ riêng sẽ trôi khỏi nhau, và người dùng
 * chuyển qua lại giữa hai chế độ trong cùng một form phải thấy cùng một hình dạng.
 */
interface ReceiptLinkCardProps {
  /** Ảnh đại diện — xe. Rỗng thì `EntityIdentity` tự rơi về icon, KHÔNG để một ô xám trống. */
  imageUrl?: string | null;
  /** Dòng chính: mã · tên · biển số. */
  title: ReactNode;
  subtitle?: ReactNode;
  /** Tag trạng thái ở góc phải — trạng thái vận hành của xe, hoặc trạng thái đơn. */
  tag?: ReactNode;
  /** Các cặp nhãn–giá trị ở dải chân thẻ. Rỗng thì dải chân biến mất hẳn. */
  facts?: readonly { readonly label: string; readonly value: ReactNode }[];
  /** Đường mở hồ sơ đầy đủ — mở tab mới để form đang điền dở không bị bỏ lại. */
  detailHref?: string;
}

export function ReceiptLinkCard({
  imageUrl,
  title,
  subtitle,
  tag,
  facts = [],
  detailHref,
}: ReceiptLinkCardProps) {
  const t = useTranslations('Finance.receipts.form.link');
  const shownFacts = facts.filter((fact) => fact.value != null && fact.value !== '');

  return (
    <div className={styles.card}>
      <div className={styles.head}>
        <EntityIdentity kind="vehicle" imageUrl={imageUrl} name={title} subtitle={subtitle} />
        {tag ? <div className={styles.tag}>{tag}</div> : null}
      </div>

      {shownFacts.length > 0 || detailHref ? (
        <div className={styles.foot}>
          <div className={styles.facts}>
            {shownFacts.map((fact) => (
              <span key={fact.label} className={styles.fact}>
                <span className={styles.factLabel}>{fact.label}</span>
                {fact.value}
              </span>
            ))}
          </div>
          {detailHref ? (
            <Link
              className={styles.detail}
              href={detailHref}
              target="_blank"
              rel="noopener noreferrer"
            >
              {t('detail')}
              <ExportOutlined aria-hidden="true" />
            </Link>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

/**
 * Thẻ cho một chiếc XE.
 *
 * Dải chân hiện chuyến ĐANG CHẠY nếu có — ghi một khoản chi cho chiếc xe đang có khách trên
 * đường không giống ghi cho chiếc đang nằm bãi, và số còn nợ của chuyến đó thường chính là lý do
 * người dùng mở form. Xe rảnh thì dải chân chỉ còn chi nhánh, không bịa ra dòng "không có khách".
 */
export function VehicleLinkCard({ vehicle }: { vehicle: ReceiptVehicleOption }) {
  const t = useTranslations('Finance.receipts.form.link');
  const fmt = useAppFormat();

  return (
    <ReceiptLinkCard
      imageUrl={vehicle.imageUrl}
      title={[vehicle.code, vehicle.name, vehicle.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
      subtitle={vehicleLabel(vehicle.name, vehicle.plateNumber)}
      tag={
        <StatusTag
          value={vehicle.operationStatus as VehicleOperationStatus}
          meta={VEHICLE_OPERATION_STATUS_META}
          group="vehicleOperationStatus"
        />
      }
      facts={[
        { label: t('branch'), value: vehicle.branchName },
        { label: t('customer'), value: vehicle.currentCustomerName },
        {
          label: t('debt'),
          value: vehicle.currentDebtAmount ? fmt.money(vehicle.currentDebtAmount) : null,
        },
      ]}
      detailHref={vehiclePath.detail(vehicle.id)}
    />
  );
}

/** Thẻ cho một ĐƠN THUÊ — cùng hình dạng, khác nguồn dữ liệu. */
export function BookingLinkCard({ booking }: { booking: ReceiptBookingOption }) {
  const t = useTranslations('Finance.receipts.form.link');
  const fmt = useAppFormat();

  return (
    <ReceiptLinkCard
      imageUrl={booking.vehicleImageUrl}
      title={[booking.code, booking.customerName, booking.plateNumber].filter(Boolean).join(LIST_SEPARATOR)}
      subtitle={vehicleLabel(booking.vehicleName, booking.plateNumber)}
      tag={
        <StatusTag
          value={booking.status as BookingStatus}
          meta={BOOKING_STATUS_META}
          group="bookingStatus"
        />
      }
      facts={[
        { label: t('customer'), value: booking.customerName },
        { label: t('debt'), value: fmt.money(booking.debtAmount) },
      ]}
      detailHref={bookingPath.detail(booking.id)}
    />
  );
}
