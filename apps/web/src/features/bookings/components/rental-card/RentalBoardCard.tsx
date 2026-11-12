'use client';

import type { Dayjs } from 'dayjs';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { useState, type ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { InfoHint } from '@/components/data-display/InfoHint';
import { LineIcon } from '@/components/icons/LineIcon';
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

/** Một ô tiền của hàng tiền (nhãn trên, số dưới). */
export interface RentalBoardMoney {
  key: string;
  label: string;
  amount: string;
  emphasis?: boolean;
}

/**
 * Trạng thái tiền giữ chỗ theo CHẶNG (ADR 0044) — viên ở góc phải dải đầu: chưa duyệt là số dự
 * kiến, đã phát QR mà chưa đủ là "Chưa thanh toán", tiền về đủ là "Đã thanh toán". Design ghi
 * "Chưa cọc" — khoản QR là tiền giữ chỗ, không phải cọc (ADR 0044 điều 9). Số tiền nằm ở ô "Giữ
 * chỗ" của hàng tiền.
 */
export interface RentalBoardHold {
  label: string;
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
  /** Số vàng lớn ở góc phải dải đầu — tổng khách trả (ô đầu của hàng tiền). */
  total?: RentalBoardMoney | null;
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
 * Khung thẻ chuyến GỌN — cột Kanban trên máy tính và danh sách trên điện thoại. Figma Partner-XePrime
 * "_Kanban Items" (`24117:72641` mở, `24117:72841` thu gọn; 10/11/2026 bản 2, thay `23895:15196`
 * của 05/11). Đệm 16, các khối cách 12:
 *
 * - dải đầu hai hàng, gạch dưới: (tay nắm · mã | viên giữ chỗ) rồi (viên dịch vụ | tổng khách trả);
 * - xe (ảnh 76×48, biển số + thông số một dòng) + mũi tên MỞ/THU ở bên phải;
 * - phần THU GỌN được (mặc định thu — chốt 10/11): khách (ảnh 32, liên hệ bên phải) · nét đứt ·
 *   MỘT hàng tiền ba ô có vạch ngăn (giữ chỗ · thu khi giao xe · cộng ví);
 * - ô lịch nền xám LUÔN hiện: nhận → trả trên một dòng, nơi đổi tay (nhãn theo hình thức);
 * - thanh tiến độ (đang thuê) · chân thẻ (câu tình trạng nghiêng trái, nút phải).
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
  total,
  money,
  hold,
  progress,
  status,
  actions,
  onOpenDetail,
}: Props) {
  const fmt = useAppFormat();
  const t = useTranslations('Bookings.board.kanban');
  const [expanded, setExpanded] = useState(false);
  const moreId = `${titleId}-more`;
  return (
    <article
      className={cx(styles.card, onOpenDetail && styles.clickable)}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onClick={cardClickOpensDetail(onOpenDetail)}
    >
      {/* Vỏ `article` là container đo bề rộng; ruột mang đệm để thẻ hẹp bớt được đệm (CSS). */}
      <div className={styles.body}>
        <header className={styles.head}>
          <div className={styles.headRow}>
            <div className={styles.headStart}>
              {handle}
              <span className={styles.code}>{code}</span>
            </div>
            {hold ? (
              <span className={cx(styles.holdChip, styles[hold.state])}>
                <span className={styles.srOnly}>{hold.label}: </span>
                {hold.stateLabel}
              </span>
            ) : null}
          </div>
          <div className={styles.headRow}>
            {chip}
            {total ? (
              <p className={styles.total}>
                <span className={styles.srOnly}>{total.label}: </span>
                {fmt.money(total.amount)}
              </p>
            ) : null}
          </div>
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
          <button
            type="button"
            className={cx(styles.toggle, expanded && styles.toggleOpen)}
            aria-expanded={expanded}
            aria-controls={moreId}
            aria-label={expanded ? t('collapse') : t('expand')}
            onClick={() => setExpanded((open) => !open)}
          >
            <LineIcon name="chevron-down" className={styles.toggleIcon} />
          </button>
        </div>

        {/*
        Phần thu gọn được: khách + hàng tiền (design 10/11 bản 2). Luôn nằm trong DOM (chiều cao
        trượt mượt như AntD Collapse); lúc thu thì `inert` — không lấy được focus, trình đọc màn
        hình bỏ qua.
      */}
        <div id={moreId} className={cx(styles.more, expanded && styles.moreOpen)} inert={!expanded}>
          <div className={styles.moreInner}>
            <div className={styles.customer}>
              <div className={styles.customerIdentity}>{customer.identity}</div>
              {customer.contacts}
            </div>

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
          </div>
        </div>

        {/* Ô lịch LUÔN hiện: khung giờ nhận → trả và nơi đổi tay — hai điều người trực cần trước. */}
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

        {progress}

        <footer className={styles.foot}>
          <div className={styles.status}>{status}</div>
          {actions ? <div className={styles.actions}>{actions}</div> : null}
        </footer>
      </div>
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

/**
 * "T4, 21/10  13h00 → T5, 22/10  13h00" — MỘT dòng của ô lịch (design 10/11 bản 2). Thẻ hẹp hơn
 * design (cột Kanban trên màn ≤1440, thẻ ~300px) không chứa nổi bản đầy đủ ở cỡ chữ 14 dù bớt hết
 * đệm (đo 10/11: nhãn 57 + khung giờ 215 > 270 chỗ trống), nên ở đó ẩn phần THỨ (container query
 * `.weekday`) để vẫn một dòng; mỗi mốc không bẻ dòng, bất đắc dĩ chỉ xuống dòng ở mũi tên.
 */
export function RentalBoardPeriod({ from, to }: { from: Dayjs; to: Dayjs }) {
  const fmt = useAppFormat();
  const start = fmt.rentalPointParts(from);
  const end = fmt.rentalPointParts(to);
  return (
    <span className={styles.period}>
      <span className={styles.periodPoint}>
        <span className={styles.weekday}>{start.weekday}</span>
        {start.rest}
      </span>
      <span className={styles.periodPoint}>
        {'→ '}
        <span className={styles.weekday}>{end.weekday}</span>
        {end.rest}
      </span>
    </span>
  );
}

/**
 * Địa chỉ gọn trên MỘT dòng của ô lịch — dài quá thì chỉ xuống dòng ở DẤU PHẨY, không bao giờ bẻ
 * giữa tên phường/xã ("Hòa | Xuân"). Đoạn đầu (số nhà, đường) vẫn tự bẻ được để không tràn thẻ.
 */
export function RentalBoardAddress({ text }: { text: string }) {
  const segments = text.split(', ');
  const last = segments.length - 1;
  return (
    <span>
      {segments.map((segment, index) => {
        // Dấu phẩy dính vào đoạn TRƯỚC, khoảng trắng nằm ngoài — dòng mới không mở bằng ", ".
        const piece = index < last ? `${segment},` : segment;
        return index === 0 ? (
          piece
        ) : (
          <span key={index}>
            {' '}
            <span className={styles.periodPoint}>{piece}</span>
          </span>
        );
      })}
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
