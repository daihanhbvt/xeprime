import { Ionicons } from '@expo/vector-icons';
import { useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { useLogout } from '@/features/auth/hooks/use-auth';
import { colors, fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';

/**
 * ĐĂNG XUẤT — một dòng, dùng chung cho mọi tấm trượt của khu quản lý.
 *
 * Trước 16/09/2026 khu quản lý không có chỗ nào để thoát ra: lối duy nhất nằm ở cuối menu khu
 * khách (`AccountNav`), mà tài khoản gian hàng tuyến gói gần như không mở tới đó — khu khách của
 * họ chỉ còn ba mục (ADR 0038 điều 7). Người dùng phải xoá app hoặc chờ phiên hết hạn.
 *
 * Ở `components/` của vỏ chứ không viết lại trong từng tấm trượt: hai chỗ đang cần nó (menu tài
 * khoản ở chân drawer, tấm đổi khu ở thanh trên), và đăng xuất là thứ mà hai bản chép tay sẽ lệch
 * nhau đúng ở phần nguy hiểm — hỏi lại, trạng thái đang chạy, và dọn dẹp sau khi xong.
 *
 * `onDone` để nơi gọi ĐÓNG tấm trượt của chính nó: để ngỏ thì tấm trượt (và cả drawer tối phía
 * sau) nằm lại trên trang chợ xe của một phiên đã đăng xuất.
 *
 * Dòng này KHÔNG điều hướng. Rời màn, dọn cache và đưa scope vỏ về khu khách đều là việc của
 * `SessionBoundary` — tầng duy nhất nghe "phiên đã kết thúc", nên nó lo cho CẢ đường phiên chết
 * vì refresh token bị từ chối, không riêng đường người dùng bấm nút.
 */
export function LogoutRow({
  onDone,
  variant = 'row',
}: {
  onDone: () => void;
  /**
   * `row` = dòng trong menu/tấm trượt.
   * `card` = nút đứng riêng trên một TRANG (vd. màn chọn cách cho thuê): có khung, căn giữa — một
   *   dòng menu trơ trọi giữa trang trông như lỗi render.
   * `link` = nút `ghost` ở chân một trang DÀI (vd. màn đăng ký gian hàng), đúng dáng nút
   *   "Quay lại marketplace" mà nó thay thế — chỉ khác icon, màu và việc nó làm.
   */
  variant?: 'row' | 'card' | 'link';
}) {
  const card = variant === 'card';
  const link = variant === 'link';
  const t = useTranslations('ManageCommon.shell');
  const tAccount = useTranslations('Account');
  const tCommon = useTranslations('Common.actions');
  const logout = useLogout();
  const [confirming, setConfirming] = useState(false);

  return (
    <>
      {link ? (
        <Button
          label={t('logout')}
          icon="log-out-outline"
          variant="ghostDanger"
          onPress={() => setConfirming(true)}
        />
      ) : (
        <Pressable
          onPress={() => setConfirming(true)}
          accessibilityRole="menuitem"
          accessibilityLabel={t('logout')}
          style={({ pressed }) =>
            pressed ? (card || link ? styles.cardPressed : styles.rowPressed) : null
          }
        >
          <XStack
            ai="center"
            jc={card || link ? 'center' : 'flex-start'}
            gap={space.sm}
            minHeight={sizing.touchTarget}
            px={space.md}
            {...(card ? { br: radius.lg, bw: 1, bc: colors.border, bg: colors.surface } : {})}
          >
            <Ionicons name="log-out-outline" size={iconSize.md} color={colors.danger} />
            <Text
              f={card || link ? undefined : 1}
              col={colors.danger}
              fos={fontSize.body}
              fow={fontWeight.medium}
              numberOfLines={1}
            >
              {t('logout')}
            </Text>
          </XStack>
        </Pressable>
      )}

      {/* Thao tác không hỏi lại được sau khi làm — hỏi trước, cùng luật với `AccountNav`. */}
      <AlertDialog
        open={confirming}
        title={t('logout')}
        message={tAccount('logoutConfirm')}
        confirmLabel={t('logout')}
        cancelLabel={tCommon('cancel')}
        destructive
        loading={logout.isPending}
        onCancel={() => setConfirming(false)}
        onConfirm={() =>
          logout.mutate(undefined, {
            onSettled: () => {
              setConfirming(false);
              onDone();
            },
          })
        }
      />
    </>
  );
}

const styles = StyleSheet.create({
  rowPressed: { backgroundColor: colors.dangerSurface },
  cardPressed: { opacity: 0.7 },
});
