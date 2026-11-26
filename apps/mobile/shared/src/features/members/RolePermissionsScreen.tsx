import { useMemo, useState } from 'react';
import { useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  PERMISSION,
  ROLE_MATRIX_GROUP,
  ROLE_MATRIX_LEVEL,
  ROLE_MATRIX_ROWS,
  TENANT_ROLE,
  TENANT_ROLE_RANK,
  roleMatrixLevel,
  type RoleMatrixLevel,
  type TenantRole,
} from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { Screen } from '@/components/layout/Screen';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { Card } from '@/components/ui/Card';
import { Skeleton, SkeletonText } from '@/components/ui/Skeleton';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/domain';
import { goBackOr } from '@/navigation/go-back-or';
import { ROUTES } from '@/navigation/routes';
import { elevation } from '@/theme/elevation';
import { layout } from '@/theme/layout';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import type { MemberRoleSummary } from './api';
import { MembersHeader, type MembersTab } from './components/MembersHeader';
import { roleDotColor } from './components/RolePill';
import { useMemberRoles } from './hooks/use-members';

const GROUP_ORDER = Object.values(ROLE_MATRIX_GROUP);
const LEVEL_ORDER = Object.values(ROLE_MATRIX_LEVEL);

/**
 * Dòng "Gói & thanh toán" của bảng: app Partner không nhắc tới gói (người dùng chốt 26/11/2026) -
 * ẩn dòng trên app, web giữ nguyên.
 */
const APP_HIDDEN_ROWS = new Set(['plan']);
const VISIBLE_ROWS = ROLE_MATRIX_ROWS.filter((row) => !APP_HIDDEN_ROWS.has(row.key));

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

/** Câu mô tả vai trên app: vai chủ / quản lý có bản KHÔNG nhắc gói (`roleHintApp`). */
const APP_HINT_ROLES = new Set<string>([TENANT_ROLE.SHOP_OWNER, TENANT_ROLE.SHOP_MANAGER]);

/** Figma "Role Tabs" `24232:115818`: chip cao 38, đệm 8, các chip cách 8. */
const ROLE_CHIP_HEIGHT = 38;
/** Ô icon mức quyền (Figma "Check icon"): 24, đệm 6, icon 12. */
const LEVEL_BOX = 24;
const LEVEL_ICON = 12;
/** Chấm vai trên thẻ vai (Figma `_Dot` `24232:115845`). */
const ROLE_DOT = 8;
/** Hộp mô tả vai: chữ 12 / dòng 19.5 (Figma `24232:115843`). */
const HINT_LINE_HEIGHT = 19.5;

/**
 * "Vai trò & quyền" — Figma Partner-XePrime `24232:115557` (ADR 0086 điều 1), bảng CHỈ XEM, bản
 * native của web `RolePermissionsPage`.
 *
 * Xem MỘT vai mỗi lần: hàng chip chọn vai (kèm số người) → thẻ vai (mô tả + chú thích bốn mức) →
 * mỗi nhóm quyền một thẻ, mỗi dòng một ô mức. Mỗi ô được TÍNH từ khoá quyền thật của vai
 * (`GET /members/roles`) qua `roleMatrixLevel` — không có bảng chép tay nào để lệch khỏi guard.
 * Cùng dữ liệu, cùng chú thích với lưới hai chiều của web; dòng "Có giới hạn" ghi rõ giới hạn gì.
 */
