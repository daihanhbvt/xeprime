import { HANDOVER_PHOTO_SLOT, type HandoverPhotoSlot } from '@xeprime/types';

/**
 * Hình MẪU của từng góc chụp — nét vẽ mờ trong ô ảnh còn trống để người bàn giao hình dung ngay
 * phải chụp góc nào (đầu xe · đuôi xe · hai bên hông · đồng hồ Odo). Thuần SVG `currentColor`,
 * không tải ảnh nào, tự đổi màu theo theme.
 */
export function HandoverSlotSample({
  slot,
  className,
}: {
  slot: HandoverPhotoSlot;
  className?: string;
}) {
  const common = {
    className,
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 2,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true,
    focusable: false,
  };

  switch (slot) {
    case HANDOVER_PHOTO_SLOT.FRONT:
      return (
        <svg viewBox="0 0 120 72" {...common}>
          <path d="M34 24 L42 9 H78 L86 24" />
          <path d="M38 23 L44 12 H76 L82 23 Z" />
          <rect x="16" y="24" width="88" height="28" rx="8" />
          <rect x="22" y="31" width="18" height="7" rx="3" />
          <rect x="80" y="31" width="18" height="7" rx="3" />
          <rect x="46" y="33" width="28" height="10" rx="2" />
          <path d="M50 38 H70" />
          <rect x="20" y="52" width="14" height="10" rx="3" />
          <rect x="86" y="52" width="14" height="10" rx="3" />
          <path d="M16 27 H10 V31 H16" />
          <path d="M104 27 H110 V31 H104" />
        </svg>
      );
    case HANDOVER_PHOTO_SLOT.REAR:
      return (
        <svg viewBox="0 0 120 72" {...common}>
          <path d="M34 24 L42 9 H78 L86 24" />
          <path d="M39 22 L45 13 H75 L81 22 Z" />
          <rect x="16" y="24" width="88" height="28" rx="8" />
          <rect x="21" y="30" width="20" height="8" rx="2" />
          <rect x="79" y="30" width="20" height="8" rx="2" />
          <rect x="48" y="40" width="24" height="8" rx="1.5" />
          <path d="M22 46 H34" />
          <path d="M86 46 H98" />
          <rect x="20" y="52" width="14" height="10" rx="3" />
          <rect x="86" y="52" width="14" height="10" rx="3" />
        </svg>
      );
    case HANDOVER_PHOTO_SLOT.LEFT:
    case HANDOVER_PHOTO_SLOT.RIGHT:
      return (
        <svg viewBox="0 0 120 72" {...common}>
          {/* Bên trái nhìn đầu xe quay sang trái, bên phải lật ngược lại. */}
          <g
            transform={
              slot === HANDOVER_PHOTO_SLOT.LEFT ? 'translate(120 0) scale(-1 1)' : undefined
            }
          >
            <path d="M8 48 V40 Q9 34 18 33 L34 31 L46 19 Q49 16 55 16 H79 Q84 16 87 20 L97 31 L108 34 Q114 36 114 42 V48 H102" />
            <path d="M82 48 H38" />
            <path d="M18 48 H8" />
            <path d="M40 31 L49 21 H63 V31 Z" />
            <path d="M67 21 H80 L89 31 H67 Z" />
            <path d="M58 36 H64" />
            <circle cx="28" cy="49" r="9" />
            <circle cx="28" cy="49" r="3.5" />
            <circle cx="92" cy="49" r="9" />
            <circle cx="92" cy="49" r="3.5" />
          </g>
        </svg>
      );
    case HANDOVER_PHOTO_SLOT.ODOMETER:
    default:
      return (
        <svg viewBox="0 0 120 72" {...common}>
          <path d="M30 56 A32 32 0 1 1 90 56" />
          <path d="M36 44 L41 46" />
          <path d="M41 28 L45 32" />
          <path d="M60 18 V24" />
          <path d="M79 28 L75 32" />
          <path d="M84 44 L79 46" />
          <path d="M60 46 L74 30" />
          <circle cx="60" cy="46" r="3" />
          <rect x="46" y="54" width="28" height="11" rx="2" />
          <path d="M52 59.5 H68" strokeDasharray="3 2" />
        </svg>
      );
  }
}
