import { useState } from 'react';
import { Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION } from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { InfoCard } from '@/components/ui/InfoCard';
import { SearchInput } from '@/components/ui/SearchInput';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import type { Branch } from '@/features/branches/api';
import { BranchFormSheet } from '@/features/branches/components/BranchFormSheet';
import { useBranchRowActions } from '@/features/branches/hooks/use-branch-row-actions';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { ShopBranchRow } from './ShopBranchRow';
import { fontWeight, iconSize, radius, space, typeScale } from '@/theme/tokens';

const SEARCH_DEBOUNCE_MS = 300;
/** Dải "chưa có tỉnh/thành" (Figma `24231:113601`): nền `status/orange-low`, đệm 12, bo 12, khe 6. */
const REVIEW_PAD = 12;
const REVIEW_GAP = 6;
/** Các thẻ chi nhánh cách nhau 16 (khe của thẻ cha `24231:113475`). */
const ROW_GAP = 16;

/**
 * Thẻ "Chi nhánh" của Quản lý gian hàng (Figma `24231:113475`):
 *
 *   Chi nhánh                                                   [+]
 *   Tổng N chi nhánh · M đang hoạt động (xanh)
 *   [ tìm ]
 *   [◎ N chi nhánh chưa có tỉnh/thành. … / Bổ sung ngay]
 *   thẻ chi nhánh (⋮) …
 *
 * Ô lọc trạng thái đã bỏ trên app (người dùng chốt 26/11/2026 theo Figma) - tìm kiếm vẫn còn. Nút
 * "+" vẫn hiện với người chỉ xem nhưng khoá, như web khoá kèm lý do.
 *
 * Danh sách nằm NGAY trong thẻ như web (không còn bản tóm tắt dẫn sang màn khác); sửa / thêm mở
 * `BranchFormSheet`, thao tác theo hàng đi qua `useBranchRowActions` — cùng bản với màn Chi nhánh.
 */
export function ShopBranchesCard({
  onLayout,
}: {
  onLayout?: (event: LayoutChangeEvent) => void;
}) {
  const colors = useColors();
  const t = useTranslations('Branches');
  const tActions = useTranslations('Common.actions');
  const fmt = useAppFormat();
  const permissions = usePermissions();
  const canManage = permissions.has(PERMISSION.BRANCH_MANAGE);

  const [search, setSearch] = useState('');
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();

  const query = useBranches(debounced ? { q: debounced } : {});
  const { runAction, actionStateOf, pending, canWrite, deactivateConfirm } = useBranchRowActions();

  const data = query.data;
  const items = data?.items ?? [];
  const needsReview = data?.needsReviewCount ?? 0;
  const firstToReview = items.find((row) => !row.provinceCode || row.needsLocationReview) ?? null;
  const filtered = Boolean(debounced);

  function openCreate() {
    setEditing(null);
    setFormOpen(true);
  }
  function openEdit(branch: Branch) {
    setEditing(branch);
    setFormOpen(true);
  }

  const summary = t.rich('toolbar.summaryTotal', {
    total: data?.total ?? 0,
    active: fmt.count(data?.activeCount ?? 0),
    ok: (chunks) => <Text col={colors.success}>{chunks}</Text>,
  });

  return (
    <InfoCard
      look="figma"
      title={t('page.title')}
      hint={
        <Text col={colors.placeholder} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
          {summary}
        </Text>
      }
      extra={
        /* Web hiện nút cho cả người chỉ xem - khoá kèm lý do (`blocked.manage`), không ẩn. */
        <IconSquareButton
          label={t('page.add')}
          tone="brand"
          size="card"
          disabled={!canManage || !canWrite}
          onPress={openCreate}
        >
          <LineIcon name="add" size={iconSize.lg} color={colors.onPrimary} />
        </IconSquareButton>
      }
      {...(onLayout ? { onLayout } : {})}
    >
      <SearchInput
        value={search}
        onChange={setSearch}
        label={t('toolbar.searchLabel')}
        placeholder={t('toolbar.searchPlaceholder')}
        variant="field"
      />

      {needsReview > 0 ? (
        /*
         * Dải "chưa có tỉnh/thành" (Figma `24231:113601`): nền cam nhạt, chữ cam 12/18 với cụm đầu
         * đậm vừa; "Bổ sung ngay" 14/20 gạch chân xuống DƯỚI đoạn chữ, thẳng mép trái của dải.
         */
        <YStack
          gap={REVIEW_GAP}
          p={REVIEW_PAD}
          br={radius.control}
          bg={colors.orangeLow}
          accessibilityRole="alert"
        >
          <XStack ai="flex-start" gap={REVIEW_GAP}>
            <LineIcon name="location" size={iconSize.lg} color={colors.warningVivid} />
            <Text f={1} col={colors.warningHigh} fos={typeScale.label.fontSize} lh={typeScale.label.lineHeight}>
              <Text
                col={colors.warningHigh}
                fos={typeScale.label.fontSize}
                lh={typeScale.label.lineHeight}
                fow={fontWeight.semibold}
              >
                {t('page.needsReview', { count: needsReview })}
              </Text>
              {`. ${t('page.needsReviewHint')}`}
            </Text>
          </XStack>
          {canManage && firstToReview ? (
            <Pressable
              onPress={() => openEdit(firstToReview)}
              accessibilityRole="button"
              accessibilityLabel={t('page.fixNow')}
              hitSlop={8}
              style={styles.fixNow}
            >
              <Text
                col={colors.warningHigh}
                fos={typeScale.body.fontSize}
                lh={typeScale.body.lineHeight}
                fow={fontWeight.semibold}
                textDecorationLine="underline"
              >
                {t('page.fixNow')}
              </Text>
            </Pressable>
          ) : null}
        </YStack>
      ) : null}

      {query.isError && !data ? (
        <Callout tone="danger" title={t('table.loadError')}>
          <XStack mt={space.xs}>
            <Button
              label={tActions('retry')}
              variant="secondary"
              size="sm"
              block={false}
              icon="refresh-outline"
              onPress={() => void query.refetch()}
            />
          </XStack>
        </Callout>
      ) : !data ? (
        <YStack gap={space.sm}>
          <ActionCardSkeleton />
          <ActionCardSkeleton />
        </YStack>
      ) : items.length === 0 ? (
        <ScreenMessage
          icon={filtered ? 'search-outline' : 'git-branch-outline'}
          title={filtered ? t('table.noResults') : t('table.empty')}
          description={filtered ? t('table.noResultsHint') : t('table.emptyHint')}
          {...(!filtered && canManage && canWrite
            ? { actionLabel: t('page.add'), onAction: openCreate }
            : {})}
        />
      ) : (
        <YStack gap={ROW_GAP}>
          {items.map((branch) => (
            <ShopBranchRow
              key={branch.id}
              branch={branch}
              canManage={canManage}
              pendingAction={pending?.id === branch.id ? pending.action : null}
              actionState={actionStateOf(branch)}
              onEdit={openEdit}
              onAction={runAction}
            />
          ))}
        </YStack>
      )}

      {formOpen ? (
        <BranchFormSheet open branch={editing} onClose={() => setFormOpen(false)} />
      ) : null}
      <AlertDialog {...deactivateConfirm} />
    </InfoCard>
  );
}

const styles = StyleSheet.create({
  // Lối "Bổ sung ngay" thẳng mép trái của dải (Figma `24231:113604` ở x 12, cùng mép icon).
  fixNow: { alignSelf: 'flex-start' },
});