export function RolePermissionsScreen() {
  const colors = useColors();
  const router = useRouter();
  const t = useTranslations('Members');
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const canView = permissions.has(PERMISSION.MEMBER_VIEW);
  const roles = useMemberRoles(canView);
  const [selected, setSelected] = useState<string | null>(null);
  const back = () => goBackOr(router, ROUTES.manage.members());

  const changeTab = (next: MembersTab) => {
    if (next === 'members') back();
  };

  const header = (
    <MembersHeader
      tab="roles"
      onTab={changeTab}
      onBack={back}
      canView={canView}
    />
  );

  const ordered = useMemo(
    () =>
      [...(roles.data ?? [])].sort(
        (a, b) =>
          TENANT_ROLE_RANK[a.roleKey as TenantRole] - TENANT_ROLE_RANK[b.roleKey as TenantRole],
      ),
    [roles.data],
  );

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
            <YStack gap={space.md}>
              <Skeleton height={ROLE_CHIP_HEIGHT} />
              <Skeleton height={180} />
              <SkeletonText lines={8} />
            </YStack>
          )}
        </Screen>
      </>
    );
  }

  const role = ordered.find((entry) => entry.roleKey === selected) ?? ordered[0];
  const levelLabel = (level: RoleMatrixLevel) => t(`matrix.legend.${level}`);

  return (
    <>
      {header}
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.md}>
          {/* Chọn vai xem (Figma "Section - RoleSelectorTabs" `24232:115750`). */}
          <YStack gap={space.sm}>
            <XStack ai="center" jc="space-between" gap={space.sm}>
              <Text
                col={colors.textMuted}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.semibold}
                textTransform="uppercase"
              >
                {t('matrix.chooseRole')}
              </Text>
              <Text
                col={colors.warningVivid}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
              >
                {t('matrix.roleGroups', { count: ordered.length })}
              </Text>
            </XStack>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              style={styles.chipScroller}
              contentContainerStyle={styles.chipRow}
              accessibilityRole="tablist"
              accessibilityLabel={t('matrix.roleTabsLabel')}
            >
              {ordered.map((entry) => (
                <RoleChip
                  key={entry.roleKey}
                  label={domainLabel('tenantRole', entry.roleKey)}
                  count={entry.memberCount}
                  active={entry.roleKey === role?.roleKey}
                  onPress={() => setSelected(entry.roleKey)}
                />
              ))}
            </ScrollView>
          </YStack>

          {role ? (
            <>
              <RoleInfoCard role={role} levelLabel={levelLabel} />
              {GROUP_ORDER.map((group) => {
                const rows = VISIBLE_ROWS.filter((row) => row.group === group);
                if (rows.length === 0) return null;
                const granted = new Set(role.permissions);
                return (
                  <Card key={group} padded={false} lift="flat">
                    <XStack
                      ai="center"
                      jc="space-between"
                      gap={space.sm}
                      px={space.md}
                      py={12}
                      bg={colors.background}
                    >
                      <Text
                        col={colors.text}
                        fos={typeScale.body.fontSize}
                        lh={typeScale.body.lineHeight}
                        fow={fontWeight.semibold}
                        numberOfLines={1}
                        flexShrink={1}
                      >
                        {t(`matrix.groups.${group}`)}
                      </Text>
                      <Text
                        col={colors.textPlaceholder}
                        fos={typeScale.body.fontSize}
                        lh={typeScale.body.lineHeight}
                      >
                        {t('matrix.features', { count: rows.length })}
                      </Text>
                    </XStack>
                    <YStack px={space.md} pt={12} pb={space.md} gap={12}>
                      {rows.map((row) => {
                        const level = roleMatrixLevel(row, role.roleKey, granted);
                        const rowLabel = t(`matrix.rows.${row.key as 'members'}`);
                        const note =
                          level === ROLE_MATRIX_LEVEL.LIMITED
                            ? t(
                                LIMITED_NOTE_ROWS.has(row.key)
                                  ? `matrix.limited.${row.key as 'members'}`
                                  : 'matrix.limited.default',
                              )
                            : null;
                        return (
                          <XStack
                            key={row.key}
                            ai="center"
                            jc="space-between"
                            gap={space.sm}
                            accessible
                            accessibilityLabel={t('matrix.cellAria', {
                              role: domainLabel('tenantRole', role.roleKey),
                              row: rowLabel,
                              level: note ? `${levelLabel(level)} - ${note}` : levelLabel(level),
                            })}
                          >
                            <Text
                              col={colors.placeholder}
                              fos={typeScale.body.fontSize}
                              lh={typeScale.body.lineHeight}
                              f={1}
                              minWidth={0}
                            >
                              {rowLabel}
                            </Text>
                            <XStack ai="center" gap={6} flexShrink={1} maxWidth="50%">
                              {note ? (
                                <Text
                                  col={colors.textMuted}
                                  fos={typeScale.label.fontSize}
                                  lh={typeScale.label.lineHeight}
                                  ta="right"
                                  flexShrink={1}
                                >
                                  {note}
                                </Text>
                              ) : null}
                              <LevelBadge level={level} />
                            </XStack>
                          </XStack>
                        );
                      })}
                    </YStack>
                  </Card>
                );
              })}
            </>
          ) : null}

          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {t('matrix.scopeNote')}
          </Text>
        </YStack>
      </Screen>
    </>
  );
}

/** Chip chọn vai (Figma "_Tab button base MB"): vàng khi chọn, trắng viền xám khi không. */
function RoleChip({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const colors = useColors();
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="tab"
      accessibilityState={{ selected: active }}
      accessibilityLabel={`${label} (${count})`}
    >
      <XStack
        h={ROLE_CHIP_HEIGHT}
        ai="center"
        gap={6}
        p={space.sm}
        br={radius.pill}
        bw={1}
        bc={active ? colors.brandBorderStrong : colors.border}
        bg={active ? colors.brandShape : colors.surface}
        style={elevation.xs}
      >
        <Text
          col={active ? colors.text : colors.textMuted}
          fos={typeScale.body.fontSize}
          lh={typeScale.body.lineHeight}
          fow={fontWeight.medium}
          numberOfLines={1}
        >
          {label}
        </Text>
        <CountBadge label={String(count)} tone={active ? 'brand' : 'neutral'} />
      </XStack>
    </Pressable>
  );
}

