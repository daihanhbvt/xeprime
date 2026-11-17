import Svg, { Circle, G, Path, Rect } from 'react-native-svg';
import { HANDOVER_PHOTO_SLOT, type HandoverPhotoSlot } from '@xeprime/types';

/**
 * Hình MẪU của từng góc chụp - bản native của web `HandoverSlotSample` (cùng nét vẽ, cùng
 * `viewBox` 120×72). Nét mờ trong ô ảnh còn trống để người bàn giao hình dung ngay phải chụp góc
 * nào (đầu xe · đuôi xe · hai bên hông · đồng hồ Odo). Thuần vector, màu do nơi gọi truyền vào nên
 * tự theo giao diện sáng/tối.
 */
export function HandoverSlotSample({
  slot,
  color,
  width,
}: {
  slot: HandoverPhotoSlot;
  color: string;
  width: number;
}) {
  const stroke = {
    fill: 'none',
    stroke: color,
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
  };
  const height = Math.round((width * 72) / 120);

  return (
    <Svg viewBox="0 0 120 72" width={width} height={height} accessibilityElementsHidden>
      {slot === HANDOVER_PHOTO_SLOT.FRONT ? (
        <G {...stroke}>
          <Path d="M34 24 L42 9 H78 L86 24" />
          <Path d="M38 23 L44 12 H76 L82 23 Z" />
          <Rect x="16" y="24" width="88" height="28" rx="8" />
          <Rect x="22" y="31" width="18" height="7" rx="3" />
          <Rect x="80" y="31" width="18" height="7" rx="3" />
          <Rect x="46" y="33" width="28" height="10" rx="2" />
          <Path d="M50 38 H70" />
          <Rect x="20" y="52" width="14" height="10" rx="3" />
          <Rect x="86" y="52" width="14" height="10" rx="3" />
          <Path d="M16 27 H10 V31 H16" />
          <Path d="M104 27 H110 V31 H104" />
        </G>
      ) : slot === HANDOVER_PHOTO_SLOT.REAR ? (
        <G {...stroke}>
          <Path d="M34 24 L42 9 H78 L86 24" />
          <Path d="M39 22 L45 13 H75 L81 22 Z" />
          <Rect x="16" y="24" width="88" height="28" rx="8" />
          <Rect x="21" y="30" width="20" height="8" rx="2" />
          <Rect x="79" y="30" width="20" height="8" rx="2" />
          <Rect x="48" y="40" width="24" height="8" rx="1.5" />
          <Path d="M22 46 H34" />
          <Path d="M86 46 H98" />
          <Rect x="20" y="52" width="14" height="10" rx="3" />
          <Rect x="86" y="52" width="14" height="10" rx="3" />
        </G>
      ) : slot === HANDOVER_PHOTO_SLOT.LEFT || slot === HANDOVER_PHOTO_SLOT.RIGHT ? (
        // Bên trái nhìn đầu xe quay sang trái, bên phải lật ngược lại - như web.
        <G
          {...stroke}
          transform={slot === HANDOVER_PHOTO_SLOT.LEFT ? 'translate(120 0) scale(-1 1)' : undefined}
        >
          <Path d="M8 48 V40 Q9 34 18 33 L34 31 L46 19 Q49 16 55 16 H79 Q84 16 87 20 L97 31 L108 34 Q114 36 114 42 V48 H102" />
          <Path d="M82 48 H38" />
          <Path d="M18 48 H8" />
          <Path d="M40 31 L49 21 H63 V31 Z" />
          <Path d="M67 21 H80 L89 31 H67 Z" />
          <Path d="M58 36 H64" />
          <Circle cx="28" cy="49" r="9" />
          <Circle cx="28" cy="49" r="3.5" />
          <Circle cx="92" cy="49" r="9" />
          <Circle cx="92" cy="49" r="3.5" />
        </G>
      ) : (
        <G {...stroke}>
          <Path d="M30 56 A32 32 0 1 1 90 56" />
          <Path d="M36 44 L41 46" />
          <Path d="M41 28 L45 32" />
          <Path d="M60 18 V24" />
          <Path d="M79 28 L75 32" />
          <Path d="M84 44 L79 46" />
          <Path d="M60 46 L74 30" />
          <Circle cx="60" cy="46" r="3" />
          <Rect x="46" y="54" width="28" height="11" rx="2" />
          <Path d="M52 59.5 H68" strokeDasharray="3 2" />
        </G>
      )}
    </Svg>
  );
}
