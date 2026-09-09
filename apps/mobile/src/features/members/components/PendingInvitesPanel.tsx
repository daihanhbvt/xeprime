import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  INVITE_STATUS,
  INVITE_STATUS_META,
  PERMISSION,
  PLAN_FEATURE,
  STATUS_COLOR,
  type InviteStatus,
  type StatusColor,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BadgeRows, type BadgeRowItem } from '@/components/ui/BadgeRows';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { CardAccent } from '@/components/ui/CardAccent';
import { CardActionBar, type CardAction } from '@/components/ui/CardActionBar';
import type { IconName } from '@/components/ui/Chip';
import { IconDisc } from '@/components/ui/IconDisc';
import { IconLine } from '@/components/ui/IconLine';
import { Pagination } from '@/components/ui/Pagination';
import { RecordCardSkeleton } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useNow } from '@/hooks/use-now';
import { FIRST_PAGE } from '@/queries/use-clamped-page';
import { colors, fontSize, fontWeight, space } from '@/theme/tokens';
import type { Invite } from '../api';
import { useInvites, useRevokeInvite } from '../hooks/use-members';

/** Đường kính đĩa phong bì — bằng avatar của `MemberCard`, để hai loại thẻ cùng đường chân. */
const DISC_SIZE = 36;

const HOUR_MS = 60 * 60 * 1000;
const HOURS_PER_DAY = 24;

/** Dưới ngưỡng này thì viên đếm ngược chuyển sang cảnh báo — còn đủ thời gian nhắc lại một lần. */
const EXPIRY_WARN_DAYS = 2;

/**
 * Còn bao lâu thì lời mời hết hiệu lực, ở dạng ĐỌC ĐƯỢC.
 *
 * Bản trước in nguyên mốc `12/09/2026 14:30`. Đó là dữ liệu, không phải câu trả lời: người gửi
 * lời mời hỏi "cái này sắp chết chưa, có phải mời lại không", và họ phải tự trừ ngày trong đầu
 * mới biết. Viên đếm ngược trả lời thẳng, và đổi màu khi câu trả lời là "sắp".
 *
 * Chỉ dùng cho lời mời ĐANG CHỜ: mọi trạng thái khác đã kết thúc, đếm ngược tới một cái hạn
 * không còn tác dụng gì là nói thêm một thứ sai.
 *
 * Hai đầu đều là MỐC THỜI GIAN (không phải ngày lịch như hạn GPLX ở `DriverCard`), nên trừ thẳng
 * bằng epoch — không mượn múi giờ nào cả, và vì thế không có đường nào lệch một ngày.
 *
 * Giờ hiện tại đọc từ đồng hồ CHUNG của app, không gọi thẳng Date.now() trong lúc render: một
 * giá trị đổi giữa hai lần render mà React không biết là thứ luật thuần khiết của hook cấm, và
 * đồng hồ chung cũng là thứ giữ MỘT interval cho cả danh sách thay vì mỗi thẻ một cái (xem
 * use-now.ts). Nhờ nó, "còn 1 ngày" tự chuyển thành "Hết hạn hôm nay" mà không phải rời màn.
 */
function useExpiryBadge(expiresAt: string): { label: string; color: StatusColor } | null {
  const t = useTranslations('Members.invites');
  const now = useNow();

  const msLeft = Date.parse(expiresAt) - now;
  if (Number.isNaN(msLeft) || msLeft <= 0) return null;

  const hoursLeft = msLeft / HOUR_MS;
  if (hoursLeft < HOURS_PER_DAY) {
    return { label: t('expiresToday'), color: STATUS_COLOR.WARNING };
  }

  const days = Math.ceil(hoursLeft / HOURS_PER_DAY);
  return {
    label: t('expiresIn', { days }),
    color: days <= EXPIRY_WARN_DAYS ? STATUS_COLOR.WARNING : STATUS_COLOR.NEUTRAL,
  };
}