/** Viên đếm "_Badge" 12/18: vàng (`primary-25` / viền `primary-300` / chữ `brand/primary-2`) hoặc xám. */
function CountBadge({ label, tone }: { label: string; tone: 'brand' | 'neutral' }) {
  const colors = useColors();
  const brand = tone === 'brand';
  return (
    <YStack
      px={space.sm}
      py={2}
      br={radius.card}
      bw={1}
      bc={brand ? colors.brandBorder : colors.border}
      bg={brand ? colors.brandWash : colors.background}
    >
      <Text
        col={brand ? colors.brandLink : colors.text}
        fos={typeScale.label.fontSize}
        lh={typeScale.label.lineHeight}
        fow={fontWeight.medium}
        numberOfLines={1}
      >
        {label}
      </Text>
    </YStack>
  );
}

/** Thẻ vai đang xem (Figma "Section - ActiveRoleCardInfo" `24232:115831`). */
function RoleInfoCard({
  role,
  levelLabel,
}: {
  role: MemberRoleSummary;
  levelLabel: (level: RoleMatrixLevel) => string;
}) {
  const colors = useColors();
  const t = useTranslations('Members');
  const domainLabel = useDomainLabel();
  const roleKey = role.roleKey as TenantRole;
  const hint = APP_HINT_ROLES.has(roleKey)
    ? t(`roleHintApp.${roleKey as 'shop_owner'}`)
    : t(`roleHint.${roleKey}`);

  return (
    <Card padded={false} lift="flat">
      <YStack p={space.md} gap={12}>
        <XStack ai="center" gap={space.sm}>
          <YStack w={ROLE_DOT} h={ROLE_DOT} br={ROLE_DOT / 2} bg={roleDotColor(colors, roleKey)} />
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.semibold}
            numberOfLines={1}
            flexShrink={1}
          >
            {domainLabel('tenantRole', roleKey)}
          </Text>
          <CountBadge label={t('matrix.people', { count: role.memberCount })} tone="brand" />
        </XStack>

        <YStack
          p={11}
          br={radius.control}
          bw={1}
          bc={colors.borderSubtle}
          bg={colors.background}
        >
          <Text col={colors.textMuted} fos={typeScale.label.fontSize} lh={HINT_LINE_HEIGHT}>
            {hint}
          </Text>
        </YStack>

        <YStack gap={space.sm}>
          <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
            {t('matrix.legendTitle')}
          </Text>
          <XStack flexWrap="wrap" rowGap={space.sm}>
            {LEVEL_ORDER.map((level) => (
              <XStack key={level} w="50%" ai="center" gap={space.sm} pr={space.xs}>
                <LevelBadge level={level} />
                <Text
                  col={colors.textMuted}
                  fos={typeScale.body.fontSize}
                  lh={typeScale.body.lineHeight}
                  numberOfLines={1}
                  flexShrink={1}
                >
                  {levelLabel(level)}
                </Text>
              </XStack>
            ))}
          </XStack>
        </YStack>
      </YStack>
    </Card>
  );
}

/** Ô mức quyền (Figma "Check icon" / "No Access Icon"): tích xanh · tích cam · mắt xanh dương · gạch xám. */
function LevelBadge({ level }: { level: RoleMatrixLevel }) {
  const colors = useColors();
  const skin =
    level === ROLE_MATRIX_LEVEL.FULL
      ? { bg: colors.successSurface, fg: colors.success, icon: 'check-xs' as const }
      : level === ROLE_MATRIX_LEVEL.LIMITED
        ? { bg: colors.warningSubtle, fg: colors.warningHigh, icon: 'check-xs' as const }
        : level === ROLE_MATRIX_LEVEL.VIEW
          ? { bg: colors.infoLow, fg: colors.infoStrong, icon: 'eye' as const }
          : { bg: 'transparent', fg: colors.borderInput, icon: 'minus-xs' as const };
  return (
    <YStack
      w={LEVEL_BOX}
      h={LEVEL_BOX}
      br={LEVEL_BOX / 2}
      ai="center"
      jc="center"
      bg={skin.bg}
      flexShrink={0}
    >
      <LineIcon name={skin.icon} size={LEVEL_ICON} color={skin.fg} />
    </YStack>
  );
}

const styles = StyleSheet.create({
  chipScroller: { marginHorizontal: -layout.screenX, flexGrow: 0 },
  chipRow: { gap: 8, paddingHorizontal: layout.screenX },
});
