import { memo, useCallback, useMemo, useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { PERMISSION, PLAN_FEATURE, RECEIPT_TYPE, RECEIPT_TYPE_VALUES } from '@xeprime/types';
import { ConfirmSheet } from '@/components/ui/ConfirmSheet';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { ChipTabs, type ChipTabItem } from '@/components/ui/ChipTabs';
import { IconSquareButton } from '@/components/ui/IconSquareButton';
import { Pill } from '@/components/ui/Pill';
import { SelectControl } from '@/components/ui/SelectControl';
import { SkeletonText } from '@/components/ui/Skeleton';
import { TextControl } from '@/components/ui/TextControl';
import { LineIcon } from '@/components/icons/LineIcon';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { FONT_FAMILY } from '@/theme/fonts';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import {
  useCreateCategory,
  useDeleteCategory,
  useFinanceCategories,
  useRenameCategory,
} from '../hooks/use-finance';
import type { CreateCategoryInput, FinanceCategory } from '../api';
import { getErrorMessage } from '@/lib/get-error-message';

/** Trần tên danh mục — khớp `maxLength={255}` của ô nhập bên web và DTO backend. */
const NAME_MAX = 255;

/** Chip lọc của tấm: tất cả, hoặc đúng một chiều tiền. */
const FILTER_ALL = 'all';
type CategoryFilter = typeof FILTER_ALL | (typeof RECEIPT_TYPE_VALUES)[number];

/** Khoảng đệm/cách của một dòng danh mục - Figma `24512:129050`: đệm 12, cách 12. */
const ROW_PAD = 12;
/** Icon 16 trong nút vuông 32 (Figma "Edit 1" / "Delete 1"). */
const ROW_ICON = 16;

/**
 * Quản lý danh mục thu/chi (FIN-03) — bản native của `CategoryManagerModal`, giao diện theo Figma
 * Partner-XePrime `24512:128393` ("Wallet Management / Category").
 *
 * Mở từ CHÍNH sổ Thu-Chi (đúng lối vào duy nhất của web), không phải một mục menu riêng: danh
 * mục chỉ có nghĩa khi đang nhìn vào sổ.
 *
 * Luật giữ nguyên từ web:
 *  1. **Danh mục HỆ THỐNG không sửa/xoá được** — chúng là đích của phiếu tự động (`system_key`).
 *     Dòng của nó không có nút nào và mang chữ "Hệ thống" cạnh tên (Figma vẽ nút trên mọi dòng;
 *     người dùng chốt 26/11/2026 giữ cách của web thay vì hai nút bấm vào là lỗi).
 *  2. **Lưu TỪNG DÒNG** bằng ✓ của chính dòng đó; chân tấm chỉ có "Đóng" (Figma vẽ Hủy + Xác
 *     nhận - người dùng chốt 26/11/2026 giữ một nút như web, không có gì để "xác nhận").
 *  3. Thêm/sửa/xoá cần `receipt.create` + feature gate `finance` — cùng bộ guard backend đang gác.
 *
 * "+ Thêm danh mục" mở một dòng nhập ở CUỐI danh sách (tên + loại + ✓/✕), như dòng thêm mới của
 * web. Chip "Tất cả · Thu · Chi" chỉ lọc danh sách đã tải trên máy, không gọi API.
 *
 * Khác web đúng một chỗ: xoá có bước XÁC NHẬN bằng hộp thoại riêng — trên native nút xoá nằm
 * sát mép ngón tay, một cú chạm nhầm xoá mất danh mục của gian hàng mà không có đường hoàn tác.
 */
export function CategoryManagerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const colors = useColors();
  const t = useTranslations('Finance.receipts.categories');
  const tActions = useTranslations('Common.actions');
  const tLabels = useTranslations('Common.labels');
  const tStates = useTranslations('Common.states');
  const tFeature = useTranslations('ManageCommon.feature');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const permissions = usePermissions();
  const finance = useFeature(PLAN_FEATURE.FINANCE);

  const canManage = permissions.has(PERMISSION.RECEIPT_CREATE) && finance.canWrite;

  const [filter, setFilter] = useState<CategoryFilter>(FILTER_ALL);
  const [adding, setAdding] = useState(false);
  /** Tăng mỗi lần mở thẻ thêm - khoá để tấm cuộn xuống đáy đúng một lần mỗi lượt mở. */
  const [addSeq, setAddSeq] = useState(0);
  const [type, setType] = useState<string>(RECEIPT_TYPE.EXPENSE);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<FinanceCategory | null>(null);
  /** Hàng đang đổi tên (PR #276) — một hàng một lúc, như bảng của web. */
  const [editing, setEditing] = useState<{ id: string; name: string } | null>(null);

  /* Chỉ gọi khi tấm MỞ — danh mục không có giá trị gì cho tới lúc người dùng mở nó ra. */
  const query = useFinanceCategories(undefined, open);
  const create = useCreateCategory();
  const remove = useDeleteCategory();
  const rename = useRenameCategory();

  /** Xếp như web: Chi trước Thu, trong cùng loại theo tên. */
  const all = useMemo(
    () =>
      [...(query.data ?? [])].sort(
        (a, b) => b.type.localeCompare(a.type) || a.name.localeCompare(b.name, 'vi'),
      ),
    [query.data],
  );
  const list = useMemo(
    () => (filter === FILTER_ALL ? all : all.filter((c) => c.type === filter)),
    [all, filter],
  );

  const chips = useMemo<ChipTabItem<CategoryFilter>[]>(
    () => [
      { value: FILTER_ALL, label: tLabels('all'), count: all.length },
      ...RECEIPT_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('financeCategoryType', value),
        count: all.filter((c) => c.type === value).length,
      })),
    ],
    [all, domainLabel, tLabels],
  );

  const typeOptions = useMemo(
    () =>
      // "Phiếu thu"/"Phiếu chi" như viên loại trên từng dòng và Figma `24512:129578` - không phải "Thu"/"Chi" của chip lọc.
      RECEIPT_TYPE_VALUES.map((value) => ({
        value,
        label: value === RECEIPT_TYPE.INCOME ? t('typeBadge.income') : t('typeBadge.expense'),
      })),
    [t],
  );

  const trimmed = name.trim();

  const openAdd = useCallback(() => {
    // Đang lọc một loại thì dòng mới mặc định đúng loại đó - người dùng vừa nói họ đang làm việc với nó.
    setType(filter === FILTER_ALL ? RECEIPT_TYPE.EXPENSE : filter);
    setAdding(true);
    setAddSeq((n) => n + 1);
  }, [filter]);

  const cancelAdd = useCallback(() => {
    setName('');
    setAdding(false);
  }, []);

  const add = () => {
    if (!trimmed || create.isPending) return;
    create.mutate(
      { type: type as CreateCategoryInput['type'], name: trimmed },
      {
        onSuccess: () => {
          setName('');
          // Đóng thẻ thêm - danh mục mới hiện ngay trong danh sách (chốt 26/11/2026).
          toast.showSuccess(t('added'));
          setAdding(false);
        },
        onError: (error) => toast.showError(getErrorMessage(error)),
      },
    );
  };

  const saveRename = () => {
    if (!editing) return;
    const next = editing.name.trim();
    const current = query.data?.find((c) => c.id === editing.id);
    // Không đổi gì (hoặc rỗng) thì đóng ô sửa, không gọi server.
    if (!next || next === current?.name) {
      setEditing(null);
      return;
    }
    rename.mutate(
      { id: editing.id, name: next },
      {
        onSuccess: () => {
          setEditing(null);
          toast.showSuccess(t('renamed'));
        },
        onError: (error) => toast.showError(getErrorMessage(error)),
      },
    );
  };

  const confirmRemove = () => {
    if (!removing) return;
    remove.mutate(removing.id, {
      onSuccess: () => {
        setRemoving(null);
        toast.showSuccess(t('deleted'));
      },
      onError: (error) => {
        toast.showError(getErrorMessage(error));
        setRemoving(null);
      },
    });
  };

  const startEdit = useCallback((category: FinanceCategory) => {
    setEditing({ id: category.id, name: category.name });
  }, []);

  const loaded = !query.isPending && !query.isError;
  const showList = loaded && list.length > 0;

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      chrome="v2"
      headerDivider
      /*
        Chân tấm (chốt 26/11/2026):
        - bình thường: nút vàng "+ Thêm danh mục";
        - đang thêm: "Hủy" + "Thêm danh mục" - hành động của thẻ thêm nằm ở chân tấm (luôn thấy, kể
          cả khi bàn phím mở), thẻ chỉ còn hai ô nhập. Đóng tấm bằng dấu X ở đầu.
      */
      {...(canManage && loaded
        ? {
            footer: adding ? (
              /* "Huỷ" vừa chữ, phần còn lại cho nút chính (như `SheetConfirmFooter`). */
              <XStack gap={space.md}>
                <YStack>
                  <Button
                    label={tActions('cancel')}
                    variant="secondary"
                    shape="square"
                    disabled={create.isPending}
                    onPress={cancelAdd}
                  />
                </YStack>
                <YStack f={1}>
                  <Button
                    label={t('addSubmit')}
                    variant="gradient"
                    shape="square"
                    loading={create.isPending}
                    disabled={!trimmed}
                    onPress={add}
                  />
                </YStack>
              </XStack>
            ) : (
              <Button
                label={t('addRow')}
                variant="gradient"
                shape="square"
                lineIcon="add"
                onPress={openAdd}
              />
            ),
          }
        : {})}
      /* Mở thẻ thêm ⇒ cuộn xuống đáy cho thấy ngay thẻ (nó nằm sau danh sách). */
      scrollToEndKey={adding ? addSeq : null}
    >
      {!canManage && finance.isVisible && !finance.canWrite ? (
        <Callout tone="warning">{tFeature('appReadOnlyTooltip')}</Callout>
      ) : null}

      {loaded && all.length > 0 ? (
        <ChipTabs
          label={t('title')}
          items={chips}
          value={filter}
          onSelect={setFilter}
          gutter={0}
        />
      ) : null}

      {query.isPending ? (
        <SkeletonText lines={5} />
      ) : query.isError ? (
        <ScreenError
          error={query.error}
          title={tStates('loadError')}
          onRetry={() => void query.refetch()}
        />
      ) : !showList ? (
        adding ? null : <ScreenMessage icon="pricetags-outline" title={t('empty')} />
      ) : (
        /* Figma "Category List" `24512:129049`: khung trắng viền `stroke/gray-low200`, bo 12, các
           dòng ngăn nhau bằng vạch cùng màu. */
        <YStack bg={colors.surface} bw={1} bc={colors.border} br={radius.control} ov="hidden">
          {list.map((category, index) => {
            const last = index === list.length - 1;
            return editing?.id === category.id ? (
              <YStack
                key={category.id}
                p={ROW_PAD}
                gap={space.sm}
                borderBottomWidth={last ? 0 : 1}
                borderColor={colors.border}
              >
                <TextControl
                  label={t('nameLabel')}
                  value={editing.name}
                  onChangeText={(next) => setEditing({ id: category.id, name: next })}
                  maxLength={NAME_MAX}
                />
                <XStack jc="flex-end" gap={space.sm}>
                  <IconSquareButton
                    label={t('discard')}
                    size="sm"
                    tone="muted"
                    disabled={rename.isPending}
                    onPress={() => setEditing(null)}
                  >
                    <LineIcon name="close" size={ROW_ICON} color={colors.textMuted} />
                  </IconSquareButton>
                  <IconSquareButton
                    label={t('save')}
                    size="sm"
                    tone="brand"
                    busy={rename.isPending}
                    disabled={!editing.name.trim()}
                    onPress={saveRename}
                  >
                    <LineIcon name="check-xs" size={ROW_ICON} color={colors.text} />
                  </IconSquareButton>
                </XStack>
              </YStack>
            ) : (
              <CategoryRow
                key={category.id}
                category={category}
                last={last}
                canManage={canManage}
                typeLabel={
                  category.type === RECEIPT_TYPE.INCOME
                    ? t('typeBadge.income')
                    : t('typeBadge.expense')
                }
                systemLabel={t('system')}
                editLabel={t('edit')}
                deleteLabel={t('delete')}
                onEdit={startEdit}
                onDelete={setRemoving}
              />
            );
          })}

        </YStack>
      )}

      {/*
        Figma "Inline Add Category Card" `24512:129515`: thẻ nền `bg/primary-25` viền `stroke/primary`
        bo 12, đầu thẻ "Thêm danh mục mới" + "Đóng", hai ô Tên/Loại, nút vàng trọn bề ngang. Thêm là
        LƯU NGAY (chốt 25/11/2026) - chân tấm chỉ có "Đóng".
      */}
      {canManage && loaded ? (
        adding ? (
          <YStack
            p={ROW_PAD}
            gap={ROW_PAD}
            bg={colors.brandWash}
            bw={1}
            bc={colors.brandShape}
            br={radius.control}
          >
            <Text
              col={colors.brandHigh}
              fos={typeScale.body.fontSize}
              lh={typeScale.body.lineHeight}
              fontFamily={FONT_FAMILY.semibold}
            >
              {t('addTitle')}
            </Text>
            <TextControl
              label={t('nameLabel')}
              required
              value={name}
              onChangeText={setName}
              placeholder={t('namePlaceholder')}
              maxLength={NAME_MAX}
            />
            <SelectControl
              label={t('typeLabel')}
              required
              value={type}
              options={typeOptions}
              onChange={setType}
            />
          </YStack>
        ) : null
      ) : null}

      {/* Xác nhận xoá: popup chuẩn app (như "Từ chối đơn thuê") - "Huỷ" + "Xoá" MỘT hàng (chốt 26/11/2026). */}
      <ConfirmSheet
        open={removing !== null}
        title={t('delete')}
        message={removing ? t('deleteConfirm', { name: removing.name }) : undefined}
        confirmLabel={tActions('delete')}
        tone="danger"
        loading={remove.isPending}
        onClose={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </BottomSheet>
  );
}

