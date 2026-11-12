'use client';

import { CarOutlined } from '@ant-design/icons';
import Link from 'next/link';
import type { MouseEvent, ReactNode } from 'react';
import { LIST_SEPARATOR } from '@xeprime/domain';
import { LineIcon } from '@/components/icons/LineIcon';
import { cx } from '@/lib/cx';
import { openOverlayOnPlainClick } from '@/lib/modal-link';
import styles from './RentalCard.module.css';

export interface RentalCardVehicle {
  name: string;
  imageUrl: string | null | undefined;
  /** "4 chỗ · Số tự động · Điện" — từng mảnh, đã dịch. */
  specs: readonly string[];
  /** Mã nội bộ · biển số. */
  plateLine: string | null;
  /** Hồ sơ xe — `null` khi người xem không có quyền xem xe (chữ thường, không link 403). */
  href: string | null;
  /** Bấm thường mở hồ sơ xe dạng overlay; Ctrl/⌘-click vẫn mở tab mới tới `href`. */
  onOpen?: () => void;
  /** Lịch của chính chiếc xe (link thật, cả màn hình) — vắng khi không có quyền xem xe. */
  schedule?: { href: string; label: string; ariaLabel: string } | null;
  noImageLabel: string;
}

/**
 * `list` — thẻ ngang của dạng List (`RentalCard`). `board` — thẻ dọc trong cột Kanban
 * (`RentalBoardCard`, Figma `23895:15181`). Cùng nội dung nghiệp vụ, hai khung.
 */
export type RentalCardLayout = 'list' | 'board';

interface Props {
  titleId: string;
  busy?: boolean;
  /** Dải đầu: dấu vết bên trái (mã · dịch vụ · mốc), đồng hồ + nút bên phải. */
  meta: ReactNode;
  aside: ReactNode;
  /** Câu trạng thái cả chiều ngang dưới dải đầu — chỉ khi có. */
  notice?: ReactNode;
  vehicle: RentalCardVehicle;
  /** Vùng khách: nhãn + danh tính + nút liên hệ. */
  customer: ReactNode;
  schedule: ReactNode;
  /** Ô tiền — vắng khi chưa có số nào nói được (dài hạn chưa chốt lịch…). */
  payment?: ReactNode;
  extras?: ReactNode;
  extrasLabel?: string;
  /**
   * Bấm vào THẺ (chỗ trống, không trúng link/nút) mở chi tiết — design: "nhấn vào thẻ để xem chi
   * tiết đơn hàng". Bàn phím dùng nút ở dải đầu (`RentalCardDetailButton`), không phải cả thẻ.
   */
  onOpenDetail?: () => void;
}

/** Phần tử tương tác bên trong thẻ — bấm vào chúng KHÔNG mở chi tiết. */
const INTERACTIVE = 'a, button, input, textarea, select, label, [role="button"], [role="menuitem"]';

/**
 * Bấm vào chỗ TRỐNG của thẻ mở chi tiết — chung cho thẻ List lẫn thẻ Kanban. Bấm trúng link/nút/ô nhập
 * là việc của chính nó; chọn chữ để sao chép cũng không mở gì.
 */
export function cardClickOpensDetail(onOpenDetail: (() => void) | undefined) {
  return (event: MouseEvent<HTMLElement>) => {
    if (!onOpenDetail) return;
    const target = event.target as HTMLElement;
    if (target.closest(INTERACTIVE)) return;
    if (window.getSelection()?.toString()) return;
    onOpenDetail();
  };
}

/**
 * Khung MỘT thẻ chuyến của màn "Đơn thuê xe" gộp (Figma `23978:92713`, 05/11/2026) — một khuôn cho
 * cả YÊU CẦU (`BookingRequestCard`) lẫn ĐƠN (`BookingCard`). Khung không biết nghiệp vụ: nơi dùng
 * quyết nội dung dải đầu, hai ô và hành động; khung chỉ giữ bố cục, ảnh xe và lối vào chi tiết.
 */
