import EnvironmentOutlined from '@ant-design/icons-svg/es/asn/EnvironmentOutlined';
import { useState } from 'react';
import { Pressable, StyleSheet, type LayoutChangeEvent } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { BRANCH_STATUS_VALUES, PERMISSION } from '@xeprime/types';
import { AntIcon } from '@/components/icons/AntIcon';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { InfoCard } from '@/components/ui/InfoCard';
import { SearchInput } from '@/components/ui/SearchInput';
import { SelectControl } from '@/components/ui/SelectControl';
import { ActionCardSkeleton } from '@/components/ui/Skeleton';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import type { Branch } from '@/features/branches/api';
import { BranchFormSheet } from '@/features/branches/components/BranchFormSheet';
import { useBranchRowActions } from '@/features/branches/hooks/use-branch-row-actions';
import { useBranches } from '@/features/branches/hooks/use-branches';
import { useDebouncedValue } from '@/hooks/use-debounced-value';
import { useDomainLabel } from '@/i18n/domain';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { ShopBranchRow } from './ShopBranchRow';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';

const SEARCH_DEBOUNCE_MS = 300;
/** Sentinel "Tất cả trạng thái" - lọc là chuyện giao diện, không xuống API. */
const STATUS_ALL = '';
/** Dải "chưa có tỉnh/thành" - đệm 12, icon 18 (`.reviewBanner`/`.reviewIcon`). */
const REVIEW_PAD = 12;
const REVIEW_ICON = 18;

/**
 * Thẻ "Chi nhánh" trong trang Thông tin cửa hàng — bản native của `BranchesView variant="section"`
 * web ở khổ điện thoại (S13 của sổ redesign):
 *
 *   Chi nhánh                                   [ tìm ][ trạng thái ][ + Thêm chi nhánh ]
 *   Tổng N chi nhánh · M đang hoạt động (xanh)
 *   [! N chi nhánh chưa có tỉnh/thành. … · Bổ sung ngay]
 *   thẻ chi nhánh (bút chì + "…") …
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
  const domainLabel = useDomainLabel();
  const permissions = usePermissions();
  const canManage = permissions.has(PERMISSION.BRANCH_MANAGE);

  const [search, setSearch] = useState('');
  const [status, setStatus] = useState<string>(STATUS_ALL);
  const [editing, setEditing] = useState<Branch | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const debounced = useDebouncedValue(search, SEARCH_DEBOUNCE_MS).trim();

  const query = useBranches({
    ...(debounced ? { q: debounced } : {}),
    ...(status ? { status } : {}),
  });
  const { runAction, actionStateOf, pending, canWrite, deactivateConfirm } = useBranchRowActions();

  const data = query.data;
  const items = data?.items ?? [];
  const needsReview = data?.needsReviewCount ?? 0;
  const firstToReview = items.find((row) => !row.provinceCode || row.needsLocationReview) ?? null;
  const filtered = Boolean(debounced || status);

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

  const statusOptions = [
    { value: STATUS_ALL, label: t('toolbar.allStatuses') },
    ...BRANCH_STATUS_VALUES.map((value) => ({ value, label: domainLabel('branchStatus', value) })),
  ];

  return (
    <InfoCard
      title={t('page.title')}
      hint={
        <Text col={colors.placeholder} fos={fontSize.body} lineHeight={20}>
          {summary}
        </Text>
      }
      {...(onLayout ? { onLayout } : {})}
    >
      {/*
        Thanh công cụ ở khổ điện thoại (`.toolbar` ≤640px của web: xếp CỘT, kéo giãn): ô tìm, ô lọc
        trạng thái (không nhãn trên - `aria-label`), nút thêm - mỗi ô hết bề ngang.
      */}
      <YStack gap={space.sm}>
        <SearchInput
          value={search}
          onChange={setSearch}
          label={t('toolbar.searchLabel')}
          placeholder={t('toolbar.searchPlaceholder')}
          variant="field"
        />
        <SelectControl
          label={t('toolbar.statusLabel')}
          hideLabel
          value={status}
          options={statusOptions}
          onChange={setStatus}
        />
        {/* Web hiện nút cho cả người chỉ xem - khoá kèm lý do (`blocked.manage`), không ẩn. */}
        <Button
          label={t('page.add')}
          icon="add-outline"
          variant="gradient"
          shape="square"
          disabled={!canManage || !canWrite}
          onPress={openCreate}
        />
      </YStack>

      {needsReview > 0 ? (
        /*
         * Dải "chưa có tỉnh/thành" (`.reviewBanner`): nền vàng nhạt, chữ cam. Ở khổ điện thoại lối
         * "Bổ sung ngay" xuống DƯỚI đoạn chữ - đứng cạnh, nó bóp đoạn chữ thành một cột hẹp.
         */
        <YStack
          gap={space.xs}
          p={REVIEW_PAD}
          br={radius.control}
          bg={colors.warningSubtle}
          accessibilityRole="alert"
        >
          <XStack ai="flex-start" gap={space.sm}>
            <AntIcon icon={EnvironmentOutlined} size={REVIEW_ICON} color={colors.warning} />
            <Text f={1} col={colors.warning} fos={fontSize.body} lineHeight={20}>
              <Text fow={fontWeight.semibold}>{`${t('page.needsReview', { count: needsReview })}.`}</Text>{' '}
              {t('page.needsReviewHint')}
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
                col={colors.warning}
                fos={fontSize.body}
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
        <YStack>
          {items.map((branch, index) => (
            <ShopBranchRow
              key={branch.id}
              branch={branch}
              first={index === 0}
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
  // Lối "Bổ sung ngay" thẳng mép trái đoạn chữ (sau icon 18 + khe 8).
  fixNow: { alignSelf: 'flex-start', marginLeft: REVIEW_ICON + 8 },
});
