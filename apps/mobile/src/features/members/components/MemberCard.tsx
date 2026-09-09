import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  MEMBERSHIP_STATUS_META,
  STATUS_COLOR,
  TENANT_ROLE,
  type MembershipStatus,
} from '@xeprime/types';
import { Avatar } from '@/components/ui/Avatar';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { Member } from '../api';

/**
 * Ảnh đại diện nhỏ hơn mặc định (40).
 *
 * Thẻ này chạy ở đệm 8 / khe 4 như `VehicleCard`, và một avatar 40 trong khung đó cao hơn cả hai
 * dòng chữ nó đứng cạnh — nó thành thứ to nhất thẻ trong khi vai của nó chỉ là giúp nhận ra một
 * khuôn mặt quen. 36 vừa bằng chiều cao khối tên + email.
 */
const AVATAR_SIZE = 36;

/**
 * MỘT thành viên trong danh sách nhân sự — bản native của một hàng `DataTable` bên web.
 *
 * **Thẻ CHẬT, đúng nhịp của `VehicleCard`: đệm 8, khe 4** — cùng một nhịp với thẻ chi nhánh và
 * thẻ tài xế, vì ba màn này nằm cạnh nhau trong cùng một khu quản lý và ba nhịp khác nhau thì
 * đọc ra như ba sản phẩm.
 *
 * VAI TRÒ là viên nhãn DUY NHẤT của dải: màn này tồn tại để trả lời "ai được làm gì trong gian
 * hàng", và vai trò chính là câu trả lời đó. Trạng thái thành viên gần như luôn là "đang hoạt
 * động", nên nó lên góc trên phải — thấy được cùng lúc với cái tên, và không chiếm chỗ dễ đọc
 * nhất của dải.
 *
 * Ba luật hiện/ẩn giống HỆT web, và cả ba là luật của backend chứ không phải thẩm mỹ:
 *  1. Chủ gian hàng không đổi vai trò và không bị gỡ từ màn này;
 *  2. Không ai tự đổi vai trò của chính mình (đó là đường tự nâng quyền);
 *  3. Không ai tự gỡ chính mình.
 *
 * Ẩn nút chỉ là trải nghiệm — `MembersService` vẫn từ chối cả ba trường hợp.
 */
export function MemberCard({
  member,
  isMe,
  canUpdateRole,
  canRemove,
  pending,
  onChangeRole,
  onRemove,
}: {
  member: Member;
  isMe: boolean;
  canUpdateRole: boolean;
  canRemove: boolean;
  /** Có mutation đang chạy trên CHÍNH thành viên này. */
  pending: boolean;
  onChangeRole: (member: Member) => void;
  onRemove: (member: Member) => void;
}) {
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common.labels');
  const domainLabel = useDomainLabel();

  const isOwner = member.roleKey === TENANT_ROLE.SHOP_OWNER;
  const canEditThis = canUpdateRole && !isOwner && !isMe;
  const canRemoveThis = canRemove && !isOwner && !isMe;

  const roleLabel = domainLabel('tenantRole', member.roleKey, member.roleKey);
  const statusMeta = MEMBERSHIP_STATUS_META[member.status as MembershipStatus];
  const statusLabel = domainLabel('membershipStatus', member.status, statusMeta.label);

  const badges: BadgeRowItem[] = [
    {
      key: 'role',
      label: roleLabel,
      /*
       * Chủ gian hàng mang sắc thương hiệu, các vai khác trung tính: đó là vai DUY NHẤT không đổi
       * và không gỡ được, nên nó cần nhận ra được ngay khi lướt — chính là câu hỏi "ai là chủ ở
       * đây" mà người mở màn này hay hỏi nhất.
       */
      node: (
        <StatusBadge
          label={roleLabel}
          color={isOwner ? STATUS_COLOR.ACCENT : STATUS_COLOR.NEUTRAL}
          size="sm"
        />
      ),
    },
  ];

  const actions: CardAction[] = [
    ...(canEditThis
      ? [
          {
            key: 'role',
            label: t('actions.changeRole'),
            icon: 'swap-horizontal-outline' as IconName,
            disabled: pending,
            onPress: () => onChangeRole(member),
          },
        ]
      : []),
    ...(canRemoveThis
      ? [
          {
            key: 'remove',
            label: t('actions.remove'),
            icon: 'person-remove-outline' as IconName,
            tone: 'danger' as const,
            disabled: pending,
            loading: pending,
            onPress: () => onRemove(member),
          },
        ]
      : []),
  ];

  return (
    /*
     * `padded={false}` để thanh thao tác chạm được hai mép thẻ. Thành viên không có thao tác nào
     * (chủ gian hàng, hoặc chính mình) thì `CardActionBar` tự không dựng gì — thẻ chỉ còn phần
     * thân, vẫn đúng đệm 8pt của nó.
     */
    <Card padded={false}>
      <XStack>
        <CardAccent color={statusMeta.color} />

        <YStack f={1} minWidth={0}>
          <YStack p={space.sm} gap={space.xs}>
            <XStack ai="center" gap={space.sm}>
              <Avatar name={member.displayName} url={member.avatarUrl ?? null} size={AVATAR_SIZE} />

              <YStack f={1} minWidth={0} gap={2}>
                <Text
                  col={colors.text}
                  fos={fontSize.body}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {member.displayName}
                  {isMe ? ` ${t('you')}` : ''}
                </Text>
                <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={1}>
                  {member.email ?? tCommon('emptyValue')}
                </Text>
              </YStack>

              {/*
                TRẠNG THÁI ở góc trên phải — cùng chỗ với thẻ Tài xế, Chi nhánh, Khách hàng, và
                cùng màu với vạch mép trái. Trước đó nó nằm trong dải nhãn: vạch xanh ở mép trái
                mà chip dẫn đầu dải lại là vai trò (xám), nên hai kênh màu của cùng một thẻ nói
                hai chuyện khác nhau.

                Vai trò VẪN dẫn đầu dải nhãn — màn này tồn tại để trả lời "ai được làm gì", và
                trạng thái thành viên gần như luôn là "đang hoạt động" nên nó không phân biệt được
                ai với ai. Nó lên góc phải là để KHỎI chiếm chỗ dễ đọc nhất của dải, không phải vì
                nó quan trọng hơn.
              */}
              <StatusBadge label={statusLabel} color={statusMeta.color} size="sm" />
            </XStack>

            <BadgeRows items={badges} />
          </YStack>

          <CardActionBar actions={actions} />
        </YStack>
      </XStack>
    </Card>
  );
}
