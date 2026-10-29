import { XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { SERVICE_TYPE, VEHICLE_TYPE } from '@xeprime/types';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { space } from '@/theme/tokens';
import { useSearchExperience } from '../search-context';
import { SearchCard } from './SearchCard';

/**
 * Tấm "Tìm xe" của màn kết quả — Figma `19973:49063` (người dùng chốt 29/10/2026): chạm dòng tóm
 * tắt "Ô tô | địa điểm | thời gian" là bật tấm này.
 *
 * Thân tấm là CHÍNH bộ chọn của thẻ tìm kiếm trang chủ (`SearchCard variant="sheet"`): dịch vụ ·
 * loại xe / lộ trình · địa điểm · thời gian — một hiện thực, không chép logic. Bộ chọn ghi thẳng vào
 * ngữ cảnh như ở trang chủ; "Áp dụng" chốt lại (`submit`) và đóng tấm.
 *
 * Hai bộ chọn con (địa điểm, thời gian) là `Modal` riêng: nơi gọi đóng tấm này trước rồi mở chúng
 * (`onPickLocation` / `onPickRange`) — iOS không trình bày `Modal` lồng `Modal`.
 */
export function SearchContextSheet({
  open,
  onClose,
  onApply,
  onPickLocation,
  onPickRange,
}: {
  open: boolean;
  onClose: () => void;
  onApply: () => void;
  onPickLocation: () => void;
  onPickRange: () => void;
}) {
  const tNav = useTranslations('Navigation.public');
  const tPanel = useTranslations('Marketplace.filterPanel');
  const { setVehicleType, setServiceType, pickProvince } = useSearchExperience();

  /**
   * "Xóa bộ lọc" của tấm: về ngữ cảnh mặc định — Ô tô · Tự lái · Toàn quốc. `pickProvince` chứ
   * không `setProvinceCode`: xoá ở đây không phải khai báo nơi mình ở, không ghi bộ nhớ tỉnh.
   * Khoảng thuê giữ nguyên: nó luôn có giá trị, không có trạng thái "trống" để về.
   */
  const clear = () => {
    setVehicleType(VEHICLE_TYPE.CAR);
    setServiceType(SERVICE_TYPE.SELF_DRIVE);
    pickProvince('');
  };

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={tNav('searchCars')}
      footer={
        <XStack gap={space.sm}>
          <YStack f={1}>
            <Button label={tPanel('clear')} icon="refresh-outline" variant="secondary" onPress={clear} />
          </YStack>
          <YStack f={1}>
            <Button label={tPanel('apply')} icon="checkmark" variant="gradient" onPress={onApply} />
          </YStack>
        </XStack>
      }
    >
      <SearchCard variant="sheet" onPickLocation={onPickLocation} onPickRange={onPickRange} />
    </BottomSheet>
  );
}
