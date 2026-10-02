import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BottomSheet } from '@/components/ui/BottomSheet';
import type { IconName } from '@/components/ui/Chip';
import { useAppFormat } from '@/i18n/use-app-format';
import { SheetActionRow } from './SheetActionRow';

export type CellActionKey = 'booking' | 'block' | 'price';

/** Ô đang được chọn — xe + ngày. Toạ độ neo của web không có nghĩa ở đây: app dùng tấm trượt. */
export interface CellActionTarget {
  vehicleId: string;
  vehicleName: string;
  /** Ngày `YYYY-MM-DD` giờ VN của ô. */
  date: string;
}

/**
 * Chỉ ICON nằm ở đây. Nhãn và câu gợi ý đọc từ `Calendar.cellActions.<key>` — mã hành động là
 * DỮ LIỆU, chữ hiện ra mới là thứ đổi theo ngôn ngữ.
 */
const ACTION_ICON: Readonly<Record<CellActionKey, IconName>> = {
  booking: 'calendar-outline',
  block: 'lock-closed-outline',
  price: 'pricetag-outline',
};

/**
 * Bộ chọn hành động khi chạm Ô TRỐNG — lớp đệm bắt buộc trước khi vào một luồng thật.
 *
 * Có nó để một cú chạm nhầm trên lưới không mở thẳng form tạo đơn hay khoá xe. Web dùng panel neo
 * cạnh ô trên desktop và bottom sheet ở màn hẹp; app chỉ có vế thứ hai — cùng nội dung, cùng thứ
 * tự, cùng luật quyền.
 *
 * Chỉ nhận danh sách hành động ĐÃ lọc theo quyền; component này không tự biết quyền.
 */
export function CellActionsSheet({
  target,
  actions,
  onSelect,
  onClose,
}: {
  target: CellActionTarget | null;
  actions: readonly CellActionKey[];
  onSelect: (action: CellActionKey) => void;
  onClose: () => void;
}) {
  const t = useTranslations('Calendar');
  const fmt = useAppFormat();

  return (
    <BottomSheet
      open={target !== null && actions.length > 0}
      onClose={onClose}
      title={target?.vehicleName ?? ''}
      subtitle={target ? fmt.dateKey(target.date) : undefined}
    >
      <YStack accessibilityLabel={t('cellActions.menuAriaLabel')}>
        {actions.map((key) => (
          <SheetActionRow
            key={key}
            label={t(`cellActions.${key}.label`)}
            hint={t(`cellActions.${key}.hint`)}
            /*
              CÙNG một tông cho cả ba, không phân biệt "đặt xe" với hai cái còn lại.

              Web tô cả ba đĩa icon bằng một class duy nhất (`.icon`: nền `primary-light`, chữ
              `primary`) — ba dòng này là ba LỐI ĐI ngang hàng, không có cái nào là hành động
              chính. Tô "Đặt xe" nổi hơn "Khoá xe"/"Đặt giá" là tự đặt ra một thứ bậc web không
              có, và người trực đọc ra thành "hai cái kia bị vô hiệu".
            */
            icon={ACTION_ICON[key]}
            tone="primary"
            onPress={() => onSelect(key)}
          />
        ))}
      </YStack>
    </BottomSheet>
  );
}
