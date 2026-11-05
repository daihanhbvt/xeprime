'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { InfoHint } from '@/components/data-display/InfoHint';
import { useAppFormat } from '@/i18n/use-app-format';
import { cx } from '@/lib/cx';
import { openOverlayOnPlainClick } from '@/lib/modal-link';
import { cardClickOpensDetail, VehicleThumb, type RentalCardVehicle } from './RentalCard';
import styles from './RentalBoardCard.module.css';

/** Một dòng của ô lịch — `hint` là nội dung ⓘ (chi tiết không có chỗ trên thẻ hẹp). */
export interface RentalBoardFact {
  key: string;
  label: string;
  value: ReactNode;
  hint?: { label: string; content: ReactNode } | null;
}

/** Một ô tiền của lưới ba cột (nhãn trên, số dưới). */
export interface RentalBoardMoney {
  key: string;
  label: string;
  amount: string;
  emphasis?: boolean;
}

/**
 * Hàng "Giữ chỗ" — số + viên trạng thái theo CHẶNG (ADR 0044): chưa duyệt là số dự kiến, đã phát QR
 * mà chưa đủ là "Chưa thanh toán", tiền về đủ là "Đã thanh toán".
 */
export interface RentalBoardHold {
  label: string;
  amount: string;
  state: 'expected' | 'unpaid' | 'paid';
  stateLabel: string;
}

interface Props {
  titleId: string;
  busy?: boolean;
  /** Tay nắm kéo thả — vắng khi thẻ không kéo được sang bước kế. */
  handle?: ReactNode;
  /** Mã đơn / "Gửi lúc" — cũng là lối vào chi tiết bằng bàn phím. */
  code: ReactNode;
  /** Viên loại dịch vụ, canh phải dải đầu. */
  chip: ReactNode;
  vehicle: RentalCardVehicle;
  customer: { identity: ReactNode; contacts: ReactNode };
  schedule: readonly RentalBoardFact[];
  money: readonly RentalBoardMoney[];
  hold?: RentalBoardHold | null;
  /** Thanh tiến độ của chuyến đang thuê — cả hàng, ngay trên chân thẻ. */
  progress?: ReactNode;
  /** Đồng hồ / câu tình trạng ở chân thẻ, bên trái. */
  status: ReactNode;
  actions?: ReactNode;
  onOpenDetail?: () => void;
}

/**
 * Khung thẻ chuyến trong CỘT Kanban — Figma Partner-XePrime "_Kanban Item" (`23895:15196` chờ duyệt,
 * `23895:15208` đang thuê; 05/11/2026). Rộng 348, đệm 16, các khối cách 12: dải đầu (tay nắm · mã ·
 * dịch vụ) · xe (ảnh 76×48, biển số + thông số một dòng) · nét đứt · khách (ảnh 32, liên hệ bên phải)
 * · ô lịch nền xám (nhãn 132px) · lưới tiền ba cột · hàng giữ chỗ + viên trạng thái · thanh tiến độ
 * (đang thuê) · chân thẻ (đồng hồ nghiêng trái, nút phải).
 *
 * Cùng nội dung nghiệp vụ với thẻ List (`RentalCard`) — chỉ khác khung. Chi tiết không có chỗ ở đây
 * (ghi chú khách, địa chỉ giao, lộ trình) đi vào ⓘ; lịch xe, mốc xử lý, dải thông tin thêm còn ở List
 * và trang chi tiết (sổ cái §3.2c).
 */
