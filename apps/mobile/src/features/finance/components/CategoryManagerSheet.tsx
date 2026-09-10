import { useState } from 'react';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  FINANCE_CATEGORY_TYPE_META,
  PERMISSION,
  PLAN_FEATURE,
  RECEIPT_TYPE,
  RECEIPT_TYPE_VALUES,
  STATUS_COLOR,
  type FinanceCategoryType,
} from '@xeprime/types';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { Card } from '@/components/ui/Card';
import { IconButton } from '@/components/ui/IconButton';
import { SelectControl } from '@/components/ui/SelectControl';
import { SkeletonText } from '@/components/ui/Skeleton';
import { StatusBadge } from '@/components/ui/StatusBadge';
import { TextControl } from '@/components/ui/TextControl';
import { ScreenError } from '@/components/state/ScreenError';
import { ScreenMessage } from '@/components/state/ScreenMessage';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { usePermissions } from '@/features/auth/hooks/use-permissions';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { colors, fontSize, fontWeight, sizing, space } from '@/theme/tokens';
import { useCreateCategory, useDeleteCategory, useFinanceCategories } from '../hooks/use-finance';
import type { CreateCategoryInput, FinanceCategory } from '../api';

/**
 * Bề rộng hai cột nhãn của một hàng danh mục.
 *
 * Đủ ôm chuỗi DÀI NHẤT của cả hai ngôn ngữ ở cỡ `sm` ("Hệ thống", "Tự tạo" / "System",
 * "Custom") cộng lề của viên. Cột cố định là thứ giữ cho hai dải nhãn thẳng hàng suốt danh
 * sách — chữ trong viên vốn dài ngắn khác nhau theo từng hàng.
 */
const TYPE_COL_WIDTH = 56;
const SOURCE_COL_WIDTH = 84;

/** Trần tên danh mục — khớp `maxLength={255}` của ô nhập bên web và DTO backend. */
const NAME_MAX = 255;

/**
 * Quản lý danh mục thu/chi (FIN-03) — bản native của `CategoryManagerModal`.
 *
 * Mở từ CHÍNH sổ Thu-Chi (đúng lối vào duy nhất của web), không phải một mục menu riêng: danh
 * mục chỉ có nghĩa khi đang nhìn vào sổ.
 *
 * Ba luật giữ nguyên từ web:
 *  1. **Danh mục HỆ THỐNG không xoá được** — chúng là đích của phiếu tự động (`system_key`), xoá
 *     một cái là mọi phiếu bảo dưỡng sau đó mất danh mục.
 *  2. **KHÔNG có đổi tên**, dù backend có `PATCH /finance/categories/:id`: web chưa mở luồng đó,
 *     và app đi trước web là hai sản phẩm khác nhau.
 *  3. Thêm/xoá cần `receipt.create` + feature gate `finance` — cùng bộ guard backend đang gác.
 *
 * Khác web đúng một chỗ: xoá có bước XÁC NHẬN. Web gọi mutation ngay khi bấm; trên native thì
 * nút xoá là một biểu tượng 24dp cạnh mép ngón tay, và một cú chạm nhầm ở đó xoá mất một danh
 * mục của gian hàng mà không có đường hoàn tác.
 */
