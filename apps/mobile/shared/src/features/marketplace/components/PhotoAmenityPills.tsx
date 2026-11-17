import { SvgXml } from 'react-native-svg';
import { Text, XStack } from 'tamagui';
import { XP_TOKENS } from '@xeprime/ui';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

export type AmenityKey = 'delivery' | 'instant' | 'noCollateral' | 'vat';

export interface PhotoAmenityItem {
  key: AmenityKey;
  label: string;
}

type AmenityLabelKey = 'delivery' | 'noCollateral' | 'instantBook' | 'vatInvoice';

/** Kính tối gray-900 45% (web `PhotoAmenityPills.module.css`) - chưa có token riêng. */
const GLASS_BG = 'rgba(16, 24, 40, 0.45)';

/**
 * Figma `22185:88916` "Vehicle Benefits": mỗi nhãn một sắc kính nhạt riêng (khớp
 * `PhotoAmenityPills.module.css` web). Thẻ xe không hiện VAT.
 */
const PILL_TONE: Record<string, string> = {
  delivery: 'rgba(68, 86, 66, 0.6)',
  noCollateral: 'rgba(111, 105, 105, 0.4)',
  instant: 'rgba(97, 96, 124, 0.6)',
};

/**
 * Nhãn tiện ích của một xe - cùng thứ tự với web (`listingAmenityItems`, Figma `22226:30044`):
 * giao xe · tự động duyệt · miễn thế chấp. Thẻ xe KHÔNG hiện VAT; trang chi tiết bật `includeVat`.
 * `instantBook` do bề mặt tự tính theo dịch vụ đang xem.
 */
export function listingAmenityItems(
  listing: { deliveryEnabled?: boolean; noCollateral?: boolean; vatInvoiceSupported?: boolean },
  instantBook: boolean,
  label: (key: AmenityLabelKey) => string,
  { includeVat = false }: { includeVat?: boolean } = {},
): PhotoAmenityItem[] {
  const keys: [AmenityKey, AmenityLabelKey, boolean | undefined][] = [
    ['delivery', 'delivery', listing.deliveryEnabled],
    ['instant', 'instantBook', instantBook],
    ['noCollateral', 'noCollateral', listing.noCollateral],
    ['vat', 'vatInvoice', includeVat && listing.vatInvoiceSupported],
  ];
  return keys.filter(([, , on]) => on).map(([key, labelKey]) => ({ key, label: label(labelKey) }));
}