/**
 * Một dòng danh mục - Figma `24512:129050`: tên 14/20 medium, viên loại dưới tên, hai nút vuông 32
 * (sửa nền xám, xoá nền đỏ nhạt) ở phải. Danh mục hệ thống không có nút, mang chữ "Hệ thống".
 */
const CategoryRow = memo(function CategoryRow({
  category,
  last,
  canManage,
  typeLabel,
  systemLabel,
  editLabel,
  deleteLabel,
  onEdit,
  onDelete,
}: {
  category: FinanceCategory;
  last: boolean;
  canManage: boolean;
  typeLabel: string;
  systemLabel: string;
  editLabel: string;
  deleteLabel: string;
  onEdit: (category: FinanceCategory) => void;
  onDelete: (category: FinanceCategory) => void;
}) {
  const colors = useColors();
  const edit = useCallback(() => onEdit(category), [category, onEdit]);
  const del = useCallback(() => onDelete(category), [category, onDelete]);
  return (
    <XStack
      ai="center"
      gap={ROW_PAD}
      p={ROW_PAD}
      borderBottomWidth={last ? 0 : 1}
      borderColor={colors.border}
    >
      <YStack f={1} minWidth={0} gap={space.xs} ai="flex-start">
        {/* Tên + chip "Hệ thống" (xám) NGANG HÀNG (chốt 26/11/2026). */}
        <XStack ai="center" gap={space.xs} maxWidth="100%">
          <Text
            col={colors.text}
            fos={typeScale.body.fontSize}
            lh={typeScale.body.lineHeight}
            fow={fontWeight.medium}
            numberOfLines={2}
            flexShrink={1}
          >
            {category.name}
          </Text>
          {category.isSystem ? <Pill label={systemLabel} tone="neutral" shape="tag" size="sm" /> : null}
        </XStack>
        <Pill label={typeLabel} tone={category.type === RECEIPT_TYPE.INCOME ? 'success' : 'danger'} />
      </YStack>

      {canManage && !category.isSystem ? (
        <XStack gap={space.sm}>
          <IconSquareButton label={editLabel} size="sm" tone="muted" onPress={edit}>
            <LineIcon name="edit-1" size={ROW_ICON} color={colors.textMuted} />
          </IconSquareButton>
          <IconSquareButton label={deleteLabel} size="sm" tone="dangerSoft" onPress={del}>
            <LineIcon name="trash" size={ROW_ICON} color={colors.danger} />
          </IconSquareButton>
        </XStack>
      ) : null}
    </XStack>
  );
});
