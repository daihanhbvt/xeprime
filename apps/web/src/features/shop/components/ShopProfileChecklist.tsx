'use client';

import { CheckCircleFilled, MinusCircleOutlined } from '@ant-design/icons';
import { Progress } from 'antd';
import { useTranslations } from 'next-intl';
import { useWatch, type Control } from 'react-hook-form';
import {
  missingShopProfileRequirements,
  missingShopProfileSuggestions,
  SHOP_PROFILE_REQUIREMENT_VALUES,
  SHOP_PROFILE_SUGGESTION,
  SHOP_PROFILE_SUGGESTION_VALUES,
  type ShopProfileRequirement,
  type ShopProfileSuggestion,
} from '@xeprime/types';
import type { ShopProfileValues } from '@xeprime/validators';
import type { ShopOwnerAccount } from '../types';
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
export function ShopProfileChecklist({
  control,
  ownerAccount,
  logoRequired = false,
}: {
  control: Control<ShopProfileValues>;
  /**
   * Logo là mục CHẶN, không phải gợi ý — đúng với gian hàng TUYẾN GÓI (ADR 0040 điều 7).
   *
   * Với họ, thiếu logo là `submitForPublicReview` từ chối thật
   * (`SHOP_LISTING_REQUIREMENTS_MISSING`). Để nó ở nhóm "Nên có — giúp khách chọn gian hàng của
   * bạn" là đúng thứ docblock của `missingShopProfileRequirements` viết ra để chặn, chỉ đảo
   * chiều: checklist nói "không bắt buộc" trong khi server chặn.
   *
   * Chủ xe tuyến hoa hồng KHÔNG bị cổng đó chạm tới, nên với họ logo vẫn là gợi ý — mặc định
   * `false` giữ nguyên hành vi cũ ở `/account/registration`.
   *
   * Năm mục còn lại của cổng đăng xe (tên · SĐT liên hệ · tỉnh · xã · địa chỉ) KHÔNG xuất hiện
   * ở đây: SĐT liên hệ sống trên CHI NHÁNH MẶC ĐỊNH, không phải trên form này, nên chấm nó bằng
   * `useWatch` là chấm một ô không tồn tại. Bước 1 của onboarding đã đòi đủ cả năm.
   */
  logoRequired?: boolean;
  /**
   * Tài khoản CHỦ gian hàng — nguồn của hai mục "họ tên" và "số điện thoại" từ 16/09/2026.
   *
   * Chúng KHÔNG còn là ô trong form này, nên chúng cũng không đọc từ `useWatch` được. Cùng nguồn
   * mà `TenantsService.submitForReview` dùng làm cổng thật — nếu hai bên đọc khác nhau thì
   * checklist sẽ xanh hết trong khi server vẫn từ chối, đúng thứ `missingShopProfileRequirements`
   * sinh ra để tránh.
   */
  ownerAccount: ShopOwnerAccount;
}) {
  const t = useTranslations('Shop.checklist');
  const values = useWatch({ control }) as Partial<ShopProfileValues>;

  /*
   * Mục "địa chỉ" của checklist chấm phần CHI TIẾT người dùng gõ (`addressLine`), không chấm
   * chuỗi hiển thị: chuỗi đó do server ghép và luôn có ít nhất tên tỉnh, nên chấm theo nó là
   * mục này không bao giờ thiếu — một dòng checklist luôn xanh không nói lên điều gì.
   */
  const completeness = {
    ...values,
    address: values.addressLine,
    ownerFullName: ownerAccount.displayName,
    ownerPhone: ownerAccount.phone,
  };
  /*
   * Logo đổi NHÓM, không đổi cách chấm: cùng một phép kiểm "đã có chưa", chỉ khác hệ quả. Dựng
   * hai bảng luật song song ở đây là mời chúng trôi khỏi nhau — xem docblock của `logoRequired`.
   */
  const requiredItems: readonly ChecklistItem[] = logoRequired
    ? [...SHOP_PROFILE_REQUIREMENT_VALUES, SHOP_PROFILE_SUGGESTION.LOGO]
    : SHOP_PROFILE_REQUIREMENT_VALUES;
  const suggestedItems: readonly ChecklistItem[] = logoRequired
    ? SHOP_PROFILE_SUGGESTION_VALUES.filter((key) => key !== SHOP_PROFILE_SUGGESTION.LOGO)
    : SHOP_PROFILE_SUGGESTION_VALUES;

  const suggestedMissing = new Set<string>(missingShopProfileSuggestions(completeness));
  const missingRequired = new Set<string>([
    ...missingShopProfileRequirements(completeness),
    ...(logoRequired && suggestedMissing.has(SHOP_PROFILE_SUGGESTION.LOGO)
      ? [SHOP_PROFILE_SUGGESTION.LOGO]
      : []),
  ]);
  const missingSuggested = new Set<string>(
    [...suggestedMissing].filter((key) => !missingRequired.has(key)),
  );

  const total = requiredItems.length + suggestedItems.length;
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
        items={requiredItems}
        missing={missingRequired}
      />
      <Group
        label={t('suggestedTitle')}
        tone="suggested"
        items={suggestedItems}
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