export function RentalBoardCard({
  titleId,
  busy = false,
  handle,
  code,
  chip,
  vehicle,
  customer,
  schedule,
  money,
  hold,
  progress,
  status,
  actions,
  onOpenDetail,
}: Props) {
  const fmt = useAppFormat();
  return (
    <article
      className={cx(styles.card, onOpenDetail && styles.clickable)}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onClick={cardClickOpensDetail(onOpenDetail)}
    >
      <header className={styles.head}>
        <div className={styles.headStart}>
          {handle}
          <span className={styles.code}>{code}</span>
        </div>
        {chip}
      </header>

      <div className={styles.vehicle}>
        <VehicleThumb vehicle={vehicle} className={styles.thumb} />
        <div className={styles.vehicleText}>
          {vehicle.href ? (
            <Link
              id={titleId}
              href={vehicle.href}
              className={styles.vehicleName}
              title={vehicle.name}
              onClick={vehicle.onOpen ? openOverlayOnPlainClick(vehicle.onOpen) : undefined}
            >
              {vehicle.name}
            </Link>
          ) : (
            <span id={titleId} className={styles.vehicleName} title={vehicle.name}>
              {vehicle.name}
            </span>
          )}
          <div className={styles.tags}>
            {vehicle.plateLine ? <span className={styles.plate}>{vehicle.plateLine}</span> : null}
            {vehicle.specs.length > 0 ? (
              <span className={styles.specs} title={vehicle.specs.join(LIST_SEPARATOR)}>
                {vehicle.specs.join(LIST_SEPARATOR)}
              </span>
            ) : null}
          </div>
        </div>
      </div>

      <div className={styles.customer}>
        <div className={styles.customerIdentity}>{customer.identity}</div>
        {customer.contacts}
      </div>

      <dl className={styles.schedule}>
        {schedule.map((fact) => (
          <div key={fact.key} className={styles.fact}>
            <dt className={styles.factLabel}>{fact.label}</dt>
            <dd className={styles.factValue}>
              {fact.value}
              {fact.hint ? (
                <InfoHint
                  label={fact.hint.label}
                  content={fact.hint.content}
                  className={styles.factHint}
                />
              ) : null}
            </dd>
          </div>
        ))}
      </dl>

      {money.length > 0 ? (
        <dl className={styles.money}>
          {money.map((cell) => (
            <div key={cell.key} className={styles.moneyCell}>
              <dt className={styles.moneyLabel}>{cell.label}</dt>
              <dd className={cx(styles.moneyValue, cell.emphasis && styles.moneyEmphasis)}>
                {fmt.money(cell.amount)}
              </dd>
            </div>
          ))}
        </dl>
      ) : null}

      {hold ? (
        <div className={styles.hold}>
          <dl className={styles.moneyCell}>
            <dt className={styles.moneyLabel}>{hold.label}</dt>
            <dd className={styles.moneyValue}>{fmt.money(hold.amount)}</dd>
          </dl>
          <span className={cx(styles.holdChip, styles[hold.state])}>{hold.stateLabel}</span>
        </div>
      ) : null}

      {progress}

      <footer className={styles.foot}>
        <div className={styles.status}>{status}</div>
        {actions ? <div className={styles.actions}>{actions}</div> : null}
      </footer>
    </article>
  );
}

/** Thanh tiến độ 8px của chuyến đang thuê (Figma "Progress bar"). */
export function RentalBoardProgress({
  percent,
  tone,
  label,
}: {
  percent: number;
  tone: 'info' | 'danger';
  label: string;
}) {
  return (
    <span
      className={styles.progress}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={percent}
      aria-label={label}
    >
      <span
        className={cx(styles.progressBar, styles[`progress_${tone}`])}
        // Giá trị chỉ biết lúc chạy — ngoại lệ duy nhất được phép của luật cấm inline style.
        style={{ '--progress': `${percent}%` } as React.CSSProperties}
      />
    </span>
  );
}

/** Danh sách dòng trong nội dung ⓘ — mỗi mục một dòng, nhãn đậm nếu có. */
export function RentalBoardHintList({
  items,
}: {
  items: readonly { key: string; label?: string; text: ReactNode }[];
}) {
  return (
    <ul className={styles.hintList}>
      {items.map((item) => (
        <li key={item.key}>
          {item.label ? <strong>{item.label}: </strong> : null}
          {item.text}
        </li>
      ))}
    </ul>
  );
}
