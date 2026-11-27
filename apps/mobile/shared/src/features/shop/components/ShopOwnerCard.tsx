import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR, TENANT_ROLE, toLocalVnPhone } from '@xeprime/types';

import { LineIcon } from '@/components/icons/LineIcon';
import { Avatar } from '@/components/ui/Avatar';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { InfoCard, InfoRow, InfoRows } from '@/components/ui/InfoCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, iconSize, typeScale } from '@/theme/tokens';
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
/** Ảnh 48 tròn có viền (Figma `24231:113381`). */
const OWNER_AVATAR_SIZE = 48;
/** Dấu tích "Tick Circle" 16 xanh (`24231:113388`). */
const VERIFIED_MARK = 16;
/** Ảnh ↔ tên 8; các hàng cách 8 (`24231:113378`). */
const OWNER_GAP = 8;

/**
 * Bố cục theo Figma Partner "Quản lý gian hàng" (`24231:113310`): đầu thẻ "Chủ gian hàng" + nút
 * Profile 40 ở góc (= "Quản lý tài khoản", chỉ CHÍNH CHỦ), ảnh 48 + tên 14 đậm vừa, hai hàng nhãn ↔
 * giá trị căn phải kèm dấu tích xanh hoặc nhãn "Chưa xác minh".
 */
export function ShopOwnerCard({
  owner,
  onOpenSecurity,
}: {
  owner: ShopOwnerAccount;
  /** Mở màn bảo mật tài khoản — nơi gọi giữ `useNavigateOnce` nên nó điều hướng, không phải thẻ này. */
  onOpenSecurity: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.owner');
  const { data: user } = useCurrentUser();

  const isOwner = user?.tenant?.roleKey === TENANT_ROLE.SHOP_OWNER && user.id === owner.userId;

  return (
    <InfoCard
      look="figma"
      title={t('title')}
      hint={t('hint')}
      extra={
        isOwner ? (
          <IconSquareButton label={t('manageAccount')} onPress={onOpenSecurity} size="card">
            <LineIcon name="profile" size={iconSize.lg} color={colors.textMuted} />
          </IconSquareButton>
        ) : undefined
      }
    >
      <YStack gap={OWNER_GAP}>
        <XStack ai="center" gap={OWNER_GAP}>
          <Avatar name={owner.displayName} url={owner.avatarUrl ?? null} size={OWNER_AVATAR_SIZE} bordered />
          <Text
            f={1}
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.semibold}
          >
            {owner.displayName}
          </Text>
        </XStack>

        <InfoRows gap={OWNER_GAP}>
          <ContactRow
            label={t('email')}
            value={owner.email ?? null}
            emptyLabel={t('noEmail')}
            verified={owner.emailVerified}
          />
          <ContactRow
            label={t('phone')}
            /* SĐT lưu dạng `0…` (ADR 0082); vẫn quy để hàng cũ còn `84…` hiện đúng. */
            value={owner.phone ? toLocalVnPhone(owner.phone) : null}
            emptyLabel={t('noPhone')}
            verified={owner.phoneVerified}
          />
        </InfoRows>
      </YStack>
    </InfoCard>
  );
}

function ContactRow({
  label,
  value,
  emptyLabel,
  verified,
}: {
  label: string;
  value: string | null;
  emptyLabel: string;
  verified: boolean;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.owner');
  return (
    <InfoRow
      label={label}
      value={value}
      emptyLabel={emptyLabel}
      suffix={
        value ? (
          verified ? (
            <YStack accessible accessibilityRole="image" accessibilityLabel={t('verified')}>
              <LineIcon name="tick-circle-fill" size={VERIFIED_MARK} color={colors.success} />
            </YStack>
          ) : (
            <StatusBadge label={t('unverified')} color={STATUS_COLOR.WARNING} size="sm" />
          )
        ) : null
      }
    />
  );
}