/**
 * Lời mời ĐANG CHỜ — nửa còn thiếu của luồng mời.
 *
 * Gửi thư xong thì người được mời chưa xuất hiện ở danh sách thành viên, và không có khối này
 * thì người gửi không có cách nào biết mình đã mời ai, mời từ bao giờ, hay rút lại lời mời gửi
 * nhầm.
 *
 * Tự ẩn khi không có lời mời nào chờ — một khối rỗng cố định dưới màn nhân sự là nhiễu. Nhưng
 * LỖI TẢI thì phải hiện: im lặng lúc đó là nói dối rằng không có lời mời nào đang chờ.
 *
 * Thẻ dựng theo đúng khuôn `MemberCard` đứng ngay trên nó — vạch trạng thái ở mép trái, đĩa dẫn
 * đầu, dải viên nhãn, thanh thao tác chạm hai mép. Bản trước là bốn dòng chữ mờ xếp chồng và một
 * nút đỏ lạc lõng: cùng một danh sách mà nửa trên đọc ra một sản phẩm, nửa dưới một sản phẩm
 * khác. Đĩa mang màu THƯƠNG HIỆU chứ không mang màu trạng thái — vạch mép trái và viên nhãn đã
 * nói trạng thái hai lần rồi, đĩa nói "đây là một lời mời, không phải một con người".
 */
export function PendingInvitesPanel({ enabled }: { enabled: boolean }) {
  const t = useTranslations('Members.invites');
  const tToast = useTranslations('Members.toast');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const toast = useAppToast();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const membersFeature = useFeature(PLAN_FEATURE.MEMBERS);

  const [page, setPage] = useState(FIRST_PAGE);
  const [revoking, setRevoking] = useState<Invite | null>(null);

  const query = useInvites({ page }, enabled);
  const revoke = useRevokeInvite();

  const canRevoke = permissions.has(PERMISSION.MEMBER_INVITE) && membersFeature.canWrite;
  const items = query.data?.items ?? [];
  const meta = query.data?.meta;
  const loading = query.isFetching && !query.data;

  if (items.length === 0 && !query.isError && !loading) return null;

  const confirmRevoke = () => {
    const invite = revoking;
    if (!invite) return;
    revoke.mutate(invite.id, {
      onSuccess: () => {
        setRevoking(null);
        toast.showSuccess(tToast('revoked'));
      },
      onError: (err) => {
        setRevoking(null);
        toast.showError(errorMessage(err));
      },
    });
  };

  return (
    <YStack gap={space.sm}>
      {/*
        Hàng tiêu đề mang ĐĨA và TỔNG SỐ, không phải một dòng chữ đậm trơ.

        Khối này nằm ở CHÂN một danh sách khác, nên nó phải tự nói ra mình là một khối riêng —
        một dòng chữ đậm sau mười cái thẻ đọc ra như phần đuôi của thẻ cuối cùng. Con số bên phải
        là thứ người quản lý cần trước khi quyết định có mở ra đọc không.
      */}
      <XStack ai="center" gap={space.sm}>
        <IconDisc
          icon="mail-unread-outline"
          tone={colors.primaryActive}
          surface={colors.primaryLight}
        />
        <Text f={1} col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
          {t('title')}
        </Text>
        {meta ? (
          <Text col={colors.textMuted} fos={fontSize.meta}>
            {t('total', { count: meta.total })}
          </Text>
        ) : null}
      </XStack>

      {query.isError && !query.data ? (
        <Callout tone="warning" title={t('loadError')}>
          {errorMessage(query.error)}
        </Callout>
      ) : null}

      {loading ? <RecordCardSkeleton /> : null}

      {items.map((invite) => (
        <InviteCard
          key={invite.id}
          invite={invite}
          canRevoke={canRevoke}
          pending={revoke.isPending}
          onRevoke={setRevoking}
          expiresAtLabel={t('expiresAtLine', { at: fmt.dateTime(invite.expiresAt) })}
          roleLabel={domainLabel('tenantRole', invite.roleKey, invite.roleKey)}
          statusLabel={domainLabel('inviteStatus', invite.status)}
        />
      ))}

      {meta && meta.total > meta.limit ? (
        <Pagination page={meta.page} limit={meta.limit} total={meta.total} onChange={setPage} />
      ) : null}

      <AlertDialog
        open={revoking !== null}
        title={t('revokeConfirm')}
        confirmLabel={t('revoke')}
        cancelLabel={tActions('close')}
        destructive
        loading={revoke.isPending}
        onConfirm={confirmRevoke}
        onCancel={() => setRevoking(null)}
      />
    </YStack>
  );
}

