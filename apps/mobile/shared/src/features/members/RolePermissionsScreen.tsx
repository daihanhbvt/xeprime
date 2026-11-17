import { Ionicons } from '@/components/icons/Ionicons';
import { useRouter } from 'expo-router';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  ROLE_MATRIX_GROUP,
  ROLE_MATRIX_LEVEL,
  ROLE_MATRIX_ROWS,
  TENANT_ROLE_RANK,
  roleMatrixLevel,
  type RoleMatrixLevel,
  type TenantRole,
} from '@xeprime/types';
import { ManagePageHeader } from '@/features/shell/ManagePageHeader';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, space } from '@/theme/tokens';
import type { MemberRoleSummary } from './api';
import { RolePill } from './components/RolePill';
import { useMemberRoles } from './hooks/use-members';

const GROUP_ORDER = Object.values(ROLE_MATRIX_GROUP);

/** Dòng có câu "Có giới hạn" riêng — còn lại dùng câu chung (cùng tập với web). */
const LIMITED_NOTE_ROWS = new Set([
  'cancelSettle',
  'ledger',
  'customers',
  'maintenance',
  'members',
  'fleetManage',
  'fleetView',
]);

function LevelIcon({ level }: { level: RoleMatrixLevel }) {
  const colors = useColors();
  const tone =
    level === ROLE_MATRIX_LEVEL.FULL
      ? colors.success
      : level === ROLE_MATRIX_LEVEL.LIMITED
        ? colors.warning
        : level === ROLE_MATRIX_LEVEL.VIEW
          ? colors.info
          : colors.textMuted;
  const name =
    level === ROLE_MATRIX_LEVEL.VIEW
      ? 'eye-outline'
      : level === ROLE_MATRIX_LEVEL.NONE
        ? 'remove-outline'
        : 'checkmark';
  return <Ionicons name={name} size={iconSize.sm} color={tone} />;
}

/**
 * "Vai trò & quyền" (design `24035:69513`, ADR 0086 điều 1) — bảng CHỈ XEM, bản native của web
 * `RolePermissionsPage`.
 *
 * Mỗi ô được TÍNH từ khoá quyền thật của vai (`GET /members/roles`) qua `roleMatrixLevel` — không có
 * bảng chép tay nào để lệch khỏi guard. Web là lưới 2 chiều; màn hẹp đổi thành danh sách theo
 * nhóm, mỗi dòng quyền kèm mức của từng vai — cùng dữ liệu, cùng chú thích.
 */
