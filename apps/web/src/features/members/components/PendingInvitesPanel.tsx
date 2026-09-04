'use client';

import { StopOutlined } from '@ant-design/icons';
import { App } from 'antd';
import { useState } from 'react';
import { useTranslations } from 'next-intl';
import { INVITE_STATUS_META, PERMISSION, PLAN_FEATURE, type InviteStatus } from '@xeprime/types';
import { DataTable, actionColumn, type DataTableColumn } from '@/components/data-display/DataTable';
import { StatusTag } from '@/components/data-display/StatusTag';
import { usePermissions } from '@/hooks/use-permissions';
import { useFeature } from '@/hooks/use-feature';
import { useAppFormat } from '@/i18n/use-app-format';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { useErrorMessage } from '@/i18n/use-error-message';
import { MEMBERS_DEFAULT_LIMIT } from '../api';
import { useInvites } from '../hooks/use-invites';
import { useRevokeInvite } from '../hooks/use-member-mutations';
import type { Invite, InviteFilters } from '../types';
import styles from './PendingInvitesPanel.module.css';

const MIN_TABLE_WIDTH = 720;

/**
 * Lời mời ĐANG CHỜ, đứng dưới bảng thành viên.
 *
 * Đây là nửa còn thiếu của luồng mời: gửi thư xong thì người được mời chưa xuất hiện ở bảng
 * thành viên, và không có bảng này thì người gửi không có cách nào biết mình đã mời ai, mời từ
 * bao giờ, hay rút lại lời mời gửi nhầm.
 *
 * Tự ẩn khi không có lời mời nào chờ — một bảng rỗng cố định dưới màn nhân sự là nhiễu, khác
 * hẳn bảng thành viên (luôn hiện vì "chưa có ai" cũng là một thông tin cần biết).
 */
export function PendingInvitesPanel() {
  const t = useTranslations('Members.invites');
  // Toast dùng chung bó `Members.toast` với bảng thành viên — hai bảng cùng một tính năng thì
  // câu thông báo cũng phải cùng một chỗ.
  const tToast = useTranslations('Members.toast');
  const tCommon = useTranslations('Common');
  const { message } = App.useApp();
  const { has } = usePermissions();
  const fmt = useAppFormat();
  const domainLabel = useDomainLabel();
  const errorMessage = useErrorMessage();
  const members = useFeature(PLAN_FEATURE.MEMBERS);

  const [filters, setFilters] = useState<InviteFilters>({});
  const { data, isError, isFetching, refetch } = useInvites(filters);
  const revoke = useRevokeInvite();

  const canRevoke = has(PERMISSION.MEMBER_INVITE) && members.canWrite;
  const items = data?.items ?? [];
  const meta = data?.meta ?? { page: 1, limit: MEMBERS_DEFAULT_LIMIT, total: 0, hasNext: false };

  // Chưa mời ai thì không dựng bảng. Nhưng lỗi tải thì PHẢI hiện — im lặng lúc đó là nói dối
  // rằng không có lời mời nào đang chờ.
  if (items.length === 0 && !isError && !isFetching) return null;

  function handleRevoke(id: string) {
    revoke.mutate(id, {
      onSuccess: () => message.success(tToast('revoked')),
      onError: (err) => message.error(errorMessage(err)),
    });
  }

  const columns: DataTableColumn<Invite>[] = [
    {
      title: t('columns.email'),
      key: 'email',
      width: 260,
      render: (_, row) => <span className={styles.email}>{row.email}</span>,
    },
    {
      title: t('columns.role'),
      key: 'role',
      width: 160,
      render: (_, row) => domainLabel('tenantRole', row.roleKey, row.roleKey),
    },
    {
      title: t('columns.status'),
      key: 'status',
      width: 130,
      render: (_, row) => (
        <StatusTag
          value={row.status as InviteStatus}
          meta={INVITE_STATUS_META}
          group="inviteStatus"
        />
      ),
    },
    {
      title: t('columns.expiresAt'),
      key: 'expiresAt',
      width: 160,
      render: (_, row) => fmt.dateTime(row.expiresAt),
    },
    {
      title: t('columns.createdBy'),
      key: 'createdBy',
      width: 160,
      render: (_, row) => row.createdByName ?? tCommon('labels.emptyValue'),
    },
    actionColumn<Invite>((row) => [
      {
        key: 'revoke',
        label: t('revoke'),
        icon: <StopOutlined />,
        danger: true,
        hidden: !canRevoke,
        loading: revoke.isPending && revoke.variables === row.id,
        confirm: {
          title: t('revokeConfirm'),
          okText: t('revoke'),
          cancelText: tCommon('actions.close'),
        },
        onClick: () => handleRevoke(row.id),
      },
    ]),
  ];

  return (
    <section className={styles.section} aria-labelledby="xp-pending-invites">
      <h2 id="xp-pending-invites" className={styles.title}>
        {t('title')}
      </h2>
      <DataTable<Invite>
        label={t('tableLabel')}
        columns={columns}
        items={items}
        rowKey={(row) => row.id}
        minWidth={MIN_TABLE_WIDTH}
        loading={isFetching}
        error={isError && !data ? { title: t('loadError'), onRetry: () => void refetch() } : null}
        empty={{ title: t('empty') }}
        pagination={{
          meta,
          onChange: (page, limit) => setFilters((prev) => ({ ...prev, page, limit })),
          totalLabel: (total) => t('total', { count: total }),
        }}
      />
    </section>
  );
}