export function RentalCard({
  titleId,
  busy = false,
  meta,
  aside,
  notice,
  vehicle,
  customer,
  schedule,
  payment,
  extras,
  extrasLabel,
  onOpenDetail,
}: Props) {
  return (
    <article
      className={cx(styles.card, onOpenDetail && styles.clickable)}
      aria-labelledby={titleId}
      aria-busy={busy || undefined}
      onClick={cardClickOpensDetail(onOpenDetail)}
    >
      <header className={styles.head}>
        <div className={styles.headMeta}>{meta}</div>
        <div className={styles.headAside}>{aside}</div>
      </header>

      {notice ? <p className={styles.notice}>{notice}</p> : null}

      <div className={styles.body}>
        <div className={styles.vehicle}>
          <div className={styles.vehicleRow}>
            <VehicleThumb vehicle={vehicle} />
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
                <span id={titleId} className={styles.vehicleNamePlain} title={vehicle.name}>
                  {vehicle.name}
                </span>
              )}
              {vehicle.specs.length > 0 ? (
                <p className={styles.specs}>{vehicle.specs.join(LIST_SEPARATOR)}</p>
              ) : null}
              {vehicle.plateLine ? <span className={styles.plate}>{vehicle.plateLine}</span> : null}
            </div>
          </div>
          {vehicle.schedule ? (
            <Link
              href={vehicle.schedule.href}
              className={styles.scheduleLink}
              aria-label={vehicle.schedule.ariaLabel}
            >
              <LineIcon name="calendar-sm" className={styles.linkIcon} />
              {vehicle.schedule.label}
            </Link>
          ) : null}
        </div>

        <div className={styles.customer}>{customer}</div>

        <section className={cx(styles.panel, styles.schedulePanel)}>{schedule}</section>

        {payment ? (
          <section className={cx(styles.panel, styles.paymentPanel)}>{payment}</section>
        ) : null}
      </div>

      {extras ? (
        <div className={styles.extras} aria-label={extrasLabel}>
          {extras}
        </div>
      ) : null}
    </article>
  );
}

/**
 * Ảnh xe tỉ lệ cố định. Link ảnh `aria-hidden` + `tabIndex={-1}`: nó trỏ cùng chỗ với link tên bên
 * cạnh, để cả hai lộ ra là bắt người dùng bàn phím Tab hai lần qua một đích.
 */
export function VehicleThumb({
  vehicle,
  className = styles.thumb,
}: {
  vehicle: RentalCardVehicle;
  /** Lớp khung ảnh (cỡ + bo góc) — thẻ Kanban dùng ảnh nhỏ hơn. */
  className?: string;
}) {
  const inner = vehicle.imageUrl ? (
    // eslint-disable-next-line @next/next/no-img-element
    <img className={styles.thumbImage} src={vehicle.imageUrl} alt="" loading="lazy" />
  ) : (
    <span className={styles.thumbFallback} title={vehicle.noImageLabel}>
      <CarOutlined aria-hidden="true" />
    </span>
  );
  if (!vehicle.href) return <span className={className}>{inner}</span>;
  return (
    <Link
      href={vehicle.href}
      className={className}
      aria-hidden="true"
      tabIndex={-1}
      onClick={vehicle.onOpen ? openOverlayOnPlainClick(vehicle.onOpen) : undefined}
    >
      {inner}
    </Link>
  );
}

/** Nút chữ ở dải đầu mở chi tiết — lối vào bằng bàn phím của "bấm vào thẻ". */
export function RentalCardDetailButton({
  onClick,
  ariaLabel,
  children,
}: {
  onClick: () => void;
  ariaLabel: string;
  children: ReactNode;
}) {
  return (
    <button type="button" className={styles.detailButton} onClick={onClick} aria-label={ariaLabel}>
      {children}
    </button>
  );
}

/** Mốc phụ ở dải đầu ("Gửi lúc …"). */
export function RentalCardStamp({ children }: { children: ReactNode }) {
  return <span className={styles.stamp}>{children}</span>;
}

/** Danh sách "nhãn — giá trị" của một ô. `money` = cột số canh phải. */
export function RentalFacts({ children }: { children: ReactNode }) {
  return <dl className={styles.facts}>{children}</dl>;
}

export function RentalFact({
  label,
  money = false,
  emphasis = false,
  children,
}: {
  label: string;
  money?: boolean;
  emphasis?: boolean;
  children: ReactNode;
}) {
  return (
    <div className={money ? styles.factMoney : styles.fact}>
      <dt className={styles.factLabel}>{label}</dt>
      <dd className={cx(styles.factValue, emphasis && styles.factEmphasis)}>{children}</dd>
    </div>
  );
}

/** Dòng chú thích nhỏ cuối một ô ("Tạm tính", nguyện vọng ngày nhận…). */
export function RentalPanelNote({ children }: { children: ReactNode }) {
  return <p className={styles.panelNote}>{children}</p>;
}
