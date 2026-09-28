import { LinearGradient } from 'expo-linear-gradient';
import { StyleSheet } from 'react-native';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ACCOUNT_TRACK, resolveAccountTrack } from '@xeprime/types';
import type { AccountTrackInput } from '@xeprime/types';
import { Avatar } from '@/components/ui/Avatar';
import { VerifiedName } from '@/components/ui/VerifiedName';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import { AccountTrackBadge } from './AccountTrackBadge';

/**
 * KHỐI NHẬN DIỆN của một con người — "tôi là ai trên sàn này".
 *
 * MỘT khối cho cả hai chỗ hỏi đúng câu đó: đầu tab Tài khoản bên khu khách (`AccountScreen`) và
 * đầu màn "Tài khoản & bảo mật" bên khu quản lý (`ManageAccountScreen`). Trước khi gom, hai màn
 * tự dựng hero riêng và đã lệch nhau ngay từ ngày đầu — một bên có dải gold, con dấu và nhãn
 * tuyến, bên kia là ảnh 56dp với tên đen. Cùng một người, hai bộ mặt.
 *
 * ## Chủ gian hàng phải NHÌN RA được, không chỉ đọc ra
 *
 * Tuyến gói là thứ họ trả tiền hằng tháng để có, nên nó được ba dấu hiệu chồng lên nhau chứ
 * không phải một dòng chữ:
 *
 *   1. dải GOLD nhạt đổ xuống trắng làm nền — cùng chất liệu với `ShopEntryCard`, nên hai khối
 *      gold trên cùng một màn đọc ra là một hệ chứ không phải hai thứ trang trí rời;
 *   2. TÊN màu gold đậm, kèm CON DẤU ngay sau tên — chỗ mắt dừng lâu nhất trên khối này;
 *   3. vòng gold quanh ảnh đại diện.
 *
 * Con dấu nằm cạnh TÊN chứ không đè lên ảnh (`Avatar` nhận `ring`, không nhận `verifiedLabel`):
 * hai con dấu trong cùng một khối là hai lần nói một điều, và cái nằm cạnh tên là cái đọc lên
 * được thành câu — đúng quy ước mọi nền tảng dùng cho tài khoản đã xác minh.
 *
 * Các vai khác giữ nền xám trung tính, tên đen, ảnh trần: dải gold và con dấu là một LỜI KHẲNG
 * ĐỊNH về danh tính, trải nó cho mọi tài khoản là làm nó hết nghĩa.
 */

/** Đường kính ảnh — vòng nhấn của chủ gian hàng cộng vào TRONG con số này. */
const AVATAR = 96;

/** Con dấu cạnh tên: nhỉnh hơn chữ `h3` một chút, đủ thấy mà không cao hơn dòng chữ. */
const NAME_MARK = 20;

/** `LinearGradient` là view của Expo, không phải của Tamagui — nó chỉ nhận style RN thuần. */
const styles = StyleSheet.create({
  hero: {
    alignItems: 'center',
    gap: space.sm,
    paddingHorizontal: space.md,
    paddingVertical: space.lg,
  },
});

export function AccountIdentityHero({
  name,
  avatarUrl,
  subtitle,
  tenant,
}: {
  name: string;
  avatarUrl: string | null;
  /** Dòng ngay dưới tên: vai trong gian hàng, hoặc "Tài khoản XePrime" khi không có vai nào. */
  subtitle: string;
  tenant: AccountTrackInput | null | undefined;
}) {
  const t = useTranslations('Account');

  /*
   * CHỈ chủ gian hàng tuyến gói được đeo dấu (ADR 0038): họ là người đã qua duyệt hồ sơ VÀ đang
   * trả thuê bao. Chủ xe cá nhân, nhân viên gian hàng và tenant chưa cấu hình gói đều KHÔNG —
   * gắn dấu cho tất cả là làm dấu mất hết nghĩa, kể cả trên chính hồ sơ của người sở hữu nó.
   */
  const isShopOwner = resolveAccountTrack(tenant ?? null).track === ACCOUNT_TRACK.SHOP_OWNER;

  return (
    <LinearGradient
      colors={
        isShopOwner
          ? [colors.primaryLight, colors.surface]
          : [colors.surfaceMuted, colors.surfaceMuted]
      }
      start={{ x: 0.5, y: 0 }}
      end={{ x: 0.5, y: 1 }}
      style={styles.hero}
    >
      <Avatar
        name={name}
        url={avatarUrl}
        size={AVATAR}
        verifiedLabel={isShopOwner ? t('trackBadge.verifiedHint') : undefined}
      />

      <YStack ai="center" gap={space.xs}>
        <YStack ai="center" gap={2}>
          <VerifiedName
            name={name}
            verifiedLabel={isShopOwner ? t('trackBadge.verifiedHint') : undefined}
            size={fontSize.h3}
            weight={fontWeight.bold}
            markSize={NAME_MARK}
            numberOfLines={2}
            center
            /* Con dấu trên ảnh ngay phía trên đã đọc lên câu ấy rồi. */
            decorativeMark
          />
          <Text col={colors.textMuted} fos={fontSize.bodySm} numberOfLines={1}>
            {subtitle}
          </Text>
        </YStack>

        {/*
          Nhãn TUYẾN ngay dưới tên — cùng chỗ web đặt nó (`AccountView`). Đây là câu trả lời cho
          "tôi đang là ai trên sàn này", và nó quyết định menu của họ trông ra sao; bắt người dùng
          mở màn gói mới biết là giấu câu trả lời sau một trang nói về hoá đơn.

          Vỏ `plain`: con dấu đã nằm cạnh tên ngay phía trên, nên một viên nhãn gold ở đây là câu
          thứ hai nói cùng một điều. Còn lại một dòng chữ gold căn giữa, thẳng cột với tên.
        */}
        <AccountTrackBadge tenant={tenant ?? null} variant="plain" center />
      </YStack>
    </LinearGradient>
  );
}
