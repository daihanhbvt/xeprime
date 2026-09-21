'use client';

import {
  ApartmentOutlined,
  CarOutlined,
  CrownFilled,
  EllipsisOutlined,
  FileProtectOutlined,
  IdcardOutlined,
  LineChartOutlined,
  ReconciliationOutlined,
  SafetyOutlined,
  TeamOutlined,
  ToolOutlined,
} from '@ant-design/icons';
import { Button } from 'antd';
import type { ComponentType } from 'react';
import { useTranslations } from 'next-intl';
import {
  FEATURE_STATE,
  PLAN_FEATURE,
  PLAN_FEATURE_VALUES,
  isFeatureVisible,
  type PlanFeature,
} from '@xeprime/types';
import { useFeatureStates } from '@/hooks/use-feature';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './PlanFeatureList.module.css';

/**
 * Biểu tượng của từng năng lực — mỗi ô một hình, không phải chín ổ khoá giống hệt nhau.
 *
 * Chín ô cùng một icon thì icon không còn nói gì và mắt phải đọc hết chín dòng chữ để phân biệt.
 * Bảng khai đủ MỌI cờ trong `PLAN_FEATURE` nên thêm một cờ mới mà quên icon là lỗi biên dịch,
 * không phải một ô trống trên giao diện.
 */
const FEATURE_ICON: Readonly<Record<PlanFeature, ComponentType>> = {
  [PLAN_FEATURE.FINANCE]: LineChartOutlined,
  [PLAN_FEATURE.DEBTS]: ReconciliationOutlined,
  [PLAN_FEATURE.MAINTENANCE]: ToolOutlined,
  [PLAN_FEATURE.MEMBERS]: TeamOutlined,
  [PLAN_FEATURE.BRANCHES]: ApartmentOutlined,
  [PLAN_FEATURE.DRIVERS]: IdcardOutlined,
  [PLAN_FEATURE.CONTRACTS]: FileProtectOutlined,
  [PLAN_FEATURE.ESCROW_HOLD]: SafetyOutlined,
};

/**
 * Số ô NĂNG LỰC in ra, chưa kể ô "không giới hạn xe" mở đầu và ô "còn nữa" khép lại.
 *
 * Bảy để tổng đúng CHÍN — ba hàng ba ô, không có hàng cuối lẻ một ô. Cờ thứ tám trở đi không bị
 * giấu đi: ô cuối nói thẳng là còn nữa, và trang bảng giá liệt kê đủ.
 */
const FEATURE_TILES = 7;

/**
 * "NÂNG CẤP ĐỂ MỞ KHOÁ" — ADR 0027 §Hệ quả gọi đây là **chỗ bán hàng thật sự** của màn "Gói của
 * tôi", và nói rõ nó chỉ thuyết phục khi danh sách viết bằng **ngôn ngữ người dùng**, không phải
 * tên module. Nhãn vì vậy lấy từ nhóm `Domain.planFeature` (dịch cả vi lẫn en), không phải từ
 * khoá cờ.
 *
 * Chỉ liệt kê thứ CHƯA có (`read_only` + `hidden`). Bản trước còn in thêm danh sách "gói hiện
 * tại đang mở" — với một gian hàng đã mua đủ, đó là một cột dấu tích dài chỉ nhắc lại hiện
 * trạng, và nó biến màn quản lý gói thành tờ rơi quảng cáo. Thứ trả lời được một câu hỏi thật
 * ("trả thêm tiền thì được gì") là danh sách còn khoá; không còn gì khoá thì khối này biến mất
 * thay vì hiện một dòng tự khen.
 *
 * `read_only` kèm ghi chú *đang chỉ xem* — người dùng phải phân biệt được "chưa bao giờ có" với
 * "có dữ liệu nhưng hết hạn", nếu không họ tưởng sổ cũ đã mất.
 *
 * `onUpgrade` vắng mặt = người xem không có `subscription.purchase` (ADR 0027 điều 2 —
 * `shop_manager` xem được hạn mức nhưng không mua được), HOẶC luồng nâng cấp đã dựng sẵn ngay
 * bên dưới. Khi đó vẫn liệt kê tính năng còn khoá (họ cần biết vì sao một mục menu vắng), nhưng
 * KHÔNG mời họ bấm vào một luồng API sẽ chặn — hay vào một cú bấm chỉ để cuộn xuống vài trăm px.
 *
 * ## Hai mục KHÔNG phải cờ tính năng
 *
 * "Không giới hạn số xe (tuỳ gói)" đứng đầu vì nó là lý do đổi tuyến rõ nhất, nhưng nó là HẠN
 * MỨC (`limits.maxVehicles`), không phải một cờ trong `PLAN_FEATURE`. "Nhiều tính năng khác…"
 * đứng cuối vì danh sách cờ có thể dài ra mà lưới thì chỉ có chín ô — nói thẳng là còn nữa,
 * đúng hơn là im lặng cắt.
 */
