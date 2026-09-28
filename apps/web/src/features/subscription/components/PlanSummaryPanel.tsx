'use client';

import {
  AppstoreOutlined,
  ClockCircleOutlined,
  CrownFilled,
  PercentageOutlined,
} from '@ant-design/icons';
import { Alert, Button } from 'antd';
import type { ReactNode } from 'react';
import { useTranslations } from 'next-intl';
import {
  BILLING_MODE,
  BILLING_PHASE,
  VEHICLE_TYPE,
  type BillingPhase,
  type VehicleType,
} from '@xeprime/types';
import { nowInAppTz, toAppTz } from '@/lib/datetime';

import { VEHICLE_TYPE_ICON } from '@/components/data-display/VehicleTypeIcon';
import { useTenantScope } from '@/hooks/use-tenant-scope';
import { cx } from '@/lib/cx';

import type { MySubscription } from '../types';
import styles from './PlanSummaryPanel.module.css';

/** Trên ngưỡng này thì ô hạn mức chuyển sang cảnh báo — còn chỗ, nhưng sắp hết. */
const NEAR_LIMIT_RATIO = 0.8;

/** Dưới mốc này thì ô thời hạn chuyển sang cảnh báo: còn một tuần là lúc nên nhắc. */
const TERM_WARNING_DAYS = 7;

/**
 * GÓI HIỆN HÀNH — tên gói, thời hạn, ba con số về đội xe, và những gì còn khoá.
 *
 * ## Màu theo MỨC DÙNG, không theo cảm giác
 *
 * Dưới 80% là trung tính — còn chỗ thì không có gì để báo động. 80–99% là cảnh báo. Đủ 100% là
 * cảnh báo ĐẬM nhưng vẫn không phải màu lỗi: dùng hết chỗ đã mua là một trạng thái hợp lệ của
 * gói, không phải một sự cố. Đỏ để dành cho thứ hỏng thật.
 *
 * ## Vì sao không in `commissionPercent` của gói
 *
 * Phí dịch vụ thật tính từ `fee_policies.serviceFeePercent` lúc tạo đơn (`resolveHoldAllocation`),
 * còn con số trên dòng thuê bao là một knob riêng được chụp lại lúc gán. Không có ràng buộc nào
 * buộc hai số đó bằng nhau (ADR 0029 điều 2), nên in nó ra là hứa một tỉ lệ hệ thống không giữ.
 *
 * ## Vì sao tuyến HOA HỒNG không có nút ở đây
 *
 * Lối nâng cấp của họ là cả một luồng ba bước nằm NGAY DƯỚI khối này (`PackageUpgradeWizard`),
 * với bảng giá mở sẵn. Thêm một nút "nâng cấp" ở đầu trang là một cú bấm chỉ để cuộn xuống thứ
 * đang hiện trong cùng khung nhìn. Tuyến GÓI thì ngược lại: màn mua của họ là một hộp thoại, nên
 * nút ở đây là đường vào duy nhất.
 */
