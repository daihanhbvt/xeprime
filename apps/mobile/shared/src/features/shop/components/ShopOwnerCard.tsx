import CheckOutlined from '@ant-design/icons-svg/es/asn/CheckOutlined';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { STATUS_COLOR, TENANT_ROLE, toLocalVnPhone } from '@xeprime/types';

import { AntIcon } from '@/components/icons/AntIcon';
import { Avatar } from '@/components/ui/Avatar';
import { Button } from '@/components/ui/Button';
import { InfoCard, InfoRow, InfoRows } from '@/components/ui/InfoCard';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useCurrentUser } from '@/features/auth/hooks/use-auth';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
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
const OWNER_AVATAR_SIZE = 40;
/** Dấu tích xanh 16px của web `.verifiedMark` (`ShopOwnerSection.module.css`). */
const VERIFIED_MARK = 16;

/**
 * Bố cục đúng `ShopOwnerSection` web ở khổ điện thoại (design `23999:111299`): khung `InfoCard`,
 * ảnh 40 + tên (14 đậm, khe 16), hai dòng nhãn ↔ giá trị căn phải với dấu tích xanh hoặc nhãn
 * "Chưa xác minh", rồi nút viền "Quản lý tài khoản".
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
    <InfoCard title={t('title')} hint={t('hint')}>
      <XStack ai="center" gap={space.md}>
        <Avatar name={owner.displayName} url={owner.avatarUrl ?? null} size={OWNER_AVATAR_SIZE} />
        <Text f={1} col={colors.text} fos={fontSize.body} lineHeight={20} fow={fontWeight.semibold}>
          {owner.displayName}
        </Text>
      </XStack>

      <InfoRows>
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

      {isOwner ? (
        <XStack flexWrap="wrap" gap={space.sm}>
          <Button
            label={t('manageAccount')}
            variant="secondary"
            size="md"
            shape="square"
            block={false}
            icon="person-outline"
            onPress={onOpenSecurity}
          />
        </XStack>
      ) : null}
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
            <YStack
              w={VERIFIED_MARK}
              h={VERIFIED_MARK}
              br={VERIFIED_MARK / 2}
              bg={colors.success}
              ai="center"
              jc="center"
              accessible
              accessibilityRole="image"
              accessibilityLabel={t('verified')}
            >
              <AntIcon icon={CheckOutlined} size={9} color={colors.textInverse} />
            </YStack>
          ) : (
            <StatusBadge label={t('unverified')} color={STATUS_COLOR.WARNING} size="sm" />
          )
        ) : null
      }
    />
  );
}