export function PlanFeatureList({ onUpgrade }: { onUpgrade?: () => void }) {
  const t = useTranslations('Subscription');
  const domainLabel = useDomainLabel();
  const states = useFeatureStates();

  const locked: PlanFeature[] = PLAN_FEATURE_VALUES.filter(
    // Cờ vắng trong cache cũ ⇒ coi như đang mở, cùng mặc định "không khoá ai" của `useFeature`.
    (feature) => (states[feature] ?? FEATURE_STATE.ENABLED) !== FEATURE_STATE.ENABLED,
  );

  if (locked.length === 0) return null;

  return (
    <section className={styles.block}>
      <header className={styles.blockHead}>
        <span className={styles.blockIcon} aria-hidden="true">
          <CrownFilled />
        </span>
        <div>
          <h2 className={styles.blockTitle}>{t('features.unlockTitle')}</h2>
          <p className={styles.blockSubtitle}>{t('features.unlockSubtitle')}</p>
        </div>
      </header>

      {/*
        LƯỚI ô, không phải danh sách gạch đầu dòng: tám mục xếp dọc chiếm gần nửa trang và đọc ra
        như một bảng kê thiếu sót. Xếp thành lưới, chúng là một dải NĂNG LỰC lướt mắt qua được
        trong vài giây — đúng vai trò của nó ở đây.
      */}
      <ul className={styles.grid}>
        <li className={styles.item}>
          <span className={styles.itemIcon} aria-hidden="true">
            <CarOutlined />
          </span>
          {t('features.unlockVehicles')}
        </li>
        {locked.slice(0, FEATURE_TILES).map((feature) => {
          const Icon = FEATURE_ICON[feature];
          return (
            <li key={feature} className={styles.item}>
              <span className={styles.itemIcon} aria-hidden="true">
                <Icon />
              </span>
              <span>
                {domainLabel('planFeature', feature)}
                {/* `read_only` = đã có dữ liệu từ kỳ trước; nói ra để không ai tưởng đã mất sổ. */}
                {isFeatureVisible(states[feature] ?? FEATURE_STATE.ENABLED) ? (
                  <span className={styles.hint}> · {t('features.readOnlyHint')}</span>
                ) : null}
              </span>
            </li>
          );
        })}
        <li className={styles.itemMore}>
          <span className={styles.itemIcon} aria-hidden="true">
            <EllipsisOutlined />
          </span>
          {t('features.unlockMore')}
        </li>
      </ul>

      {/* Mở thẳng modal mua gói — người đọc danh sách này đang ở đúng trang đó rồi, một
          link về chính nó là một cú bấm không đi tới đâu. */}
      {onUpgrade ? (
        <Button size="small" onClick={onUpgrade}>
          {t('features.upgradeCta')}
        </Button>
      ) : null}
    </section>
  );
}