export function PlanSummaryPanel({
  data,
  canPurchase,
  upgrading,
  framed = false,
  onPurchase,
}: {
  data: MySubscription;
  /** Quyền `subscription.purchase`. Thiếu ⇒ KHÔNG dựng CTA nào dẫn vào luồng API sẽ chặn. */
  canPurchase: boolean;
  /**
   * Màn NÂNG CẤP đang dựng ngay dưới khối này (chủ xe tuyến hoa hồng).
   *
   * Đến từ nơi gọi chứ KHÔNG suy từ `currentPlan.billingMode` ở đây, dù nó có sẵn: một gian hàng
   * hết gói cũng mang gói hoa hồng ở `currentPlan` nhưng vẫn là khách cũ cần gia hạn bằng hộp
   * thoại (ADR 0040 điều 4). Hai câu hỏi khác nhau, và chỉ nơi gọi biết nó vừa dựng màn nào.
   */
  upgrading: boolean;
  /**
   * Tự vẽ thẻ trắng quanh khối.
   *
   * Trang `/account/subscription` dùng khối này như một thẻ độc lập; trang Cửa hàng nhúng nó vào
   * trong `ShopSectionCard` và khi đó khung thứ hai là hai lớp viền cho cùng một nội dung.
   */
  framed?: boolean;
  onPurchase: () => void;
}) {
  const t = useTranslations('Subscription');
  const { tenant } = useTenantScope();

  const { currentPlan, usage, fleetQuota } = data;
  const isCommission = currentPlan?.billingMode === BILLING_MODE.COMMISSION;
  /*
   * PHA đọc từ server (`/auth/me`), không suy từ `endsAt` bằng đồng hồ máy khách: `current` và
   * `grace` có cùng một `endsAt` trong quá khứ nhưng khác nhau ở toàn bộ quyền dùng Manage, và
   * chỉ server biết `graceDays` của gói là bao nhiêu (ADR 0038 điều 1).
   */
  const phase = (tenant?.billingPhase ?? null) as BillingPhase | null;
  const serviceFeePercent = tenant?.serviceFeePercent ?? null;

  return (
    <section className={cx(styles.panel, framed && styles.framed)}>
      <header className={styles.head}>
        <span className={styles.planIcon} aria-hidden="true">
          <CrownFilled />
        </span>
        <div className={styles.headText}>
          <h2 className={styles.planName}>
            {currentPlan ? currentPlan.planName : t('current.none')}
            {currentPlan ? <span className={styles.activeTag}>{t('current.activeTag')}</span> : null}
          </h2>
          <p className={styles.planMeta}>
            {currentPlan
              ? isCommission
                ? t('current.commissionSummary')
                : t('current.packageSummary')
              : t('current.noneHint')}
          </p>
        </div>

        <div className={styles.headSide}>
          {currentPlan ? <TermPill endsAt={currentPlan.endsAt} phase={phase} /> : null}
          {canPurchase && !upgrading ? (
            <Button type="primary" onClick={onPurchase}>
              {currentPlan ? t('current.renewButton') : t('current.purchaseButton')}
            </Button>
          ) : null}
        </div>
      </header>

      <div className={styles.tiles}>
        {/*
          MỘT ô trần cho cả đội xe (ADR 0041 điều 4) — cả hai tuyến đếm TỔNG ô tô + xe máy. Hai
          ô theo loại bên cạnh nó chỉ nói MỨC DÙNG, không mang trần nào: viết trần tổng vào ô
          của từng loại là màn hình nói "3 ô tô" trong khi backend chặn ở "3 xe", và chủ xe sẽ
          đăng đủ 3 ô tô rồi ngạc nhiên vì chiếc xe máy đầu tiên bị từ chối.
        */}
        <QuotaTile used={fleetQuota.totalUsed} limit={fleetQuota.totalLimit} />
        <CountTile
          label={t('usage.car')}
          icon={VEHICLE_TYPE_ICON[VEHICLE_TYPE.CAR]}
          value={usage.car.used}
        />
        <CountTile
          label={t('usage.motorbike')}
          icon={VEHICLE_TYPE_ICON[VEHICLE_TYPE.MOTORBIKE]}
          value={usage.motorbike.used}
        />
        {/*
          PHÍ DỊCH VỤ đọc từ CHÍNH SÁCH PHÍ hiệu lực (`/auth/me`), KHÔNG từ `commissionPercent`
          của gói: hai con số đó không bị ràng buộc phải bằng nhau (ADR 0029 điều 2), và thứ thật
          sự trừ vào tiền chủ xe là con số của chính sách. Tuyến gói không thu gì trên chuyến nên
          ô này vắng mặt thay vì hiện "0%".
        */}
        {serviceFeePercent != null ? (
          <CountTile
            label={t('usage.serviceFee')}
            icon={PercentageOutlined}
            value={t('usage.serviceFeeValue', { percent: serviceFeePercent })}
          />
        ) : null}
      </div>

      <QuotaWarning fleetQuota={fleetQuota} />
    </section>
  );
}

/**
 * THỜI HẠN GÓI — một viên nhãn hai dòng ở góc phải tiêu đề.
 *
 * Số ngày tính bằng đồng hồ máy khách và đó là chấp nhận được ở ĐÂY — nó chỉ là một con số để
 * đọc. Thứ quyết định quyền dùng (`billingPhase`) thì đọc từ server; máy lệch giờ làm con số
 * lệch một ngày, không làm ai mất tính năng.
 */
function TermPill({ endsAt, phase }: { endsAt: string; phase: BillingPhase | null }) {
  const t = useTranslations('Subscription');
  const daysLeft = toAppTz(endsAt).diff(nowInAppTz(), 'day');

  const lapsed = phase === BILLING_PHASE.LAPSED;
  const grace = phase === BILLING_PHASE.GRACE;
  const tone = lapsed || grace || daysLeft <= TERM_WARNING_DAYS ? 'near' : 'ok';

  return (
    <div className={styles.termPill} data-tone={tone}>
      <span className={styles.termPillLabel}>
        <ClockCircleOutlined aria-hidden="true" />
        {t('term.pillLabel')}
      </span>
      <span className={styles.termPillValue}>
        {lapsed
          ? t('term.lapsed')
          : grace
            ? t('term.grace')
            : t('term.daysLeft', { days: Math.max(0, daysLeft) })}
      </span>
    </div>
  );
}

