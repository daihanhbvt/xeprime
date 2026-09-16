'use client';

import { LockOutlined } from '@ant-design/icons';
import { Button } from 'antd';
import { useTranslations } from 'next-intl';
import {
  FEATURE_STATE,
  PLAN_FEATURE_VALUES,
  isFeatureVisible,
  type PlanFeature,
} from '@xeprime/types';
import { useFeatureStates } from '@/hooks/use-feature';
import { useDomainLabel } from '@/i18n/use-domain-label';
import styles from './PlanFeatureList.module.css';

/**
 * "Nâng cấp được thêm gì" — ADR 0027 §Hệ quả gọi đây là **chỗ bán hàng thật sự** của màn
 * "Gói của tôi", và nói rõ nó chỉ thuyết phục khi danh sách viết bằng **ngôn ngữ người dùng**,
 * không phải tên module. Nhãn vì vậy lấy từ nhóm `Domain.planFeature` (dịch cả vi lẫn en), không
 * phải từ khoá cờ.
 *
 * Chỉ liệt kê thứ CHƯA có (`read_only` + `hidden`). Bản trước còn in thêm danh sách "gói hiện
 * tại đang mở" — với một gian hàng đã mua đủ, đó là một cột dấu tích dài chỉ nhắc lại hiện
 * trạng, và nó biến màn quản lý gói thành tờ rơi quảng cáo. Thứ trả lời được một câu hỏi thật
 * ("trả thêm tiền thì được gì") là danh sách còn khoá; không còn gì khoá thì thẻ này biến mất
 * thay vì hiện một dòng tự khen.
 *
 * `read_only` kèm ghi chú *đang chỉ xem* — người dùng phải phân biệt được "chưa bao giờ có" với
 * "có dữ liệu nhưng hết hạn", nếu không họ tưởng sổ cũ đã mất.
 *
 * `onUpgrade` vắng mặt = người xem không có `subscription.purchase` (ADR 0027 điều 2 —
 * `shop_manager` xem được hạn mức nhưng không mua được). Khi đó vẫn liệt kê tính năng còn khoá
 * (họ cần biết vì sao một mục menu vắng), nhưng KHÔNG mời họ bấm vào một luồng API sẽ chặn.
 *
 * KHÔNG còn bọc trong `Card` (16/09/2026): khối này nằm bên trong section "Gói & hạn mức", vốn
 * đã là một thẻ. Một thẻ nữa lồng vào biến một danh sách ba dòng thành một tấm biển quảng cáo
 * to ngang phần nói về gói người dùng đang trả tiền.
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
    <div className={styles.block}>
      <p className={styles.blockTitle}>{t('features.upgrade')}</p>
      <ul className={styles.list}>
        {locked.map((feature) => (
          <li key={feature} className={styles.itemLocked}>
            <LockOutlined className={styles.iconOff} aria-hidden="true" />
            {domainLabel('planFeature', feature)}
            {/* `read_only` = đã có dữ liệu từ kỳ trước; nói ra để không ai tưởng đã mất sổ. */}
            {isFeatureVisible(states[feature] ?? FEATURE_STATE.ENABLED) ? (
              <span className={styles.hint}>· {t('features.readOnlyHint')}</span>
            ) : null}
          </li>
        ))}
      </ul>
      {/* Mở thẳng modal mua gói — người đọc danh sách này đang ở đúng trang đó rồi, một
          link về chính nó là một cú bấm không đi tới đâu. */}
      {onUpgrade ? (
        <Button size="small" onClick={onUpgrade}>
          {t('features.upgradeCta')}
        </Button>
      ) : null}
    </div>
  );
}
