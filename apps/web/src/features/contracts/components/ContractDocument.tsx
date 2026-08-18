'use client';

import {
  SERVICE_TYPE_LABEL,
  VEHICLE_TYPE,
  longTermPackageLabel,
  routeTypeLabel,
  type ServiceType,
} from '@xeprime/types';
import { formatDate, formatDateTime } from '@/lib/datetime';
import { formatMoneyVnd } from '@/lib/money';
import type { Contract } from '../types';
import styles from './ContractDocument.module.css';

function vehicleTypeLabel(t: string): string {
  return t === VEHICLE_TYPE.MOTORBIKE ? 'Xe máy' : 'Ô tô';
}

/**
 * Tờ hợp đồng thuê xe — render thuần từ snapshot (đông cứng). Đọc tốt trên mobile lẫn PC, và in
 * đẹp khổ A4 (print CSS ở page ẩn phần vỏ app, chỉ chừa `[data-print-root]`).
 */
export function ContractDocument({ contract }: { contract: Contract }) {
  const { snapshot: s, contractNo, createdAt } = contract;
  const shopContact = [s.shop.phone, s.shop.email].filter(Boolean).join(' · ');
  const shopLegal = [
    s.shop.taxCode ? `MST: ${s.shop.taxCode}` : null,
    s.shop.businessLicenseNo ? `GPKD: ${s.shop.businessLicenseNo}` : null,
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <article className={styles.sheet} data-print-root>
      <header className={styles.head}>
        <div>
          <div className={styles.shopName}>{s.shop.name}</div>
          {shopContact ? <div className={styles.shopMeta}>{shopContact}</div> : null}
          {s.shop.address ? (
            <div className={styles.shopMeta}>
              {[s.shop.address, s.shop.province].filter(Boolean).join(', ')}
            </div>
          ) : null}
          {shopLegal ? <div className={styles.shopMeta}>{shopLegal}</div> : null}
        </div>
        <div className={styles.headRight}>
          <div className={styles.contractNo}>Số: {contractNo}</div>
          <div className={styles.shopMeta}>Ngày lập: {formatDate(createdAt)}</div>
        </div>
      </header>

      <h1 className={styles.title}>Hợp đồng thuê xe</h1>

      <section className={styles.parties}>
        <div className={styles.party}>
          <div className={styles.partyLabel}>Bên cho thuê (Bên A)</div>
          <div className={styles.partyName}>{s.shop.name}</div>
          {s.shop.phone ? <div className={styles.partyLine}>Điện thoại: {s.shop.phone}</div> : null}
          {s.shop.bankAccountNo ? (
            <div className={styles.partyLine}>
              TK: {s.shop.bankAccountNo}
              {s.shop.bankName ? ` · ${s.shop.bankName}` : ''}
              {s.shop.bankAccountName ? ` · ${s.shop.bankAccountName}` : ''}
            </div>
          ) : null}
        </div>
        <div className={styles.party}>
          <div className={styles.partyLabel}>Bên thuê (Bên B)</div>
          <div className={styles.partyName}>{s.customer.name}</div>
          {s.customer.phone ? (
            <div className={styles.partyLine}>Điện thoại: {s.customer.phone}</div>
          ) : null}
        </div>
      </section>

      <Section title="Thông tin xe">
        <dl className={styles.grid}>
          <Field label="Tên xe" value={s.vehicle.name} />
          <Field label="Biển số" value={s.vehicle.plateNumber ?? '—'} />
          <Field label="Loại xe" value={vehicleTypeLabel(s.vehicle.vehicleType)} />
          <Field
            label="Hình thức"
            value={
              SERVICE_TYPE_LABEL[s.vehicle.serviceType as ServiceType] ?? s.vehicle.serviceType
            }
          />
          {s.vehicle.brand || s.vehicle.model ? (
            <Field
              label="Hãng / dòng"
              value={[s.vehicle.brand, s.vehicle.model].filter(Boolean).join(' ')}
            />
          ) : null}
          {s.vehicle.manufactureYear ? (
            <Field label="Đời xe" value={String(s.vehicle.manufactureYear)} />
          ) : null}
          {s.vehicle.color ? <Field label="Màu" value={s.vehicle.color} /> : null}
          {s.vehicle.seatCount ? (
            <Field label="Số chỗ" value={`${s.vehicle.seatCount} chỗ`} />
          ) : null}
        </dl>
      </Section>

      <Section title="Thời gian thuê">
        <dl className={styles.grid}>
          <Field label="Nhận xe" value={formatDateTime(s.rental.pickupAt)} />
          <Field label="Trả xe" value={formatDateTime(s.rental.returnAt)} />
          {/*
            Chuyến THUÊ DÀI HẠN ký theo GÓI tháng lịch, không theo số ngày (ADR 0011) — in "90
            ngày" cho gói 3 tháng là sai văn bản khi các tháng lệch độ dài. Hợp đồng ký trước
            ADR 0011 không có key này nên vẫn in số ngày như cũ.
          */}
          {s.rental.longTermPackageMonths ? (
            <Field
              label="Thời hạn thuê"
              value={longTermPackageLabel(s.rental.longTermPackageMonths)}
            />
          ) : (
            <Field label="Số ngày" value={`${s.rental.days} ngày`} />
          )}
          <Field label="Mã đơn" value={s.rental.bookingCode} />
          {/* Hành trình chuyến có tài xế — hợp đồng cũ không có key này, chỉ render khi tồn tại. */}
          {s.rental.routeType ? (
            <Field label="Lộ trình" value={routeTypeLabel(s.rental.routeType)} />
          ) : null}
          {s.rental.pickupAddress ? (
            <Field label="Địa chỉ đón" value={s.rental.pickupAddress} />
          ) : null}
          {s.rental.destination ? <Field label="Điểm đến" value={s.rental.destination} /> : null}
        </dl>
      </Section>

      <Section title="Chi phí thuê">
        <table className={styles.priceTable}>
          <tbody>
            <PriceRow label="Tiền thuê" value={s.pricing.baseAmount} />
            <PriceRow label="Phí giao xe" value={s.pricing.deliveryFee} />
            <PriceRow label="Giảm giá" value={s.pricing.discountAmount} minus />
            <PriceRow label="Tổng cộng" value={s.pricing.totalAmount} strong />
            <PriceRow label="Tiền cọc" value={s.pricing.depositAmount} />
            <PriceRow label="Đã thanh toán" value={s.pricing.paidAmount} />
            <PriceRow label="Còn phải trả" value={s.pricing.remainingAmount} strong />
          </tbody>
        </table>
      </Section>

      <Section title="Điều khoản">
        <ol className={styles.terms}>
          <li>Bên B nhận và trả xe đúng thời gian, địa điểm đã thỏa thuận; giữ gìn xe cẩn thận.</li>
          <li>
            Bên B chịu trách nhiệm về vi phạm giao thông, hư hỏng, mất mát phát sinh trong thời gian
            thuê.
          </li>
          <li>Tiền cọc được hoàn lại sau khi trả xe, trừ các khoản phát sinh (nếu có).</li>
          <li>
            Hai bên tự thỏa thuận và giải quyết trên tinh thần hợp tác; XePrime chỉ là nền tảng kết
            nối.
          </li>
        </ol>
      </Section>

      {s.note ? (
        <Section title="Ghi chú">
          <p className={styles.note}>{s.note}</p>
        </Section>
      ) : null}

      <section className={styles.signatures}>
        <div className={styles.sign}>
          <div className={styles.signRole}>Bên cho thuê (Bên A)</div>
          <div className={styles.signHint}>(Ký, ghi rõ họ tên)</div>
        </div>
        <div className={styles.sign}>
          <div className={styles.signRole}>Bên thuê (Bên B)</div>
          <div className={styles.signHint}>(Ký, ghi rõ họ tên)</div>
        </div>
      </section>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className={styles.section}>
      <h2 className={styles.sectionTitle}>{title}</h2>
      {children}
    </section>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.field}>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function PriceRow({
  label,
  value,
  strong,
  minus,
}: {
  label: string;
  value: string;
  strong?: boolean;
  minus?: boolean;
}) {
  return (
    <tr className={strong ? styles.priceStrong : undefined}>
      <td>{label}</td>
      <td className={styles.priceValue}>
        {minus && value !== '0' ? '− ' : ''}
        {formatMoneyVnd(value)}
      </td>
    </tr>
  );
}
