'use client';

import { CheckOutlined, EyeOutlined, MinusOutlined } from '@ant-design/icons';
import { useTranslations } from 'next-intl';
import { Fragment, type ReactNode } from 'react';
import {
  ROLE_MATRIX_GROUP,
  ROLE_MATRIX_LEVEL,
  ROLE_MATRIX_ROWS,
  TENANT_ROLE_RANK,
  roleMatrixLevel,
  type RoleMatrixLevel,
  type TenantRole,
} from '@xeprime/types';
import { EmptyState } from '@/components/feedback/EmptyState';
import { LoadingState } from '@/components/feedback/LoadingState';
import { ManagePageHeader } from '@/components/layout/ManagePageHeader';
import { useDomainLabel } from '@/i18n/use-domain-label';
import { cx } from '@/lib/cx';
import { useMemberRoles } from '../hooks/use-roster';
import type { MemberRoleSummary } from '../types';
import { RolePill } from './RolePill';
import styles from './RolePermissionsPage.module.css';

const GROUP_ORDER = Object.values(ROLE_MATRIX_GROUP);

/** Nhãn khi ô "Có giới hạn" — dòng không khai câu riêng thì dùng câu chung. */
const LIMITED_NOTE_ROWS = new Set([
  'cancelSettle',
  'ledger',
  'customers',
  'maintenance',
  'members',
  'fleetManage',
  'fleetView',
]);

/**
 * "Vai trò & quyền" (design `24035:69513`, ADR 0086 điều 1) — bảng CHỈ XEM.
 *
 * Mỗi ô được TÍNH từ khoá quyền thật của vai (`GET /members/roles`, cùng đường guard đọc) qua
 * `roleMatrixLevel` — không có bảng chép tay nào để lệch khỏi quyền thật. Không cho tick: "có giới
 * hạn" có khi là phạm vi chi nhánh theo NGƯỜI hoặc một luật, không biểu diễn được bằng ô tick.
 */
export function RolePermissionsPage() {
  const t = useTranslations('Members');
  const tCommon = useTranslations('Common');
  const domainLabel = useDomainLabel();
  const roles = useMemberRoles();

  const ordered = [...(roles.data ?? [])].sort(
    (a, b) => TENANT_ROLE_RANK[a.roleKey as TenantRole] - TENANT_ROLE_RANK[b.roleKey as TenantRole],
  );
  const levelLabel = (level: RoleMatrixLevel) => t(`matrix.legend.${level}`);

  function cell(rowKey: string, role: MemberRoleSummary): ReactNode {
    const row = ROLE_MATRIX_ROWS.find((r) => r.key === rowKey)!;
    const level = roleMatrixLevel(row, role.roleKey, new Set(role.permissions));
    const note =
      level === ROLE_MATRIX_LEVEL.LIMITED
        ? t(LIMITED_NOTE_ROWS.has(rowKey) ? `matrix.limited.${rowKey as 'members'}` : 'matrix.limited.default')
        : null;
    return (
      <span
        className={styles.cellBody}
        aria-label={t('matrix.cellAria', {
          role: domainLabel('tenantRole', role.roleKey),
          row: t(`matrix.rows.${rowKey as 'members'}`),
          level: note ? `${levelLabel(level)} - ${note}` : levelLabel(level),
        })}
      >
        <LevelIcon level={level} />
        {note ? <span className={styles.note}>{note}</span> : null}
      </span>
    );
  }

  return (
    <div className={styles.page}>
      <ManagePageHeader title={t('matrix.title')} subtitle={t('matrix.subtitle')} />

      {roles.isLoading ? (
        <LoadingState variant="table" label={tCommon('states.loading')} rows={8} />
      ) : roles.isError ? (
        <EmptyState
          variant="error"
          title={t('matrix.loadError')}
          onRetry={() => void roles.refetch()}
        />
      ) : (
        <div className={styles.scroller}>
          <table className={styles.table} aria-label={t('matrix.tableLabel')}>
            <thead>
              <tr>
                <th scope="col" className={styles.corner}>
                  <span className={styles.heading}>{t('matrix.heading')}</span>
                  <ul className={styles.legend}>
                    {Object.values(ROLE_MATRIX_LEVEL).map((level) => (
                      <li key={level}>
                        <LevelIcon level={level} />
                        {levelLabel(level)}
                      </li>
                    ))}
                  </ul>
                </th>
                {ordered.map((role) => (
                  <th key={role.roleKey} scope="col" className={styles.roleHead}>
                    <span className={styles.roleTop}>
                      <RolePill roleKey={role.roleKey} />
                      <span className={styles.count}>
                        {t('matrix.people', { count: role.memberCount })}
                      </span>
                    </span>
                    <span className={styles.roleHint}>
                      {t(`roleHint.${role.roleKey as TenantRole}`)}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {GROUP_ORDER.map((group) => (
                <Fragment key={group}>
                  <tr className={styles.groupRow}>
                    <th scope="colgroup" colSpan={ordered.length + 1}>
                      {t(`matrix.groups.${group}`)}
                    </th>
                  </tr>
                  {ROLE_MATRIX_ROWS.filter((row) => row.group === group).map((row) => (
                    <tr key={row.key}>
                      <th scope="row" className={styles.rowHead}>
                        {t(`matrix.rows.${row.key as 'members'}`)}
                      </th>
                      {ordered.map((role) => (
                        <td key={role.roleKey} className={styles.cell}>
                          {cell(row.key, role)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </Fragment>
              ))}
            </tbody>
          </table>
          <p className={styles.scopeNote}>{t('matrix.scopeNote')}</p>
        </div>
      )}
    </div>
  );
}

function LevelIcon({ level }: { level: RoleMatrixLevel }) {
  const icon =
    level === ROLE_MATRIX_LEVEL.VIEW ? (
      <EyeOutlined />
    ) : level === ROLE_MATRIX_LEVEL.NONE ? (
      <MinusOutlined />
    ) : (
      <CheckOutlined />
    );
  return (
    <span className={cx(styles.icon, styles[level])} aria-hidden="true">
      {icon}
    </span>
  );
}