/**
 * MỘT lời mời.
 *
 * Component riêng vì `useExpiryBadge` là một hook: gọi nó trong `items.map()` của khối cha là
 * gọi hook trong vòng lặp — số lần gọi đổi theo độ dài danh sách, đúng thứ luật hook cấm.
 *
 * Nhãn dịch sẵn được TRUYỀN VÀO thay vì dịch tại đây: khối cha đã cầm `t`/`fmt`/`domainLabel`,
 * và gọi lại bốn hook dịch cho mỗi hàng là bốn lần subscribe thừa trên một danh sách có phân
 * trang.
 */
function InviteCard({
  invite,
  canRevoke,
  pending,
  onRevoke,
  expiresAtLabel,
  roleLabel,
  statusLabel,
}: {
  invite: Invite;
  canRevoke: boolean;
  /** Có mutation thu hồi đang chạy (bất kỳ lời mời nào) — khoá cả thanh thao tác. */
  pending: boolean;
  onRevoke: (invite: Invite) => void;
  expiresAtLabel: string;
  roleLabel: string;
  statusLabel: string;
}) {
  const t = useTranslations('Members.invites');
  const status = invite.status as InviteStatus;
  const statusMeta = INVITE_STATUS_META[status];
  const expiry = useExpiryBadge(invite.expiresAt);

  const badges: BadgeRowItem[] = [
    {
      key: 'role',
      label: roleLabel,
      node: <StatusBadge label={roleLabel} color={STATUS_COLOR.NEUTRAL} size="sm" />,
    },
    /* Đếm ngược CHỈ cho lời mời còn sống — xem `useExpiryBadge`. */
    ...(status === INVITE_STATUS.PENDING && expiry
      ? [
          {
            key: 'expiry',
            label: expiry.label,
            node: <StatusBadge label={expiry.label} color={expiry.color} size="sm" />,
          },
        ]
      : []),
  ];

  const actions: CardAction[] = canRevoke
    ? [
        {
          key: 'revoke',
          label: t('revoke'),
          icon: 'close-circle-outline' as IconName,
          tone: 'danger' as const,
          disabled: pending,
          onPress: () => onRevoke(invite),
        },
      ]
    : [];

  return (
    <Card padded={false}>
      <XStack>
        <CardAccent color={statusMeta.color} />

        <YStack f={1} minWidth={0}>
          <YStack p={space.sm} gap={space.xs}>
            <XStack ai="center" gap={space.sm}>
              <IconDisc
                icon="mail-outline"
                tone={colors.primaryActive}
                surface={colors.primaryLight}
                size={DISC_SIZE}
              />

              <YStack f={1} minWidth={0} gap={2}>
                <Text
                  col={colors.text}
                  fos={fontSize.bodySm}
                  fow={fontWeight.semibold}
                  numberOfLines={1}
                >
                  {invite.email}
                </Text>
                {/* Người mời chỉ hiện khi CÓ — một dòng "Người mời: —" không nói được gì. */}
                {invite.createdByName ? (
                  <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={1}>
                    {t('invitedBy', { name: invite.createdByName })}
                  </Text>
                ) : null}
              </YStack>

              <StatusBadge label={statusLabel} color={statusMeta.color} size="sm" />
            </XStack>

            <BadgeRows items={badges} />

            <IconLine icon="time-outline">{expiresAtLabel}</IconLine>
          </YStack>

          <CardActionBar actions={actions} />
        </YStack>
      </XStack>
    </Card>
  );
}
