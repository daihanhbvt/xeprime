import { useMemo, useState } from 'react';
import { Pressable } from 'react-native';
import { LineIcon } from '@/components/icons/LineIcon';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { ActionSheetButtons, type SheetAction } from '@/components/ui/ActionSheetButtons';
import { useColors } from '@/theme/ThemeProvider';
import { iconSize } from '@/theme/tokens';

const KEBAB_SLOP = 12;

/**
 * Nút ⋮ của một khung/dòng + tấm "Thao tác" (quy ước 27/11/2026: `BottomSheet chrome="v2"
 * headerDivider` + `ActionSheetButtons`, không dùng danh sách dòng). Chạm một nút là đóng tấm rồi
 * chạy việc. Không còn thao tác nào (sau khi lọc quyền) thì không vẽ dấu ⋮.
 */
export function KebabActionsMenu({
  title,
  actions,
}: {
  /** Tiêu đề tấm + nhãn trợ năng của dấu ⋮. */
  title: string;
  /** Thao tác đã lọc theo quyền/trạng thái - mảng rỗng = ẩn hẳn. */
  actions: readonly SheetAction[];
}) {
  const colors = useColors();
  const [open, setOpen] = useState(false);
  const wrapped = useMemo(
    () =>
      actions.map((action) => ({
        ...action,
        onPress: () => {
          setOpen(false);
          action.onPress();
        },
      })),
    [actions],
  );
  if (actions.length === 0) return null;
  return (
    <>
      <Pressable
        onPress={() => setOpen(true)}
        accessibilityRole="button"
        accessibilityLabel={title}
        hitSlop={KEBAB_SLOP}
      >
        <LineIcon name="menu-kebab" size={iconSize.lg} color={colors.textMuted} />
      </Pressable>
      <BottomSheet open={open} onClose={() => setOpen(false)} title={title} chrome="v2" headerDivider>
        <ActionSheetButtons actions={wrapped} autoSize />
      </BottomSheet>
    </>
  );
}
