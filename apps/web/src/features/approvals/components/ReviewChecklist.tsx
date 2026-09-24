'use client';

import { CheckCircleFilled, CloseCircleFilled } from '@ant-design/icons';
import { App, Checkbox, Tag } from 'antd';
import { useTranslations } from 'next-intl';
import {
  APPROVAL_STATUS,
  VEHICLE_PUBLIC_MIN_IMAGES,
  isVehicleReviewCheck,
  vehicleReviewAutoChecks,
} from '@xeprime/types';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { cx } from '@/lib/cx';
import { useSetVehicleApprovalCheck } from '../hooks/use-vehicle-approvals';
import type { VehicleApprovalDetail } from '../types';
import { InternalNoteForm } from './InternalNoteForm';
import styles from './VehicleApprovalDrawer.module.css';

/**
 * Cột "Danh mục kiểm tra" — hai nhóm KHÁC BẢN CHẤT, và giao diện nói rõ điều đó.
 *
 * - **Tự động**: chấm bằng `vehicleReviewAutoChecks` — tức CHÍNH cổng gửi duyệt của chủ xe
 *   (`applicablePublishRequirements`/`missingPublishRequirements` ở @xeprime/types), không phải
 *   một bộ luật thứ hai viết lại ở web. Chỉ đọc; chỉ hiện điều kiện áp dụng với xe này.
 * - **Thủ công**: người duyệt tự đánh dấu; lưu ở SERVER theo phiếu (ai, lúc nào), nên F5 hay một
 *   người duyệt khác mở cùng phiếu đều thấy đúng thứ đã đánh dấu.
 *
 * Không có mục giấy tờ nào (đăng ký, đăng kiểm, bảo hiểm) — luồng đăng xe không thu chúng.
 */
export function ReviewChecklist({
  detail,
  onNoteDirtyChange,
}: {
  detail: VehicleApprovalDetail;
  /** Ghi chú nội bộ có chữ CHƯA LƯU — panel hỏi lại trước khi rời phiếu. */
  onNoteDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations('Approvals.checklist');
  const autoChecks = vehicleReviewAutoChecks(detail);
  const autoPassed = autoChecks.filter((c) => c.passed).length;
  const manualPassed = detail.manualChecks.filter((c) => c.passed).length;
  const editable = detail.approvalStatus === APPROVAL_STATUS.PENDING;

  return (
    <div className={styles.checklist}>
      <h3 className={styles.sideTitle}>{t('title')}</h3>

      <section className={styles.checkGroup} aria-labelledby="review-auto-checks">
        <header className={styles.checkGroupHead}>
          <h4 id="review-auto-checks" className={styles.checkGroupTitle}>
            {t('auto.title')}
          </h4>
          <Progress passed={autoPassed} total={autoChecks.length} />
        </header>
        <p className={styles.caption}>{t('auto.hint')}</p>
        <ul className={styles.checkList}>
          {autoChecks.map((check) => (
            <li key={check.key} className={styles.checkRow}>
              {check.passed ? (
                <CheckCircleFilled className={styles.iconPass} aria-hidden />
              ) : (
                <CloseCircleFilled className={styles.iconFail} aria-hidden />
              )}
              <span className={styles.checkLabel}>
                {t(`auto.items.${check.key}`, { min: VEHICLE_PUBLIC_MIN_IMAGES })}
              </span>
              <StateTag passed={check.passed} />
            </li>
          ))}
        </ul>
      </section>

      <section className={styles.checkGroup} aria-labelledby="review-manual-checks">
        <header className={styles.checkGroupHead}>
          <h4 id="review-manual-checks" className={styles.checkGroupTitle}>
            {t('manual.title')}
          </h4>
          <Progress passed={manualPassed} total={detail.manualChecks.length} />
        </header>
        <p className={styles.caption}>{editable ? t('manual.hint') : t('manual.locked')}</p>
        <ManualChecks detail={detail} editable={editable} />
      </section>

      <InternalNoteForm detail={detail} onDirtyChange={onNoteDirtyChange} />
    </div>
  );
}

function ManualChecks({ detail, editable }: { detail: VehicleApprovalDetail; editable: boolean }) {
  const t = useTranslations('Approvals.checklist');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const setCheck = useSetVehicleApprovalCheck();
  const taskId = detail.approvalTaskId;

  return (
    <ul className={styles.checkList}>
      {detail.manualChecks.map((check) => {
        if (!isVehicleReviewCheck(check.key)) return null;
        const saving =
          setCheck.isPending &&
          setCheck.variables?.id === taskId &&
          setCheck.variables.key === check.key;
        return (
          <li key={check.key} className={cx(styles.checkRow, styles.checkRowManual)}>
            <Checkbox
              checked={check.passed}
              disabled={!editable || saving}
              onChange={(event) =>
                setCheck.mutate(
                  { id: taskId, key: check.key, passed: event.target.checked },
                  { onError: (error) => message.error(errorMessage(error)) },
                )
              }
              className={styles.checkLabel}
            >
              {t(`manual.items.${check.key}`)}
            </Checkbox>
            {check.passed ? (
              <StateTag passed />
            ) : (
              <Tag color="warning" className={styles.stateTag}>
                {t('pending')}
              </Tag>
            )}
            {check.updatedByName && check.updatedAt ? (
              <span className={cx(styles.caption, styles.checkMeta)}>
                {t('manual.updatedBy', {
                  name: check.updatedByName,
                  at: fmt.shortDateTime(check.updatedAt),
                })}
              </span>
            ) : null}
          </li>
        );
      })}
    </ul>
  );
}

function StateTag({ passed }: { passed: boolean }) {
  const t = useTranslations('Approvals.checklist');
  return (
    <Tag color={passed ? 'success' : 'error'} className={styles.stateTag}>
      {passed ? t('passed') : t('failed')}
    </Tag>
  );
}

/** "7/7 đạt" — xanh khi đủ, hổ phách khi còn thiếu. Luôn có chữ, không chỉ màu. */
function Progress({ passed, total }: { passed: number; total: number }) {
  const t = useTranslations('Approvals.checklist');
  const complete = total > 0 && passed === total;
  return (
    <span className={cx(styles.progress, complete ? styles.progressDone : styles.progressTodo)}>
      {t('progress', { passed, total })}
    </span>
  );
}
