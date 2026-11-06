import { useEffect, useRef } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import Animated, {
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withSequence,
  withSpring,
  withTiming,
} from 'react-native-reanimated';
import { spring } from '@/theme/motion';
import { LineIcon } from '@/components/icons/LineIcon';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { useAppScheme, useColors } from '@/theme/ThemeProvider';
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
/* Giao diện tối — web `[data-theme=dark] .favoriteBtn`: đĩa trắng 16% không viền, tim theo màu chữ (sáng). */
const PHOTO_DISC_BG_DARK = 'rgba(255, 255, 255, 0.16)';

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

/*
 * Hằng cục bộ của hiệu ứng "pop + vòng lan toả" (06/11/2026) — hợp nhất vào `theme/motion` sau.
 * Tim phồng tới `HEART_POP_SCALE` rồi lò xo về 1; vòng đỏ phóng từ 0.6 → `RING_END_SCALE` và tắt dần.
 */
const HEART_POP_SCALE = 1.35;
const HEART_POP_IN_MS = 110;
const RING_END_SCALE = 1.9;
const RING_MS = 420;

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
  const dark = useAppScheme().scheme === 'dark';
  const t = useTranslations('Favorites.button');
  const { isFavorite, toggle } = useFavoriteToggle(vehicleId);
  const label = isFavorite ? t('remove', { name: vehicleName }) : t('save', { name: vehicleName });

  const size = DISC[variant];
  const reduceMotion = useReducedMotion();
  const heartScale = useSharedValue(1);
  const ringScale = useSharedValue(0.6);
  const ringOpacity = useSharedValue(0);
  // Chỉ nổ khi NGƯỜI DÙNG vừa lưu (false → true), không nổ lúc cache nạp trạng thái ban đầu.
  const pressedRef = useRef(false);
  useEffect(() => {
    if (!pressedRef.current) return;
    pressedRef.current = false;
    if (reduceMotion) return;
    heartScale.value = withSequence(
      withTiming(isFavorite ? HEART_POP_SCALE : 0.85, { duration: HEART_POP_IN_MS }),
      withSpring(1, spring.pop),
    );
    if (isFavorite) {
      ringScale.value = 0.6;
      ringOpacity.value = 0.7;
      ringScale.value = withTiming(RING_END_SCALE, { duration: RING_MS });
      ringOpacity.value = withTiming(0, { duration: RING_MS });
    }
  }, [isFavorite, reduceMotion, heartScale, ringScale, ringOpacity]);
  const heartStyle = useAnimatedStyle(() => ({ transform: [{ scale: heartScale.value }] }));
  const ringStyle = useAnimatedStyle(() => ({
    opacity: ringOpacity.value,
    transform: [{ scale: ringScale.value }],
  }));
  const photoDark = variant === 'photo' && dark;
  const iconColor = isFavorite ? colors.danger : photoDark ? colors.text : colors.textMuted;
  const skin =
    variant === 'photo'
      ? photoDark
        ? { bg: PHOTO_DISC_BG_DARK, bc: 'transparent' }
        : { bg: PHOTO_DISC_BG, bc: PHOTO_DISC_BORDER }
      : variant === 'list'
        ? { bg: LIST_DISC_BG, bc: LIST_DISC_BORDER }
        : variant === 'card'
          ? { bg: colors.surfaceElevated, bc: colors.borderSubtle }
          : { bg: colors.surface, bc: isFavorite ? colors.danger : colors.border };

  return (
    <Pressable
      onPress={() => {
        pressedRef.current = true;
        toggle();
      }}
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
        <Animated.View
          pointerEvents="none"
          style={[
            StyleSheet.absoluteFill,
            styles.ring,
            { borderRadius: size / 2, borderColor: colors.danger },
            ringStyle,
          ]}
        />
        <Animated.View style={heartStyle}>
          <LineIcon
            name={isFavorite ? 'heart-filled' : 'heart'}
            size={ICON[variant]}
            color={iconColor}
          />
        </Animated.View>
      </YStack>
    </Pressable>
  );
}

const styles = StyleSheet.create({ ring: { borderWidth: 2 } });
