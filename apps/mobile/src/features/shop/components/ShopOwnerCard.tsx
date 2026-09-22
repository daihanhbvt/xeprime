import { Ionicons } from '@expo/vector-icons';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR, TENANT_ROLE, toLocalVnPhone } from '@xeprime/types';

import { Button } from '@/components/ui/Button';
import { Card } from '@/components/ui/Card';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { colors, fontSize, fontWeight, iconSize, space } from '@/theme/tokens';
import type { ShopOwnerAccount } from '../api';

/**
 * CHỦ GIAN HÀNG — tài khoản sở hữu, chỉ ĐỌC. Bản native của `ShopOwnerSection` bên web.
 *
 * ## Vì sao không có ô nhập nào ở đây
 *
 * Nguồn duy nhất là `tenants.owner_user_id → users`, và nó đổi qua đúng luồng của nó: tên ở hồ sơ
 * cá nhân, email/SĐT qua xác minh OTP ở màn bảo mật tài khoản. Đặt một ô "Họ tên chủ gian hàng" ở
 * đây nghĩa là cho bất kỳ ai có `tenant.update` — gồm cả `shop_manager` — viết lại danh tính của
 * người CHỦ, đúng lằn ranh mà ADR 0038 điều 3 tách ra.
 *
 * ## Vì sao hiện cờ "đã xác minh"
 *
 * Vì nó là thứ duy nhất ở đây mà một ô chữ không nói được. Chưa xác minh thì nói thẳng chưa xác
 * minh — không thấy khoảng cách đó thì chủ shop tưởng mình đã xong.
 *
 * Lối sang màn bảo mật chỉ hiện với CHÍNH CHỦ: với quản lý/nhân viên, nút nằm dưới thông tin của
 * NGƯỜI KHÁC nhưng lại mở tài khoản của chính họ — một nút nói dối về việc nó làm gì.
 */
export function ShopOwnerCard({
  owner,
  onOpenSecurity,
}: {
  owner: ShopOwnerAccount;
  /** Mở màn bảo mật tài khoản — nơi gọi giữ `useNavigateOnce` nên nó điều hướng, không phải thẻ này. */
  onOpenSecurity: () => void;
}) {
  const t = useTranslations('Shop.owner');
  const { data: user } = useCurrentUser();

  const isOwner = user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER && user.id === owner.userId;

  return (
    <Card>
      <YStack gap={space.sm}>
        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.h4} fow={fontWeight.semibold}>
            {t('title')}
          </Text>
          <Text col={colors.textMuted} fos={fontSize.bodySm}>
            {t('hint')}
          </Text>
        </YStack>

        <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {owner.displayName}
        </Text>

        <YStack gap={space.xs}>
          <ContactRow
            icon="mail-outline"
            label={t('email')}
            value={owner.email ?? null}
            emptyLabel={t('noEmail')}
            verified={owner.emailVerified}
          />
          <ContactRow
            icon="call-outline"
            label={t('phone')}
            /* SĐT lưu dạng `84…`; đọc lên thì về dạng `09…` như người Việt vẫn đọc số của mình. */
            value={owner.phone ? toLocalVnPhone(owner.phone) : null}
            emptyLabel={t('noPhone')}
            verified={owner.phoneVerified}
          />
        </YStack>

        {isOwner ? (
          <XStack>
            <Button
              label={t('manageLogin')}
              variant="secondary"
              size="sm"
              block={false}
              icon="key-outline"
              onPress={onOpenSecurity}
            />
          </XStack>
        ) : null}
      </YStack>
    </Card>
  );
}

function ContactRow({
  icon,
  label,
  value,
  emptyLabel,
  verified,
}: {
  icon: 'mail-outline' | 'call-outline';
  label: string;
  value: string | null;
  emptyLabel: string;
  verified: boolean;
}) {
  const t = useTranslations('Shop.owner');

  return (
    <XStack ai="center" gap={space.sm}>
      <XStack ai="center" gap={space.xs} w={132} flexShrink={0}>
        <Ionicons name={icon} size={iconSize.xs} color={colors.textMuted} />
        <Text col={colors.textMuted} fos={fontSize.label}>
          {label}
        </Text>
      </XStack>
      <XStack f={1} minWidth={0} ai="center" gap={space.xs} jc="flex-end">
        <Text
          col={value ? colors.text : colors.placeholder}
          fos={fontSize.bodySm}
          numberOfLines={1}
        >
          {value ?? emptyLabel}
        </Text>
        {value ? (
          <StatusBadge
            label={verified ? t('verified') : t('unverified')}
            color={verified ? STATUS_COLOR.SUCCESS : STATUS_COLOR.WARNING}
            size="sm"
          />
        ) : null}
      </XStack>
    </XStack>
  );
}
