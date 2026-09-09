import { useMemo, useState, type ReactNode } from 'react';
import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { MenuOption, MenuOptionList } from '@/components/ui/MenuOption';
import { colors, fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import { branchLabel } from '../api';
import { useBranchScope } from '../hooks/use-branch-scope';

/** Sentinel của mục "Tất cả chi nhánh" — danh sách lựa chọn cần một khoá, `null` không làm khoá được. */
const ALL = '__all__';

/**
 * Phần bù vùng chạm.
 *
 * Viên cao ~22dp vì nó sống trên DÒNG PHỤ của thanh trên, nơi chiều cao là của một dòng chữ
 * label chứ không phải của một nút. `hitSlop` bù đúng phần thiếu để ngón tay vẫn có ≥44pt —
 * cùng cách `Chip` giải bài toán này.
 */
const HIT_SLOP = { top: 12, bottom: 12, left: space.sm, right: space.sm } as const;

/**
 * Bộ chọn chi nhánh của CỔNG QUẢN LÝ — bản native của `BranchScopeSelector` bên web.
 *
 * Sống ở DÒNG PHỤ của `AppHeader` (xem `ManageHeader`), không phải một dải riêng dưới nó. Bản
 * trước là một dải ngang trọn bề rộng: mọi màn quản lý mất thêm ~34dp cộng một nét kẻ, ở màn hồ
 * sơ gian hàng thì dải đó còn không lọc gì cả. Thu về một viên trên dòng vốn đã tồn tại thì
 * phạm vi đang xem vẫn nhìn thấy được ở mọi màn mà không tốn hàng nào.
 *
 * Vẫn ở THANH TRÊN chứ không lùi vào drawer hay vào từng bộ lọc: phạm vi này áp cho cả cổng —
 * chọn "Chi nhánh Đà Nẵng" rồi đi qua Đội xe → Yêu cầu → Đơn thuê đều đã thu hẹp sẵn — nên giấu
 * nó sau một lần mở menu là để người dùng nhìn một danh sách rỗng mà không biết vì sao.
 *
 * Chỉ hiện khi nó có việc thật để làm:
 * - thiếu `branches.view` ⇒ hook không gọi API và `options` rỗng ⇒ trả `fallback`;
 * - không có chi nhánh nào ⇒ `fallback`;
 * - đúng MỘT chi nhánh ⇒ hiện TÊN như thông tin ngữ cảnh, không dựng dropdown chết;
 * - từ hai chi nhánh ⇒ viên bấm được, mở tấm trượt để chọn.
 *
 * Lựa chọn CHỈ thu hẹp dữ liệu trong gian hàng hiện tại; tenant scope vẫn do backend quyết định.
 */
export function BranchScopePill({
  /** Hiện khi không có gì để chọn — nơi gọi giữ dòng phụ khỏi trống (lời chào ở `ManageHeader`). */
  fallback = null,
}: {
  fallback?: ReactNode;
}) {
  const t = useTranslations('Branches');
  const scope = useBranchScope();
  const [open, setOpen] = useState(false);
  const noProvince = t('labels.noProvince');

  const options = useMemo(
    () => [
      { value: ALL, label: t('scope.all') },
      ...scope.options.map((branch) => {
        const label = branchLabel(branch, noProvince);
        return {
          value: branch.id,
          label: branch.isDefault ? t('scope.defaultOption', { label }) : label,
        };
      }),
    ],
    [scope.options, t, noProvince],
  );

  /*
   * Đang tải thì trả `fallback` chứ không dựng một viên rỗng: viên nằm trong thanh trên, và một
   * khung xám nhấp nháy ở đó là thứ đầu tiên mắt bắt được mỗi lần mở màn.
   */
  if (scope.isLoading || scope.options.length === 0) return <>{fallback}</>;

  const only = scope.options[0];
  if (!scope.canSelect) {
    if (!only) return <>{fallback}</>;
    return (
      <XStack ai="center" gap={space.xs} maxWidth="100%">
        <Ionicons name="location-outline" size={iconSize.xs} color={colors.textMuted} />
        <Text flexShrink={1} col={colors.textMuted} fos={fontSize.label} numberOfLines={1}>
          {branchLabel(only, noProvince)}
        </Text>
      </XStack>
    );
  }

  const currentLabel = scope.branch ? branchLabel(scope.branch, noProvince) : t('scope.all');

  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${t('scope.label')}: ${currentLabel}`}
        hitSlop={HIT_SLOP}
        onPress={() => setOpen(true)}
        style={({ pressed }) => [
          // `flex-start`: viên rộng theo NHÃN của nó, không kéo dài hết dòng phụ.
          { alignSelf: 'flex-start', maxWidth: '100%' },
          pressed ? { opacity: 0.7 } : null,
        ]}
      >
        <XStack
          ai="center"
          gap={space.xs}
          bg={colors.surfaceMuted}
          bw={1}
          bc={colors.border}
          br={radius.pill}
          px={space.xs}
          py={1}
        >
          <Ionicons name="location-outline" size={iconSize.xs} color={colors.primaryActive} />
          <Text
            flexShrink={1}
            col={colors.text}
            fos={fontSize.label}
            fow={fontWeight.medium}
            numberOfLines={1}
          >
            {currentLabel}
          </Text>
          <Ionicons name="chevron-down" size={iconSize.xs} color={colors.textMuted} />
        </XStack>
      </Pressable>

      <BottomSheet open={open} onClose={() => setOpen(false)} title={t('scope.label')}>
        <MenuOptionList>
          {options.map((option) => (
            <MenuOption
              key={option.value}
              label={option.label}
              selected={option.value === (scope.branchId ?? ALL)}
              onPress={() => {
                scope.select(option.value === ALL ? null : option.value);
                setOpen(false);
              }}
            />
          ))}
        </MenuOptionList>
      </BottomSheet>
    </>
  );
}