export function CategoryManagerSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const t = useTranslations('Finance.receipts.categories');
  const tActions = useTranslations('Common.actions');
  const tStates = useTranslations('Common.states');
  const tFeature = useTranslations('ManageCommon.feature');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const permissions = usePermissions();
  const finance = useFeature(PLAN_FEATURE.FINANCE);

  const canManage = permissions.has(PERMISSION.RECEIPT_CREATE) && finance.canWrite;

  const [type, setType] = useState<string>(RECEIPT_TYPE.EXPENSE);
  const [name, setName] = useState('');
  const [removing, setRemoving] = useState<FinanceCategory | null>(null);

  /* Chỉ gọi khi tấm MỞ — danh mục không có giá trị gì cho tới lúc người dùng mở nó ra. */
  const query = useFinanceCategories(undefined, open);
  const create = useCreateCategory();
  const remove = useDeleteCategory();

  const trimmed = name.trim();

  const add = () => {
    if (!trimmed) return;
    create.mutate(
      { type: type as CreateCategoryInput['type'], name: trimmed },
      {
        onSuccess: () => {
          setName('');
          toast.showSuccess(t('added'));
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  };

  const confirmRemove = () => {
    if (!removing) return;
    remove.mutate(removing.id, {
      onSuccess: () => setRemoving(null),
      onError: (error) => {
        toast.showError(errorMessage(error));
        setRemoving(null);
      },
    });
  };

  const list = query.data ?? [];

  return (
    <BottomSheet open={open} onClose={onClose} title={t('title')}>
      {canManage ? (
        <YStack gap={space.sm}>
          <SelectControl
            label={t('typeLabel')}
            value={type}
            options={RECEIPT_TYPE_VALUES.map((value) => ({
              value,
              label: domainLabel('financeCategoryType', value),
            }))}
            onChange={setType}
          />
          <TextControl
            label={t('nameLabel')}
            value={name}
            onChangeText={setName}
            placeholder={t('namePlaceholder')}
            maxLength={NAME_MAX}
          />
          <Button
            label={tActions('add')}
            icon="add"
            loading={create.isPending}
            disabled={!trimmed}
            onPress={add}
          />
        </YStack>
      ) : finance.isVisible && !finance.canWrite ? (
        <Callout tone="warning">{tFeature('readOnlyTooltip')}</Callout>
      ) : null}

      {query.isPending ? (
        <SkeletonText lines={5} />
      ) : query.isError ? (
        <ScreenError
          error={query.error}
          title={tStates('loadError')}
          onRetry={() => void query.refetch()}
        />
      ) : list.length === 0 ? (
        <ScreenMessage icon="pricetags-outline" title={tStates('empty')} />
      ) : (
        <YStack gap={space.xs}>
          {list.map((category) => (
            /*
              Hàng cao ĐÚNG một vùng chạm, ở cả hai nhánh.

              Đệm của `Card` cộng với nút xoá (một ô 48pt) làm hàng "danh mục tự thêm" cao 80pt,
              trong khi hàng "hệ thống" — chỉ có một nhãn chữ — cao 60pt. Xen kẽ hai loại thì cả
              danh sách so le và viên nhãn loại nhảy lên nhảy xuống theo từng hàng. Bỏ đệm của thẻ,
              tự đặt `minHeight` bằng vùng chạm: nhánh nào cũng ra đúng một chiều cao, và nút xoá
              vẫn giữ nguyên 48pt cho ngón tay.
            */
            <Card key={category.id} tone="muted" lift="flat" padded={false}>
              <XStack
                ai="center"
                gap={space.sm}
                px={space.md}
                py={space.xs}
                minHeight={sizing.touchTarget}
              >
                <Text
                  f={1}
                  minWidth={0}
                  col={colors.text}
                  fos={fontSize.bodySm}
                  fow={fontWeight.medium}
                  numberOfLines={2}
                >
                  {category.name}
                </Text>

                {/*
                  Hai viên nhãn trả lời hai câu khác nhau — CHIỀU TIỀN (Thu/Chi) và NGUỒN (hệ
                  thống hay gian hàng tự thêm) — nên đứng cạnh nhau ở cùng một cột phải, không
                  cái nào tụt xuống dòng phụ.

                  Mỗi viên nằm trong một ô có bề rộng SÀN và canh giữa: chữ "Thu" ngắn hơn "Chi",
                  "Tự tạo" ngắn hơn "Hệ thống", thả tự do thì cột nhãn so le theo từng hàng. Sàn
                  chứ không phải bề rộng cứng — máy đang phóng to cỡ chữ hệ thống thì ô nở ra
                  theo, không cắt mất chữ.
                */}
                <XStack w={TYPE_COL_WIDTH} ai="center" jc="center">
                  <StatusBadge
                    label={domainLabel('financeCategoryType', category.type)}
                    color={FINANCE_CATEGORY_TYPE_META[category.type as FinanceCategoryType].color}
                    size="sm"
                  />
                </XStack>

                {/*
                  Nguồn có nhãn ở CẢ HAI nhánh. Chỉ gắn viên cho danh mục hệ thống thì hàng trống
                  đọc ra là "chưa tải xong" chứ không phải "của tôi tự thêm" — mà đó mới là điều
                  nói cho người dùng biết hàng nào xoá được.

                  Hai màu tách hẳn nhau: hệ thống xám trung tính (thứ có sẵn, không đụng vào
                  được), tự tạo xanh dương (thứ gian hàng làm chủ).
                */}
                <XStack w={SOURCE_COL_WIDTH} ai="center" jc="center">
                  <StatusBadge
                    label={category.isSystem ? t('system') : t('custom')}
                    color={category.isSystem ? STATUS_COLOR.NEUTRAL : STATUS_COLOR.INFO}
                    size="sm"
                  />
                </XStack>

                {/*
                  Ô CUỐI chỉ giữ nút xoá, bề rộng CỐ ĐỊNH bằng vùng chạm — giữ chỗ cả ở hàng hệ
                  thống (không xoá được) để hai cột nhãn của mọi hàng thẳng nhau. Người không có
                  quyền sửa thì không có cột này, danh sách khỏi chừa một dải trống.
                */}
                {canManage ? (
                  <XStack w={sizing.touchTarget} ai="center" jc="flex-end">
                    {category.isSystem ? null : (
                      <IconButton
                        icon="trash-outline"
                        label={t('delete')}
                        tone="danger"
                        onPress={() => setRemoving(category)}
                      />
                    )}
                  </XStack>
                ) : null}
              </XStack>
            </Card>
          ))}
        </YStack>
      )}

      <AlertDialog
        open={removing !== null}
        title={t('delete')}
        message={removing?.name}
        confirmLabel={tActions('delete')}
        destructive
        loading={remove.isPending}
        onCancel={() => setRemoving(null)}
        onConfirm={confirmRemove}
      />
    </BottomSheet>
  );
}
