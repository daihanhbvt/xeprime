'use client';

import { Alert, App, Button, Form } from 'antd';
import { useTranslations } from 'next-intl';
import { useEffect, useState } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import * as yup from 'yup';
import { API_ERROR_CODE, APPROVAL_INTERNAL_NOTE_MAX_LENGTH } from '@xeprime/types';
import { TextAreaField } from '@/components/form/TextAreaField';
import { useAppFormat } from '@/i18n/use-app-format';
import { useErrorMessage } from '@/i18n/use-error-message';
import { useValidationResolver } from '@/i18n/use-validation-resolver';
import { getErrorCode, getErrorDetails } from '@/services/api-client';
import { useSaveVehicleApprovalNote } from '../hooks/use-vehicle-approvals';
import type { VehicleApprovalDetail, VehicleApprovalInternalNote } from '../types';
import styles from './VehicleApprovalDrawer.module.css';

interface NoteValues {
  note: string;
}

const noteSchema = yup.object({
  note: yup
    .string()
    .defined()
    .max(
      APPROVAL_INTERNAL_NOTE_MAX_LENGTH,
      `tooLong::${JSON.stringify({ max: APPROVAL_INTERNAL_NOTE_MAX_LENGTH })}`,
    ),
});

/**
 * GHI CHÚ NỘI BỘ — trí nhớ của đội vận hành về chiếc xe này, KHÔNG phải lý do gửi chủ xe.
 *
 * Lưu tường minh (nút Lưu), không tự lưu theo phím gõ: mỗi lần lưu là một dòng audit, và một
 * dòng audit cho mỗi ký tự thì không ai đọc nổi. Khoá lạc quan theo `updatedAt`: người khác vừa
 * sửa ⇒ server trả 409 kèm bản đang lưu, và người duyệt CHỌN — lấy bản mới nhất hay ghi đè có chủ
 * đích — thay vì âm thầm xoá mất chữ của đồng nghiệp.
 */
export function InternalNoteForm({
  detail,
  onDirtyChange,
}: {
  detail: VehicleApprovalDetail;
  /** Báo lên panel khi có chữ CHƯA LƯU — để rời phiếu (trước/sau/đóng) phải hỏi lại. */
  onDirtyChange?: (dirty: boolean) => void;
}) {
  const t = useTranslations('Approvals.note');
  const fmt = useAppFormat();
  const { message } = App.useApp();
  const errorMessage = useErrorMessage();
  const save = useSaveVehicleApprovalNote();
  const saved = detail.internalNote;
  const [conflict, setConflict] = useState<VehicleApprovalInternalNote | null>(null);

  const resolver = useValidationResolver<NoteValues>(noteSchema, 'Approvals.note');
  const { control, handleSubmit, reset, formState } = useForm<NoteValues>({
    resolver,
    defaultValues: { note: saved.note ?? '' },
  });
  const current = useWatch({ control, name: 'note' });

  /*
   * Bản lưu đổi từ BÊN NGOÀI (chuyển sang phiếu khác, tải lại sau xung đột) ⇒ đưa form về bản đó
   * — nhưng chỉ khi người dùng không có chữ đang gõ dở. Ghi đè chữ đang gõ là mất dữ liệu.
   */
  useEffect(() => {
    if (!formState.isDirty) reset({ note: saved.note ?? '' });
  }, [saved.note, saved.updatedAt, formState.isDirty, reset]);

  const submit = (expectedUpdatedAt: string | null) =>
    handleSubmit((values) =>
      save.mutate(
        { id: detail.approvalTaskId, note: values.note, expectedUpdatedAt },
        {
          onSuccess: (result) => {
            setConflict(null);
            reset({ note: result.note ?? '' });
            message.success(t('saved'));
          },
          onError: (error) => {
            if (getErrorCode(error) === API_ERROR_CODE.APPROVAL_NOTE_CONFLICT) {
              const details = getErrorDetails(error) as
                { current?: VehicleApprovalInternalNote } | undefined;
              setConflict(details?.current ?? null);
              return;
            }
            message.error(errorMessage(error));
          },
        },
      ),
    )();

  const unchanged = (current ?? '').trim() === (saved.note ?? '').trim();

  useEffect(() => {
    onDirtyChange?.(!unchanged);
  }, [unchanged, onDirtyChange]);
  // Rời khỏi màn (đổi phiếu, đóng panel) thì không còn chữ nào của form này đang chờ lưu.
  useEffect(() => () => onDirtyChange?.(false), [onDirtyChange]);

  return (
    <section className={styles.noteSection} aria-label={t('title')}>
      {conflict ? (
        <Alert
          type="warning"
          showIcon
          className={styles.noteConflict}
          title={t('conflict.title')}
          description={
            <>
              <span className={styles.caption}>
                {t('conflict.current', {
                  name: conflict.updatedByName ?? '—',
                  at: fmt.shortDateTime(conflict.updatedAt),
                })}
              </span>
              <span className={styles.prose}>{conflict.note ?? t('conflict.empty')}</span>
            </>
          }
          action={
            <div className={styles.noteConflictActions}>
              <Button
                size="small"
                onClick={() => {
                  reset({ note: conflict.note ?? '' });
                  setConflict(null);
                }}
              >
                {t('conflict.useLatest')}
              </Button>
              <Button
                size="small"
                danger
                loading={save.isPending}
                onClick={() => void submit(conflict.updatedAt ?? null)}
              >
                {t('conflict.keepMine')}
              </Button>
            </div>
          }
        />
      ) : null}

      <Form component={false} layout="vertical">
        <form
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            void submit(saved.updatedAt ?? null);
          }}
        >
          <TextAreaField
            control={control}
            name="note"
            label={<span className={styles.checkGroupTitle}>{t('title')}</span>}
            help={t('hint')}
            placeholder={t('placeholder')}
            rows={3}
            maxLength={APPROVAL_INTERNAL_NOTE_MAX_LENGTH}
            showCount
          />
          <div className={styles.noteFoot}>
            <span className={styles.caption}>
              {saved.updatedAt
                ? t('lastUpdated', {
                    at: fmt.shortDateTime(saved.updatedAt),
                    name: saved.updatedByName ?? '—',
                  })
                : null}
            </span>
            <Button
              htmlType="submit"
              size="small"
              loading={save.isPending && !conflict}
              disabled={unchanged || Boolean(conflict)}
            >
              {t('save')}
            </Button>
          </div>
        </form>
      </Form>
    </section>
  );
}
