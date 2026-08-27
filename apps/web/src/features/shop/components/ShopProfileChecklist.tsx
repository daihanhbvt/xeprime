'use client';

import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import { Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { useWatch, type Control } from 'react-hook-form';
import {
  missingShopProfileRequirements,
  missingShopProfileSuggestions,
  SHOP_PROFILE_REQUIREMENT_VALUES,
  SHOP_PROFILE_SUGGESTION_VALUES,
  type ShopProfileRequirement,
  type ShopProfileSuggestion,
} from '@xeprime/types';
import type { ShopProfileValues } from '@xeprime/validators';
import styles from './ShopProfileChecklist.module.css';

type ChecklistItem = ShopProfileRequirement | ShopProfileSuggestion;

/**
 * "Hoàn thiện hồ sơ" trước đây không có định nghĩa nào cả.
 *
 * Chủ gian hàng mới được bảo là hãy hoàn thiện hồ sơ rồi gửi duyệt, nhưng không đâu nói hoàn
 * thiện gồm những gì — mọi ô đều tuỳ chọn ở API, và nút Gửi duyệt sáng ngay cả khi hai ô bắt
 * buộc còn trống. Thẻ này là bản kiểm kê đó, chia đúng theo HỆ QUẢ: nhóm trên chặn gửi duyệt,
 * nhóm dưới thì không.
 *
 * Đọc giá trị ĐANG NHẬP (`useWatch`) chứ không phải hồ sơ đã lưu, vì nút Gửi duyệt lưu nốt thay
 * đổi còn dở trước khi gửi — nếu thẻ này đọc bản đã lưu thì người vừa gõ xong tên vẫn thấy mục
 * đó đỏ, và họ sẽ không tin bảng này nữa. `useWatch` cũng khoanh việc render lại vào riêng thẻ
 * này, thay vì cả trang hồ sơ nhấp nháy theo từng phím gõ.
 *
 * Cố ý KHÔNG có nút "Điền" nhảy tới từng ô: cách duy nhất để nhảy được là nối `ref` của RHF vào
 * `SelectField`/`ImageUploadField`, và rule `react-hooks/refs` coi mọi truy cập `field.*` sau đó
 * là đọc ref trong lúc render — cả hai primitive dùng chung sẽ phải mang `eslint-disable`. Bảng
 * này nằm ngay trên chính form chứa các ô đó, còn nút Gửi duyệt thì tự đưa con trỏ tới ô thiếu
 * đầu tiên; một nút "Điền" chết ở ba dòng còn tệ hơn là không có nút nào.
 */
export function ShopProfileChecklist({ control }: { control: Control<ShopProfileValues> }) {
  const t = useTranslations('Shop.checklist');
  const values = useWatch({ control }) as Partial<ShopProfileValues>;

  const missingRequired = new Set<string>(missingShopProfileRequirements(values));
  const missingSuggested = new Set<string>(missingShopProfileSuggestions(values));

  const total = SHOP_PROFILE_REQUIREMENT_VALUES.length + SHOP_PROFILE_SUGGESTION_VALUES.length;
  const done = total - missingRequired.size - missingSuggested.size;
  const ready = missingRequired.size === 0;

  return (
    <section className={styles.card} aria-labelledby="shop-checklist-title">
      <header className={styles.head}>
        <h2 className={styles.title} id="shop-checklist-title">
          {t('title')}
        </h2>
        <div className={styles.progress}>
          <Progress
            type="circle"
            size={40}
            percent={Math.round((done / total) * 100)}
            format={() => `${done}/${total}`}
            strokeColor={ready ? 'var(--xp-color-success)' : undefined}
          />
        </div>
      </header>

      <Group
        label={ready ? t('requiredDone') : t('requiredTitle')}
        tone={ready ? 'done' : 'required'}
        items={SHOP_PROFILE_REQUIREMENT_VALUES}
        missing={missingRequired}
      />
      <Group
        label={t('suggestedTitle')}
        tone="suggested"
        items={SHOP_PROFILE_SUGGESTION_VALUES}
        missing={missingSuggested}
      />
    </section>
  );
}

function Group({
  label,
  tone,
  items,
  missing,
}: {
  label: string;
  tone: 'required' | 'suggested' | 'done';
  items: readonly ChecklistItem[];
  missing: ReadonlySet<string>;
}) {
  const t = useTranslations('Shop.checklist');

  return (
    <div className={styles.group}>
      <p className={tone === 'done' ? styles.groupLabelDone : styles.groupLabel}>{label}</p>
      <ul className={styles.list}>
        {items.map((item) => {
          const isMissing = missing.has(item);
          return (
            <li key={item} className={isMissing ? styles.row : styles.rowDone}>
              {isMissing ? (
                <MinusCircleOutlined
                  className={tone === 'suggested' ? styles.iconMuted : styles.iconTodo}
                  aria-hidden="true"
                />
              ) : (
                <CheckCircleFilled className={styles.iconDone} aria-hidden="true" />
              )}
              <span className={styles.label}>{t(`items.${item}`)}</span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