/**
 * Ô HẠN MỨC: `đã dùng / trần`, một dòng phụ, và một thanh mảnh.
 *
 * `limit == null` = không giới hạn ⇒ KHÔNG vẽ thanh: một thanh 0% cho thứ không có trần là hình
 * ảnh nói ngược với con chữ bên cạnh nó.
 */
function QuotaTile({ used, limit }: { used: number; limit: number | null }) {
  const t = useTranslations('Subscription');
  const ratio = limit && limit > 0 ? used / limit : 0;
  const tone = limit == null ? 'ok' : ratio >= 1 ? 'full' : ratio >= NEAR_LIMIT_RATIO ? 'near' : 'ok';

  return (
    <div className={cx(styles.tile, styles.tileQuota)} data-tone={tone}>
      <p className={styles.tileLabel}>
        {t('usage.fleetTotal')}
        <AppstoreOutlined className={styles.tileIcon} aria-hidden="true" />
      </p>
      <p className={styles.tileValue}>
        <span className={styles.tileNumber}>{limit == null ? used : `${used}/${limit}`}</span>
        <span className={styles.tileSub}>
          {limit == null ? t('usage.unlimited') : t('usage.fleetLimitSub')}
        </span>
      </p>
      {limit != null && limit > 0 ? (
        <span className={styles.meter} aria-hidden="true">
          {/*
            Ngoại lệ DUY NHẤT của luật cấm inline style (CLAUDE.md mục 5): bề rộng chỉ biết được
            lúc chạy. Nó đi qua một CSS custom property, không phải một thuộc tính trình bày.
          */}
          <span
            className={styles.meterFill}
            style={
              { '--xp-meter': `${Math.min(100, Math.round(ratio * 100))}%` } as React.CSSProperties
            }
          />
        </span>
      ) : null}
    </div>
  );
}

/**
 * Ô ĐẾM: một nhãn, một icon, một con số. Không có trần, nên không có thanh.
 *
 * Tách khỏi `QuotaTile` thay vì truyền `limit={null}`: hai ô trả lời hai câu hỏi khác nhau
 * ("còn bao nhiêu suất" ↔ "đang có mấy chiếc"), và một tham số null-able ở giữa là chỗ để ai đó
 * sau này truyền một con số vào và dựng lại đúng cái trần-theo-loại mà ADR 0041 vừa gỡ.
 */
function CountTile({
  label,
  icon: Icon,
  value,
}: {
  label: string;
  /** Lấy thẳng kiểu từ bảng icon dùng chung — một chữ ký hẹp hơn sẽ từ chối chính bảng đó. */
  icon: (typeof VEHICLE_TYPE_ICON)[VehicleType];
  /** Số xe, hoặc một chuỗi đã định dạng sẵn ("10% / chuyến"). */
  value: ReactNode;
}) {
  return (
    <div className={styles.tile}>
      <p className={styles.tileLabel}>
        {label}
        <Icon className={styles.tileIcon} aria-hidden />
      </p>
      <p className={styles.tileValue}>
        {/*
          Một CON SỐ đọc được ở cỡ lớn; một chuỗi đã định dạng ("10% / chuyến") thì không — ở cỡ
          đó nó tràn ô và nặng hơn cả con số nó đứng cạnh. Phân biệt theo KIỂU dữ liệu thay vì
          thêm một prop cờ: nơi gọi truyền số thì được cỡ số, truyền chữ thì được cỡ chữ.
        */}
        <span className={typeof value === 'number' ? styles.tileNumber : styles.tileText}>
          {value}
        </span>
      </p>
    </div>
  );
}

/**
 * Một dòng cảnh báo khi đã dùng hết trần — và chỉ khi đó.
 *
 * Alert full-width chỉ xuất hiện khi có việc phải làm. Còn chỗ trống thì các ô số ở trên đã nói
 * đủ, và một dải "mọi thứ đều ổn" đứng thường trực chỉ dạy người dùng bỏ qua vùng đó.
 *
 * Câu chữ đi theo `reason`: chạm trần của bậc ĐÃ MUA thì việc cần làm là nâng bậc; chạm trần
 * Owner Lite thì là mua gói. Một câu chung cho cả hai sẽ mời một gian hàng đang trả tiền đi
 * "mua gói" mà họ đã có.
 */
function QuotaWarning({ fleetQuota }: { fleetQuota: MySubscription['fleetQuota'] }) {
  const t = useTranslations('Subscription');

  const limit = fleetQuota.totalLimit;
  if (limit == null || limit <= 0 || fleetQuota.totalUsed < limit) return null;

  return (
    <Alert
      type="warning"
      showIcon
      className={styles.warning}
      title={t('usage.atLimitTotal', { limit })}
      description={
        fleetQuota.reason === 'plan' ? t('usage.atLimitUpgrade') : t('usage.atLimitBuyPlan')
      }
    />
  );
}
