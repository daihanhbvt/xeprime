'use client';

import { useTranslations } from 'next-intl';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { LEGAL_DOC, legalPath } from '@/constants/legal';
import { ZONE, zoneHref } from '@/zones';
import type { Contract } from '../types';
import styles from './ContractDocument.module.css';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';

/**
 * Tờ hợp đồng thuê xe — render thuần từ snapshot (đông cứng). Đọc tốt trên mobile lẫn PC, và in
 * đẹp khổ A4 (print CSS ở page ẩn phần vỏ app, chỉ chừa `[data-print-root]`).
 *
 * Nhãn mã (loại xe, dịch vụ, lộ trình, loại tài sản) dịch theo ngôn ngữ người xem; SỐ LIỆU luôn đọc
 * từ snapshot đã ký. Phụ phí theo dòng và tài sản thế chấp (ADR 0109) chỉ có ở hợp đồng lập từ
 * 25/11/2026 — hợp đồng cũ không có hai khoá đó và in như trước.
 */
export function ContractDocument({ contract }: { contract: Contract }) {
  const t = useTranslations('Bookings.contractDocument');
  const fmt = useAppFormat();
  const dl = useDomainLabel();

  const { snapshot: s, contractNo, createdAt } = contract;
  const shopContact = [s.shop.phone, s.shop.email].filter(Boolean).join(LIST_SEPARATOR);
  const shopLegal = [
    s.shop.taxCode ? t('shop.taxCode', { value: s.shop.taxCode }) : null,
    s.shop.businessLicenseNo
      ? t('shop.businessLicense', { value: s.shop.businessLicenseNo })
      : null,
  ]
    .filter(Boolean)
    .join(LIST_SEPARATOR);
  const extraCharges = s.pricing.extraCharges ?? [];
  const generalTermsUrl = zoneHref(ZONE.MARKET, legalPath.doc(LEGAL_DOC.RENTAL_CONTRACT)).replace(
    /^https?:\/\//,
    '',
  );
  const collaterals = s.collaterals ?? [];

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
          <div className={styles.contractNo}>{t('number', { value: contractNo })}</div>
          <div className={styles.shopMeta}>{t('createdAt', { date: fmt.date(createdAt) })}</div>
        </div>
      </header>

      <h1 className={styles.title}>{t('title')}</h1>

      <section className={styles.parties}>
        <div className={styles.party}>
          <div className={styles.partyLabel}>{t('parties.lessor')}</div>
          <div className={styles.partyName}>{s.shop.name}</div>
          {s.shop.phone ? (
            <div className={styles.partyLine}>{t('parties.phone', { value: s.shop.phone })}</div>
          ) : null}
          {s.shop.bankAccountNo ? (
            <div className={styles.partyLine}>
              {t('parties.bankAccount', { value: s.shop.bankAccountNo })}
              {s.shop.bankName ? ` · ${s.shop.bankName}` : ''}
              {s.shop.bankAccountName ? ` · ${s.shop.bankAccountName}` : ''}
            </div>
          ) : null}
        </div>
        <div className={styles.party}>
          <div className={styles.partyLabel}>{t('parties.lessee')}</div>
          <div className={styles.partyName}>{s.customer.name}</div>
          {s.customer.phone ? (
            <div className={styles.partyLine}>
              {t('parties.phone', { value: s.customer.phone })}
            </div>
          ) : null}
        </div>
      </section>

      <Section title={t('vehicle.title')}>
        <dl className={styles.grid}>
          <Field label={t('vehicle.name')} value={s.vehicle.name} />
          <Field label={t('vehicle.plate')} value={s.vehicle.plateNumber ?? '-'} />
          <Field label={t('vehicle.type')} value={dl('vehicleType', s.vehicle.vehicleType)} />
          <Field label={t('vehicle.service')} value={dl('serviceType', s.vehicle.serviceType)} />
          {s.vehicle.brand || s.vehicle.model ? (
            <Field
              label={t('vehicle.brandModel')}
              value={[s.vehicle.brand, s.vehicle.model].filter(Boolean).join(' ')}
            />
          ) : null}
          {s.vehicle.manufactureYear ? (
            <Field label={t('vehicle.year')} value={String(s.vehicle.manufactureYear)} />
          ) : null}
          {s.vehicle.color ? <Field label={t('vehicle.color')} value={s.vehicle.color} /> : null}
          {s.vehicle.seatCount ? (
            <Field
              label={t('vehicle.seats')}
              value={t('vehicle.seatsValue', { count: s.vehicle.seatCount })}
            />
          ) : null}
        </dl>
      </Section>

      <Section title={t('rental.title')}>
        <dl className={styles.grid}>
          <Field label={t('rental.pickup')} value={fmt.dateTime(s.rental.pickupAt)} />
          <Field label={t('rental.return')} value={fmt.dateTime(s.rental.returnAt)} />
          {/*
            Chuyến THUÊ DÀI HẠN ký theo GÓI tháng lịch, không theo số ngày (ADR 0011) — in "90
            ngày" cho gói 3 tháng là sai văn bản khi các tháng lệch độ dài. Hợp đồng ký trước
            ADR 0011 không có key này nên vẫn in số ngày như cũ.
          */}
          {s.rental.longTermPackageMonths ? (
            <Field
              label={t('rental.term')}
              value={fmt.packageLabel(s.rental.longTermPackageMonths) ?? '-'}
            />
          ) : (
            <Field
              label={t('rental.days')}
              value={t('rental.daysValue', { count: s.rental.days })}
            />
          )}
          <Field label={t('rental.bookingCode')} value={s.rental.bookingCode} />
          {/* Hành trình chuyến có tài xế — hợp đồng cũ không có key này, chỉ render khi tồn tại. */}
          {s.rental.routeType ? (
            <Field label={t('rental.route')} value={dl('routeType', s.rental.routeType)} />
          ) : null}
          {s.rental.pickupAddress ? (
            <Field label={t('rental.pickupAddress')} value={s.rental.pickupAddress} />
          ) : null}
          {s.rental.destination ? (
            <Field label={t('rental.destination')} value={s.rental.destination} />
          ) : null}
        </dl>
      </Section>

      <Section title={t('pricing.title')}>
        <table className={styles.priceTable}>
          <tbody>
            <PriceRow label={t('pricing.base')} value={s.pricing.baseAmount} />
            <PriceRow label={t('pricing.delivery')} value={s.pricing.deliveryFee} />
            {extraCharges.map((charge, index) => (
              <PriceRow
                key={`${charge.label}-${index}`}
                label={charge.label}
                value={charge.amount}
              />
            ))}
            <PriceRow label={t('pricing.discount')} value={s.pricing.discountAmount} minus />
            <PriceRow label={t('pricing.total')} value={s.pricing.totalAmount} strong />
            <PriceRow label={t('pricing.deposit')} value={s.pricing.depositAmount} />
            <PriceRow label={t('pricing.paid')} value={s.pricing.paidAmount} />
            <PriceRow label={t('pricing.remaining')} value={s.pricing.remainingAmount} strong />
          </tbody>
        </table>
      </Section>

      {collaterals.length > 0 ? (
        <Section title={t('collateral.title')}>
          <ul className={styles.terms}>
            {collaterals.map((item, index) => (
              <li key={`${item.collateralType}-${index}`}>
                {dl('bookingCollateralType', item.collateralType)}
                {item.description ? `: ${item.description}` : ''}
              </li>
            ))}
          </ul>
          <p className={styles.note}>{t('collateral.note')}</p>
        </Section>
      ) : null}

      <Section title={t('terms.title')}>
        <ol className={styles.terms}>
          <li>{t('terms.handover')}</li>
          <li>{t('terms.liability')}</li>
          <li>{t('terms.deposit')}</li>
          <li>{t('terms.idDocs')}</li>
          <li>{t('terms.platform')}</li>
          {/*
            Viện dẫn Điều kiện chung hợp đồng thuê xe (checklist VB.05): tờ hợp đồng chỉ ghi số liệu
            của đơn, phần điều khoản đầy đủ nằm ở văn bản công khai. Địa chỉ in dạng đọc được (bỏ
            giao thức) vì tờ này để in ra giấy.
          */}
          <li>{t('terms.general', { url: generalTermsUrl })}</li>
        </ol>
      </Section>

      {s.note ? (
        <Section title={t('note')}>
          <p className={styles.note}>{s.note}</p>
        </Section>
      ) : null}

      <section className={styles.signatures}>
        <div className={styles.sign}>
          <div className={styles.signRole}>{t('parties.lessor')}</div>
          <div className={styles.signHint}>{t('signHint')}</div>
        </div>
        <div className={styles.sign}>
          <div className={styles.signRole}>{t('parties.lessee')}</div>
          <div className={styles.signHint}>{t('signHint')}</div>
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
  const fmt = useAppFormat();

  return (
    <tr className={strong ? styles.priceStrong : undefined}>
      <td>{label}</td>
      <td className={styles.priceValue}>
        {minus && value !== '0' ? '− ' : ''}
        {fmt.money(value)}
      </td>
    </tr>
  );
}
