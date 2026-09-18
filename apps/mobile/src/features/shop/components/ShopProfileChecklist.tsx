import { Ionicons } from '@expo/vector-icons';
import { useWatch, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
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
import type { ShopOwnerAccount } from '../api';
import { Card } from '@/components/ui/Card';
import { ProgressBar } from '@/components/ui/ProgressBar';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';

type ChecklistItem = ShopProfileRequirement | ShopProfileSuggestion;

/**
 * "Hoàn thiện hồ sơ" — bản kiểm kê chia đúng theo HỆ QUẢ: nhóm trên CHẶN gửi duyệt, nhóm dưới
 * thì không.
 *
 * Quy tắc chấm đến từ `@xeprime/types` (`missingShopProfileRequirements`) — CÙNG hàm mà backend
 * dùng để từ chối `submit-review`. Chép luật sang client là hẹn ngày checklist xanh hết mà server
 * vẫn trả lỗi.
 *
 * Đọc giá trị ĐANG NHẬP (`useWatch`) chứ không phải hồ sơ đã lưu: nút Gửi duyệt lưu nốt thay đổi
 * còn dở trước khi gửi, nên nếu thẻ này đọc bản đã lưu thì người vừa gõ xong tên vẫn thấy mục đó
 * đỏ — và họ sẽ không tin bảng này nữa. `useWatch` cũng khoanh việc render lại vào riêng thẻ này
 * thay vì cả màn hồ sơ nhấp nháy theo từng phím gõ.
 */
export function ShopProfileChecklist({
  control,
  ownerAccount,
  logoRequired = false,
}: {
  control: Control<ShopProfileValues>;
  /**
   * Tài khoản CHỦ gian hàng — nguồn của hai mục "họ tên" và "số điện thoại" từ 16/09/2026.
   *
   * Chúng KHÔNG còn là ô trong form này (ba cột `tenant_profiles.owner_*` đã drop), nên chúng cũng
   * không đọc từ `useWatch` được. Thiếu chúng thì hai dòng đó đỏ VĨNH VIỄN — kể cả với một chủ shop
   * đã xác minh cả tên lẫn SĐT — và checklist đếm 5/9 trong khi server cho gửi duyệt. Cùng nguồn mà
   * `TenantsService.submitForReview` dùng làm cổng thật.
   */
  ownerAccount: ShopOwnerAccount;
  /**
   * Logo là mục CHẶN, không phải gợi ý — đúng với gian hàng TUYẾN GÓI (ADR 0040 điều 7).
   *
   * Với họ, thiếu logo là `submitForPublicReview` từ chối thật (`SHOP_LISTING_REQUIREMENTS_MISSING`).
   * Để nó ở nhóm "Nên có" là checklist nói "không bắt buộc" trong khi server chặn.
   *
   * Chủ xe tuyến hoa hồng KHÔNG bị cổng đó chạm tới, nên với họ logo vẫn là gợi ý — mặc định
   * `false` giữ nguyên hành vi cũ ở màn tiến trình đăng ký.
   */
  logoRequired?: boolean;
}) {
  const t = useTranslations('Shop.checklist');
  const values = useWatch({ control }) as Partial<ShopProfileValues>;

  /*
   * Mục "địa chỉ" của checklist chấm phần CHI TIẾT người dùng gõ (`addressLine`), không chấm
   * chuỗi hiển thị: biểu mẫu native KHÔNG có ô `address` nào cả (chuỗi đó do server ghép), nên
   * đưa `values` thô vào hàm chấm là mục này không bao giờ xanh — app đếm 4/9 trong khi web đếm
   * 5/9 trên cùng một hồ sơ.
   */
  const completeness = {
    ...values,
    address: values.addressLine,
    ownerFullName: ownerAccount.displayName,
    ownerPhone: ownerAccount.phone,
  };
  /*
   * Logo đổi NHÓM, không đổi cách chấm: cùng một phép kiểm "đã có chưa", chỉ khác hệ quả. Dựng hai
   * bảng luật song song ở đây là mời chúng trôi khỏi nhau — xem docblock của `logoRequired`.
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
    <Card>
      <YStack gap={space.md}>
        <YStack gap={space.xs}>
          <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
            {t('title')}
          </Text>
          <ProgressBar
            percent={Math.round((done / total) * 100)}
            tone={ready ? 'success' : 'active'}
            label={`${done}/${total}`}
          />
        </YStack>

        <Group
          label={ready ? t('requiredDone') : t('requiredTitle')}
          items={requiredItems}
          missing={missingRequired}
          tone={ready ? 'done' : 'required'}
        />
        <Group
          label={t('suggestedTitle')}
          items={suggestedItems}
          missing={missingSuggested}
          tone="suggested"
        />
      </YStack>
    </Card>
  );
}

function Group({
  label,
  items,
  missing,
  tone,
}: {
  label: string;
  items: readonly ChecklistItem[];
  missing: ReadonlySet<string>;
  tone: 'required' | 'suggested' | 'done';
}) {
  const t = useTranslations('Shop.checklist');

  return (
    <YStack gap={space.xs}>
      <Text
        col={tone === 'done' ? colors.success : colors.textMuted}
        fos={fontSize.label}
        fow={fontWeight.semibold}
      >
        {label}
      </Text>
      {items.map((item) => {
        const isMissing = missing.has(item);
        return (
          <XStack key={item} ai="center" gap={space.xs}>
            <Ionicons
              name={isMissing ? 'ellipse-outline' : 'checkmark-circle'}
              size={iconSize.sm}
              color={
                isMissing
                  ? tone === 'suggested'
                    ? colors.textMuted
                    : colors.warning
                  : colors.success
              }
            />
            <Text
              f={1}
              col={isMissing ? colors.text : colors.textMuted}
              fos={fontSize.bodySm}
            >
              {t(`items.${item}` as 'items.displayName')}
            </Text>
          </XStack>
        );
      })}
    </YStack>
  );
}