export function RolePermissionsScreen() {
  const colors = useColors();
  const router = useRouter();
  const t = useTranslations('Members');
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.MEMBER_VIEW);
  const roles = useMemberRoles(canView);
  const back = () => goBackOr(router, ROUTES.manage.members());

  const header = <ManagePageHeader title={t('matrix.title')} onBack={back} />;

  if (!permissions.isLoading && !canView) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={false}>
          <ScreenMessage
            icon="lock-closed-outline"
            title={t('page.forbidden.title')}
            description={t('page.forbidden.description')}
          />
        </Screen>
      </>
    );
  }

  if (!roles.data) {
    return (
      <>
        {header}
        <Screen edges={['left', 'right', 'bottom']} scroll={!roles.isError}>
          {roles.isError ? (
            <ScreenError
              error={roles.error}
              title={t('matrix.loadError')}
              onRetry={() => void roles.refetch()}
            />
          ) : (
            <YStack gap={layout.section}>
              <Skeleton height={96} />
              <SkeletonText lines={8} />
            </YStack>
          )}
        </Screen>
      </>
    );
  }

  const ordered = [...roles.data].sort(
    (a, b) => TENANT_ROLE_RANK[a.roleKey as TenantRole] - TENANT_ROLE_RANK[b.roleKey as TenantRole],
  );
  const levelLabel = (level: RoleMatrixLevel) => t(`matrix.legend.${level}`);

  function cellNote(rowKey: string, level: RoleMatrixLevel): string | null {
    if (level !== ROLE_MATRIX_LEVEL.LIMITED) return null;
    return t(
      LIMITED_NOTE_ROWS.has(rowKey)
        ? `matrix.limited.${rowKey as 'members'}`
        : 'matrix.limited.default',
    );
  }

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={layout.section}>
          <Text col={colors.textMuted} fos={fontSize.body}>
            {t('matrix.subtitle')}
          </Text>

          {/* Bốn vai: viên vai, số người, câu mô tả — hàng tiêu đề cột của lưới web. */}
          <YStack gap={space.sm}>
            {ordered.map((role) => (
              <Card key={role.roleKey}>
                <YStack gap={space.xs}>
                  <XStack ai="center" jc="space-between" gap={space.sm}>
                    <RolePill roleKey={role.roleKey} />
                    <Text col={colors.textMuted} fos={fontSize.meta}>
                      {t('matrix.people', { count: role.memberCount })}
                    </Text>
                  </XStack>
                  <Text col={colors.textMuted} fos={fontSize.bodySm}>
                    {t(`roleHint.${role.roleKey as TenantRole}`)}
                  </Text>
                </YStack>
              </Card>
            ))}
          </YStack>

          {/* Chú thích bốn mức. */}
          <YStack gap={space.xs}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('matrix.heading')}
            </Text>
            <XStack gap={space.md} flexWrap="wrap">
              {Object.values(ROLE_MATRIX_LEVEL).map((level) => (
                <XStack key={level} ai="center" gap={space.xs}>
                  <LevelIcon level={level} />
                  <Text col={colors.textMuted} fos={fontSize.meta}>
                    {levelLabel(level)}
                  </Text>
                </XStack>
              ))}
            </XStack>
          </YStack>

          {GROUP_ORDER.map((group) => (
            <YStack key={group} gap={space.sm}>
              <Text col={colors.textMuted} fos={fontSize.meta} fow={fontWeight.semibold}>
                {t(`matrix.groups.${group}`)}
              </Text>
              {ROLE_MATRIX_ROWS.filter((row) => row.group === group).map((row) => (
                <Card key={row.key}>
                  <YStack gap={space.xs}>
                    <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
                      {t(`matrix.rows.${row.key as 'members'}`)}
                    </Text>
                    {ordered.map((role) => (
                      <RoleLevelLine
                        key={role.roleKey}
                        role={role}
                        roleLabel={domainLabel('tenantRole', role.roleKey)}
                        rowLabel={t(`matrix.rows.${row.key as 'members'}`)}
                        level={roleMatrixLevel(row, role.roleKey, new Set(role.permissions))}
                        levelLabel={levelLabel}
                        note={(level) => cellNote(row.key, level)}
                      />
                    ))}
                  </YStack>
                </Card>
              ))}
            </YStack>
          ))}

          <Text col={colors.textMuted} fos={fontSize.meta}>
            {t('matrix.scopeNote')}
          </Text>
        </YStack>
      </Screen>
    </>
  );
}

function RoleLevelLine({
  role,
  roleLabel,
  rowLabel,
  level,
  levelLabel,
  note,
}: {
  role: MemberRoleSummary;
  roleLabel: string;
  rowLabel: string;
  level: RoleMatrixLevel;
  levelLabel: (level: RoleMatrixLevel) => string;
  note: (level: RoleMatrixLevel) => string | null;
}) {
  const colors = useColors();
  const t = useTranslations('Members');
  const extra = note(level);
  return (
    <XStack
      ai="center"
      gap={space.sm}
      px={space.xs}
      py={2}
      br={radius.sm}
      accessibilityLabel={t('matrix.cellAria', {
        role: roleLabel,
        row: rowLabel,
        level: extra ? `${levelLabel(level)} - ${extra}` : levelLabel(level),
      })}
    >
      <Text col={colors.text} fos={fontSize.meta} f={1} numberOfLines={1}>
        {roleLabel}
      </Text>
      <XStack ai="center" gap={space.xs} flexShrink={1}>
        <LevelIcon level={level} />
        <Text col={colors.textMuted} fos={fontSize.meta} numberOfLines={2}>
          {extra ?? levelLabel(level)}
        </Text>
      </XStack>
    </XStack>
  );
}
