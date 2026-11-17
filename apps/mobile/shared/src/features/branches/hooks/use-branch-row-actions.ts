import { useCallback, useState } from 'react';
import { useTranslations } from 'use-intl';
import { BRANCH_STATUS, PLAN_FEATURE } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { useFeature } from '@/features/auth/hooks/use-feature';
import { useErrorMessage } from '@/i18n/use-error-message';
import { BRANCH_ACTION, type Branch, type BranchAction } from '../api';
import type { BranchCardActionState } from '../components/BranchCard';
import { useBranchAction } from './use-branches';

/**
 * Luật thao tác theo HÀNG chi nhánh (đặt mặc định · ngừng · mở lại) - MỘT bản cho màn danh sách
 * Chi nhánh và thẻ "Chi nhánh" của trang Thông tin cửa hàng (web dùng chung `BranchesView` cho cả
 * hai bề mặt). Hai bản chép là hai cách giải thích nút bị khoá trôi khỏi nhau.
 *
 * Đây là bản sao của `disabled`/`disabledReason` bên web và chỉ là lớp trải nghiệm: backend vẫn từ
 * chối bằng 409 kèm mã lỗi.
 */
export function useBranchRowActions() {
  const t = useTranslations('Branches');
  const tCommon = useTranslations('Common.actions');
  const tFeature = useTranslations('ManageCommon.feature');
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const branchesFeature = useFeature(PLAN_FEATURE.BRANCHES);
  const action = useBranchAction();

  /** Chi nhánh đang chờ xác nhận NGỪNG - web `RowActions` hỏi lại trước khi ngừng (`confirmDeactivate`). */
  const [confirming, setConfirming] = useState<Branch | null>(null);

  const execute = useCallback(
    (branch: Branch, next: BranchAction, onSettled?: () => void) => {
      action.mutate(
        { id: branch.id, action: next },
        {
          onSuccess: () =>
            toast.showSuccess(
              next === BRANCH_ACTION.SET_DEFAULT
                ? t('toast.setDefault')
                : next === BRANCH_ACTION.ACTIVATE
                  ? t('toast.activated')
                  : t('toast.deactivated'),
            ),
          // Xung đột (còn xe / còn đơn) dịch từ MÃ như mọi lỗi khác (ADR 0012).
          onError: (err) => toast.showError(errorMessage(err)),
          ...(onSettled ? { onSettled } : {}),
        },
      );
    },
    [action, errorMessage, t, toast],
  );

  /** Ngừng hoạt động phải xác nhận như web; đặt mặc định / mở lại chạy ngay. */
  const runAction = useCallback(
    (branch: Branch, next: BranchAction) => {
      if (next === BRANCH_ACTION.DEACTIVATE) setConfirming(branch);
      else execute(branch, next);
    },
    [execute],
  );

  /** Props cho `<AlertDialog>` xác nhận ngừng - nơi gọi dựng hộp, hook giữ trạng thái. */
  const deactivateConfirm = {
    open: confirming !== null,
    title: t('confirmDeactivate.title'),
    message: t('confirmDeactivate.description'),
    confirmLabel: tCommon('agree'),
    cancelLabel: tCommon('cancel'),
    destructive: true,
    loading: action.isPending,
    onConfirm: () => {
      if (!confirming) return;
      execute(confirming, BRANCH_ACTION.DEACTIVATE, () => setConfirming(null));
    },
    onCancel: () => setConfirming(null),
  };

  const actionStateOf = useCallback(
    (branch: Branch): Readonly<Record<BranchAction, BranchCardActionState>> => {
      const canWrite = branchesFeature.canWrite;
      // Gói hết hạn: nói RÕ lý do khoá thay vì để ô mờ đi không giải thích (ADR 0027 điều 3).
      const lockedByPlan = canWrite
        ? undefined
        : { enabled: false, reason: tFeature('appReadOnlyTooltip') };
      return {
        [BRANCH_ACTION.SET_DEFAULT]:
          branch.status !== BRANCH_STATUS.ACTIVE
            ? { enabled: false, reason: t('blocked.inactive') }
            : !branch.provinceCode
              ? { enabled: false, reason: t('blocked.noProvince') }
              : (lockedByPlan ?? { enabled: canWrite }),
        [BRANCH_ACTION.DEACTIVATE]: branch.isDefault
          ? { enabled: false, reason: t('blocked.isDefault') }
          : (lockedByPlan ?? { enabled: canWrite }),
        [BRANCH_ACTION.ACTIVATE]: lockedByPlan ?? { enabled: canWrite },
      };
    },
    [branchesFeature.canWrite, t, tFeature],
  );

  const pending = action.isPending ? action.variables : null;
  return {
    runAction,
    actionStateOf,
    pending,
    canWrite: branchesFeature.canWrite,
    deactivateConfirm,
  };
}