/** Icon 16 của Figma "Statut du véhicule" - giữ màu cứng của bản vẽ (khớp web). */
const CHIP_ICON_XML: Partial<Record<AmenityKey, string>> = {
  delivery: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="Icon / Essentional"><path id="Vector" d="M3.8915 3.80044L3.28833 5.55467H6.16667V2.88867H5.19683C4.90805 2.88851 4.62655 2.9765 4.39225 3.14015C4.15796 3.30381 3.98275 3.53483 3.8915 3.80044ZM2.984 6.44334L2.98033 6.45223L2.7365 6.51088L2.62467 6.53754C2.32709 6.60971 2.06295 6.77626 1.87426 7.01072C1.68557 7.24518 1.58316 7.53407 1.58333 7.83144V9.99818C1.58333 10.1404 1.62917 10.2737 1.70892 10.3821C1.87354 9.92207 2.18943 9.52719 2.60805 9.25813C3.02666 8.98907 3.52484 8.86074 4.026 8.89284C4.52717 8.92494 5.00359 9.1157 5.38205 9.43581C5.76052 9.75592 6.02007 10.1877 6.12083 10.6647H9.87917C9.97928 10.1872 10.2386 9.75481 10.6171 9.43419C10.9956 9.11358 11.4723 8.92249 11.9738 8.89037C12.4754 8.85824 12.9739 8.98686 13.3926 9.25641C13.8113 9.52596 14.127 9.92149 14.2911 10.3821C14.3728 10.2697 14.4166 10.1356 14.4167 9.99818V8.25356C14.4168 7.95969 14.3167 7.67403 14.132 7.44099C13.9474 7.20796 13.6884 7.04061 13.3955 6.96499L11.3788 6.44334H2.984ZM10.6336 5.55467L9.49783 3.57472C9.3789 3.367 9.20486 3.19387 8.99373 3.07325C8.7826 2.95263 8.54206 2.88891 8.297 2.88867H7.08333V5.55467H10.6336ZM15.3333 9.99818C15.3334 10.2963 15.245 10.5882 15.0787 10.839C14.9125 11.0899 14.6753 11.2891 14.3956 11.4129C14.3222 11.9329 14.0613 12.4108 13.6591 12.7621C13.257 13.1134 12.7396 13.3154 12.1985 13.3322C11.6575 13.349 11.1278 13.1796 10.7033 12.854C10.2787 12.5284 9.98679 12.0677 9.87917 11.5534H6.12083C6.01321 12.0677 5.72128 12.5284 5.29674 12.854C4.87221 13.1796 4.3425 13.349 3.80146 13.3322C3.26042 13.3154 2.74299 13.1134 2.34085 12.7621C1.93871 12.4108 1.67783 11.9329 1.60442 11.4129C1.32467 11.2891 1.08754 11.0899 0.921278 10.839C0.755019 10.5882 0.666639 10.2963 0.666667 9.99818L0.666667 7.83144C0.666648 7.35914 0.821888 6.89912 1.10985 6.51816C1.39782 6.1372 1.80353 5.85512 2.26808 5.71286L3.0225 3.51873C3.17468 3.0764 3.46656 2.6917 3.8568 2.41913C4.24704 2.14655 4.71586 1.99992 5.19683 2H8.29608C8.70487 1.99991 9.10624 2.10583 9.45859 2.30678C9.81093 2.50773 10.1014 2.79639 10.2999 3.14283L11.7134 5.61066L13.632 6.10654C14.12 6.23266 14.5513 6.51152 14.859 6.89978C15.1667 7.28804 15.3334 7.76396 15.3333 8.25356V9.99818ZM3.875 9.77602C3.51033 9.77602 3.16059 9.91646 2.90273 10.1664C2.64487 10.4164 2.5 10.7555 2.5 11.109C2.5 11.4626 2.64487 11.8016 2.90273 12.0516C3.16059 12.3016 3.51033 12.442 3.875 12.442C4.23967 12.442 4.58941 12.3016 4.84727 12.0516C5.10513 11.8016 5.25 11.4626 5.25 11.109C5.25 10.7555 5.10513 10.4164 4.84727 10.1664C4.58941 9.91646 4.23967 9.77602 3.875 9.77602ZM12.125 9.77602C11.7603 9.77602 11.4106 9.91646 11.1527 10.1664C10.8949 10.4164 10.75 10.7555 10.75 11.109C10.75 11.4626 10.8949 11.8016 11.1527 12.0516C11.4106 12.3016 11.7603 12.442 12.125 12.442C12.4897 12.442 12.8394 12.3016 13.0973 12.0516C13.3551 11.8016 13.5 11.4626 13.5 11.109C13.5 10.7555 13.3551 10.4164 13.0973 10.1664C12.8394 9.91646 12.4897 9.77602 12.125 9.77602Z" fill="#039855"/></g></svg>',
  instant: '<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="Check-Cross"><path id="Vector" d="M2.44378 7.40785C2.16765 7.40862 1.89737 7.48756 1.66422 7.63553C1.43108 7.78351 1.24459 7.99446 1.12634 8.244C1.00808 8.49354 0.962895 8.77146 0.996002 9.0456C1.02911 9.31975 1.13916 9.57893 1.31342 9.79314L5.02818 14.3437C5.16064 14.5082 5.33042 14.6387 5.52343 14.7243C5.71643 14.81 5.92709 14.8484 6.13791 14.8363C6.5888 14.8121 6.99588 14.5709 7.25542 14.1743L14.9719 1.74686C14.9732 1.74478 14.9745 1.74273 14.9759 1.74071C15.0483 1.62954 15.0248 1.40923 14.8754 1.27083C14.8343 1.23282 14.7859 1.20362 14.7331 1.18502C14.6804 1.16642 14.6244 1.15883 14.5685 1.1627C14.5127 1.16657 14.4583 1.18183 14.4086 1.20753C14.3589 1.23323 14.315 1.26884 14.2796 1.31215C14.2768 1.31556 14.274 1.31891 14.271 1.32222L6.48883 10.115C6.45922 10.1484 6.42326 10.1757 6.38303 10.1951C6.3428 10.2146 6.2991 10.2258 6.25449 10.2282C6.20987 10.2306 6.16522 10.2242 6.12313 10.2092C6.08103 10.1942 6.04234 10.171 6.00929 10.1409L3.42652 7.79055C3.15828 7.54466 2.80768 7.40813 2.44378 7.40785Z" fill="#1570EF"/></g></svg>',
  noCollateral: '<svg width="16" height="16" viewBox="-0.8333 -0.8333 16 16" fill="none" xmlns="http://www.w3.org/2000/svg"><g id="Dollar Circle"><g id="Vector"><path d="M7.66667 2.5C7.66667 2.22386 7.44281 2 7.16667 2C6.89052 2 6.66667 2.22386 6.66667 2.5V2.70539C6.44883 2.76004 6.23508 2.84543 6.03156 2.96293C4.21699 4.01057 4.44762 6.69926 6.41409 7.42258L6.66667 7.51549V10.6463C6.31009 10.5457 5.9915 10.3113 5.79204 9.96584L5.54166 9.53217C5.40359 9.29303 5.09779 9.21109 4.85865 9.34916C4.6195 9.48723 4.53756 9.79303 4.67563 10.0322L4.92601 10.4658C5.31165 11.1338 5.96178 11.5531 6.66667 11.669V11.8333C6.66667 12.1095 6.89052 12.3333 7.16667 12.3333C7.44281 12.3333 7.66667 12.1095 7.66667 11.8333V11.628C7.88455 11.5733 8.09835 11.4879 8.30192 11.3704C10.1165 10.3228 9.88587 7.63406 7.91938 6.91075L7.66667 6.81781L7.66667 3.68701C8.0233 3.78757 8.34195 4.02197 8.54144 4.3675L8.79182 4.80117C8.92989 5.04031 9.23569 5.12225 9.47483 4.98418C9.71398 4.84611 9.79592 4.54031 9.65785 4.30117L9.40747 3.8675C9.0218 3.19951 8.37161 2.78021 7.66667 2.66433V2.5ZM6.53156 3.82896C6.57593 3.80334 6.62102 3.78031 6.66667 3.75981L6.66667 6.44663C5.58201 5.96763 5.48043 4.43583 6.53156 3.82896ZM7.80192 10.5044C7.7575 10.53 7.71236 10.5531 7.66667 10.5736V7.88665C8.75146 8.36557 8.8531 9.89748 7.80192 10.5044Z" fill-rule="evenodd" clip-rule="evenodd" fill="#5925DC"/><path d="M7.16667 0C3.20863 0 0 3.20863 0 7.16667C0 11.1247 3.20863 14.3333 7.16667 14.3333C11.1247 14.3333 14.3333 11.1247 14.3333 7.16667C14.3333 3.20863 11.1247 0 7.16667 0ZM1 7.16667C1 3.76091 3.76091 1 7.16667 1C10.5724 1 13.3333 3.76091 13.3333 7.16667C13.3333 10.5724 10.5724 13.3333 7.16667 13.3333C3.76091 13.3333 1 10.5724 1 7.16667Z" fill-rule="evenodd" clip-rule="evenodd" fill="#5925DC"/></g></g></svg>',
};

