import { Ionicons } from '@expo/vector-icons';
import { useWatch, type Control } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  missingShopProfileRequirements,
  missingShopProfileSuggestions,
  SHOP_PROFILE_REQUIREMENT_VALUES,
  SHOP_PROFILE_SUGGESTION_VALUES,
  type ShopProfileRequirement,
  type ShopProfileSuggestion,
} from '@xeprime/types';
import type { ShopProfileValues } from '@xeprime/validators';
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
export function ShopProfileChecklist({ control }: { control: Control<ShopProfileValues> }) {
  const t = useTranslations('Shop.checklist');
  const values = useWatch({ control }) as Partial<ShopProfileValues>;

  /*
   * Mục "địa chỉ" của checklist chấm phần CHI TIẾT người dùng gõ (`addressLine`), không chấm
   * chuỗi hiển thị: biểu mẫu native KHÔNG có ô `address` nào cả (chuỗi đó do server ghép), nên
   * đưa `values` thô vào hàm chấm là mục này không bao giờ xanh — app đếm 4/9 trong khi web đếm
   * 5/9 trên cùng một hồ sơ.
   */
  const completeness = { ...values, address: values.addressLine };
  const missingRequired = new Set<string>(missingShopProfileRequirements(completeness));
  const missingSuggested = new Set<string>(missingShopProfileSuggestions(completeness));

  const total = SHOP_PROFILE_REQUIREMENT_VALUES.length + SHOP_PROFILE_SUGGESTION_VALUES.length;
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
          items={SHOP_PROFILE_REQUIREMENT_VALUES}
          missing={missingRequired}
          tone={ready ? 'done' : 'required'}
        />
        <Group
          label={t('suggestedTitle')}
          items={SHOP_PROFILE_SUGGESTION_VALUES}
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
