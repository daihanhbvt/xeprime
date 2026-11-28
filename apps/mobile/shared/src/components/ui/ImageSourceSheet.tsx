import { useTranslations } from 'use-intl';
import { IMAGE_SOURCE, type ImageSource } from '@/lib/r2-image-upload';
import type { LineIconName } from '@/components/icons/LineIcon';
import { ActionSheetButtons, type SheetAction } from './ActionSheetButtons';
import { BottomSheet } from './BottomSheet';
import { InfoHint } from './InfoHint';

/**
 * Tấm chọn NGUỒN ảnh dùng chung của app: Chụp ảnh · Chọn từ thư viện (· Xoá ảnh). Mọi ô tải
 * ảnh/tệp mở đúng tấm này - ô ảnh xe, logo, giấy tờ xe, ảnh đại diện - để người dùng gặp một kiểu
 * duy nhất. `useImageUpload` dùng nó cho ảnh công khai; giấy tờ (bucket riêng tư) gọi thẳng với `onPick`.
 *
 * Dáng theo Figma Partner "Tải lên ảnh đại diện" (`24486:65997`): đầu tấm v2, hai nút viền đứng cạnh
 * nhau (icon nét Camera 1 · Image), gợi ý định dạng in nghiêng mờ BÊN DƯỚI. "Xoá ảnh" bản vẽ không
 * có - giữ làm một lối chữ đỏ dưới gợi ý để không mất thao tác gỡ ảnh (người dùng chốt 25/11/2026).
 */
export function ImageSourceSheet({
  open,
  onClose,
  title,
  hint,
  onPick,
  onRemove,
  extraAction,
  libraryPrimary = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  hint?: string | undefined;
  onPick: (source: ImageSource) => void;
  onRemove?: (() => void) | undefined;
  /** Nguồn thứ ba cùng kiểu nút (vd "Chọn tệp PDF" của đính kèm phiếu thu/chi) - trọn bề ngang dưới hai nút ảnh. */
  extraAction?: { label: string; lineIcon: LineIconName; onPress: () => void } | undefined;
  /**
   * "Chọn từ thư viện" là nút vàng chính ở DƯỚI CÙNG, trọn hàng; Chụp ảnh + nút phụ chung một hàng
   * phía trên (popup "Thêm tệp" của phiếu thu/chi, chốt 26/11/2026).
   */
  libraryPrimary?: boolean;
}) {
  const t = useTranslations('Common.image');
  /*
   * Nút theo khuôn tấm "Thao tác" (`ActionSheetButtons` - Đơn thuê); gợi ý định dạng/dung lượng vào
   * dấu ⓘ cạnh tiêu đề (người dùng chốt 27/11/2026) - áp cho MỌI popup tải ảnh vì tấm này dùng chung.
   */
  const camera: SheetAction = {
    key: 'camera',
    label: t('takePhoto'),
    icon: 'camera-1',
    onPress: () => onPick(IMAGE_SOURCE.CAMERA),
  };
  const library: SheetAction = {
    key: 'library',
    label: t('chooseFromLibrary'),
    icon: 'image',
    primary: true,
    onPress: () => onPick(IMAGE_SOURCE.LIBRARY),
  };
  const extra: SheetAction[] = extraAction
    ? [{ key: 'extra', label: extraAction.label, icon: extraAction.lineIcon, onPress: extraAction.onPress }]
    : [];
  const remove: SheetAction[] = onRemove
    ? [
        {
          key: 'remove',
          label: t('removeImage'),
          icon: 'trash',
          danger: true,
          onPress: () => {
            onClose();
            onRemove();
          },
        },
      ]
    : [];
  /* "Chọn từ thư viện" là nút vàng chính, hàng DƯỚI cùng (người dùng chốt 27/11/2026); các nút còn lại chung hàng trên. */
  const actions = [library, camera, ...extra, ...remove];
  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={title}
      chrome="v2"
      headerDivider
      {...(hint ? { titleAdornment: <InfoHint content={hint} label={title} /> } : {})}
    >
      <ActionSheetButtons actions={actions} />
    </BottomSheet>
  );
}