/**
 * Hàng nhãn tiện ích trang chi tiết (Figma `22226:30044`, web `AmenityChips`): viên trắng viền
 * `border`, bo 16, đệm 4/8, icon 16 + chữ 12/18 Medium; `vat` là viên xanh thông tin.
 */
export function AmenityChips({ items }: { items: readonly PhotoAmenityItem[] }) {
  const colors = useColors();
  if (items.length === 0) return null;
  return (
    <XStack flexWrap="wrap" ai="center" gap={space.sm + space.xs} rowGap={space.sm}>
      {items.map((item) => {
        const vat = item.key === 'vat';
        const icon = CHIP_ICON_XML[item.key];
        return (
          <XStack
            key={item.key}
            ai="center"
            gap={6}
            px={space.sm}
            py={space.xs}
            br={16}
            bw={1}
            bc={vat ? colors.infoStrong : colors.border}
            bg={vat ? colors.infoSurface : colors.surface}
          >
            {icon ? <SvgXml xml={icon} width={16} height={16} /> : null}
            <Text
              col={vat ? colors.infoStrong : colors.textMuted}
              fos={fontSize.label}
              lh={18}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {item.label}
            </Text>
          </XStack>
        );
      })}
    </XStack>
  );
}

/**
 * Nhãn tiện ích ĐÈ góc dưới-trái ảnh xe (Figma "List - MB" `22185:115247`): viên kính tối mờ,
 * chữ trắng, xuống tối đa hai hàng. MỘT component cho thẻ xe và ảnh chính trang chi tiết; cha
 * phải là khung ảnh (định vị tuyệt đối theo nó).
 */
export function PhotoAmenityPills({
  items,
  right = space.sm,
}: {
  items: readonly PhotoAmenityItem[];
  /** Lề phải - chừa chỗ cho bộ đếm ảnh nếu bề mặt có. */
  right?: number;
}) {
  if (items.length === 0) return null;
  return (
    <XStack
      pos="absolute"
      left={space.sm}
      right={right}
      bottom={space.sm}
      zi={1}
      flexWrap="wrap"
      gap={6}
      maxHeight={2 * 18 + 6}
      ov="hidden"
      pointerEvents="none"
    >
      {items.map((item) => (
        <XStack key={item.key} maxWidth="100%" br={radius.pill} px={6} py={2} bg={PILL_TONE[item.key] ?? GLASS_BG}>
          <Text col={XP_TOKENS['color-text-on-dark']} fos={10} lh={14} fow={fontWeight.regular} numberOfLines={1}>
            {item.label}
          </Text>
        </XStack>
      ))}
    </XStack>
  );
}
