import { Pressable } from 'react-native';
import { LineIcon } from '@/components/icons/LineIcon';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useColors } from '@/theme/ThemeProvider';
import { radius, sizing, space } from '@/theme/tokens';
import { useFavoriteToggle } from '../hooks/use-favorite';

/**
 * Ba dáng của trái tim — mỗi dáng là một class của web:
 *
 * - `photo` — đè lên ẢNH thẻ xe chợ (`VehicleCard.module.css` `.favoriteBtn`): đĩa 32, nền trắng mờ
 *   CỐ ĐỊNH ở cả hai giao diện (nằm trên ảnh, không trên nền trang), icon 15.
 * - `card` — đè lên ảnh thẻ Xe yêu thích (`FavoriteVehicleCard.module.css` `.heartBtn`): đĩa 32, nền
 *   `bg-elevated`, viền `border-subtle`, icon 15.
 * - `action` — cạnh nút Chia sẻ ở trang chi tiết (`ListingDetailView.module.css` `.actionBtn`): đĩa
 *   32, nền `bg-container`, viền `border`, icon 16 (cỡ ≤640px); đã lưu thì viền + icon đỏ.
 * - `list` — cạnh giá ở thẻ xe dạng NGANG (`VehicleCard.module.css` `.listFavoriteBtn`): đĩa 32,
 *   nền `rgba(0,0,0,.03)`, viền `rgba(0,0,0,.08)` 1px, icon 15 `text-secondary`.
 */
export type FavoriteButtonVariant = 'photo' | 'card' | 'action' | 'list';

/*
 * Nền/viền đĩa trên ẢNH — web viết thẳng `rgba(255,255,255,0.9)` / `rgba(0,0,0,0.06)`, không token
 * nào mang: chúng là màu "trên ảnh", không đổi theo giao diện sáng/tối.
 */
const PHOTO_DISC_BG = 'rgba(255, 255, 255, 0.9)';
const PHOTO_DISC_BORDER = 'rgba(0, 0, 0, 0.06)';

/* Đĩa của thẻ ngang — web viết thẳng hai màu mờ này ở `.listFavoriteBtn` (không có token, không đổi theo theme). */
const LIST_DISC_BG = 'rgba(0, 0, 0, 0.03)';
const LIST_DISC_BORDER = 'rgba(0, 0, 0, 0.08)';

/*
 * `action` = `.actionBtn` của chi tiết xe web ở ≤640px (bản mobile của mockup): đĩa 32, icon 16,
 * vùng chạm 44 qua `hitSlop`. `photo`/`card` = `.favoriteBtn`/`.heartBtn` của thẻ xe (đĩa 32, icon 15).
 */
const DISC = { photo: 32, card: 32, action: 32, list: 32 } as const;
/** Cỡ trái tim — bộ `LineIcon` vẽ trong khung 20, nên nhích 1–2px so với bản Ionicons để nét không mảnh hơn. */
const ICON = { photo: 17, card: 17, action: 18, list: 17 } as const;

/**
 * Nút trái tim của một xe — bản native của web `FavoriteButton`. Hành vi ở `useFavoriteToggle`.
 *
 * Nằm TRÊN vùng chạm của cả thẻ nên là `Pressable` riêng (bấm tim không mở trang chi tiết). Không
 * khoá nút khi đang lưu — bấm dồn dập là hợp lệ và hội tụ về lượt cuối.
 */
export function FavoriteButton({
  vehicleId,
  vehicleName,
  variant,
}: {
  vehicleId: string;
  vehicleName: string;
  variant: FavoriteButtonVariant;
}) {
  const colors = useColors();
  const t = useTranslations('Favorites.button');
  const { isFavorite, toggle } = useFavoriteToggle(vehicleId);
  const label = isFavorite ? t('remove', { name: vehicleName }) : t('save', { name: vehicleName });

  const size = DISC[variant];
  const iconColor = isFavorite ? colors.danger : colors.textMuted;
  const skin =
    variant === 'photo'
      ? { bg: PHOTO_DISC_BG, bc: PHOTO_DISC_BORDER }
      : variant === 'list'
        ? { bg: LIST_DISC_BG, bc: LIST_DISC_BORDER }
        : variant === 'card'
          ? { bg: colors.surfaceElevated, bc: colors.borderSubtle }
          : { bg: colors.surface, bc: isFavorite ? colors.danger : colors.border };

  return (
    <Pressable
      onPress={toggle}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ selected: isFavorite }}
      // Đĩa vẽ 32 như web; vùng CHẠM nới tới cỡ ngón tay.
      hitSlop={Math.max(space.xs, (sizing.touchTarget - size) / 2)}
    >
      <YStack
        w={size}
        h={size}
        br={radius.pill}
        ai="center"
        jc="center"
        bw={1}
        bc={skin.bc}
        bg={skin.bg}
      >
        {/*
          Trái tim nét của bộ `LineIcon` (cùng icon "Xe yêu thích" trong menu tài khoản — người dùng
          chốt 27/10/2026); đã lưu thì bản tô đặc cùng hình.
        */}
        <LineIcon
          name={isFavorite ? 'heart-filled' : 'heart'}
          size={ICON[variant]}
          color={iconColor}
        />
      </YStack>
    </Pressable>
  );
}
