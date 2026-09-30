import { useMemo } from 'react';
import { useForm, useWatch } from 'react-hook-form';
import { yupResolver } from '@hookform/resolvers/yup';
import { YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import { SUPPORT_CASE_CATEGORY, SUPPORT_CASE_CATEGORY_VALUES } from '@xeprime/types';
import { useAppToast } from '@/components/feedback/use-app-toast';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Callout } from '@/components/ui/Callout';
import { SelectField } from '@/components/ui/SelectField';
import { TextField } from '@/components/ui/TextField';
import { useDomainLabel } from '@/i18n/domain';
import { useErrorMessage } from '@/i18n/use-error-message';
import { space } from '@/theme/tokens';
import type { SupportSurface } from '../api';
import { useOpenSupportCase } from '../hooks/use-support-cases';

const SUBJECT_MIN = 5;
const SUBJECT_MAX = 255;
const DESCRIPTION_MIN = 10;
const DESCRIPTION_MAX = 5000;

/**
 * Danh mục MỞ ĐƯỢC — mọi danh mục TRỪ "yêu cầu xoá tài khoản".
 *
 * Xoá tài khoản có luồng riêng ở `/account/delete-account`: ô đánh dấu xác nhận, và DB chỉ cho
 * một yêu cầu còn mở mỗi người. Để nó trong danh sách này là mở đường cho yêu cầu thứ hai mà
 * server sẽ từ chối — đúng lý do web cũng loại nó ra.
 */
const OPENABLE_CATEGORIES = SUPPORT_CASE_CATEGORY_VALUES.filter(
  (value) => value !== SUPPORT_CASE_CATEGORY.ACCOUNT_DELETION,
);

/** Mở một yêu cầu hỗ trợ — bản native của `OpenCaseModal`. */
export function OpenCaseSheet({
  surface,
  open,
  onClose,
  onOpened,
}: {
  surface: SupportSurface;
  open: boolean;
  onClose: () => void;
  /** Mở thẳng yêu cầu vừa tạo — người dùng đang muốn theo dõi nó, không phải quay về danh sách. */
  onOpened?: (id: string) => void;
}) {
  const t = useTranslations('SupportCases.form');
  const tCommon = useTranslations('Common.actions');
  const domainLabel = useDomainLabel();
  const toast = useAppToast();
  const errorMessage = useErrorMessage();
  const openCase = useOpenSupportCase(surface);

  const schema = useMemo(
    () =>
      yup.object({
        category: yup.string().trim().oneOf(OPENABLE_CATEGORIES).required(),
        subject: yup
          .string()
          .trim()
          .min(SUBJECT_MIN, t('subjectRequired'))
          .max(SUBJECT_MAX)
          .required(t('subjectRequired')),
        description: yup
          .string()
          .trim()
          .min(DESCRIPTION_MIN, t('descriptionRequired'))
          .max(DESCRIPTION_MAX)
          .required(t('descriptionRequired')),
        /* Chỉ bắt buộc với TRANH CHẤP: nó gắn vào một chuyến cụ thể và có hệ quả tiền. */
        bookingId: yup
          .string()
          .trim()
          .default('')
          .when('category', {
            is: SUPPORT_CASE_CATEGORY.DISPUTE,
            then: (s) => s.required(t('bookingRequired')),
          }),
      }),
    [t],
  );

  const { control, handleSubmit, reset } = useForm({
    resolver: yupResolver(schema),
    defaultValues: {
      category: SUPPORT_CASE_CATEGORY.OTHER,
      subject: '',
      description: '',
      bookingId: '',
    },
  });

  const category = useWatch({ control, name: 'category' });
  const isDispute = category === SUPPORT_CASE_CATEGORY.DISPUTE;

  const categoryOptions = useMemo(
    () =>
      OPENABLE_CATEGORIES.map((value) => ({
        value,
        label: domainLabel('supportCaseCategory', value),
      })),
    [domainLabel],
  );

  const close = () => {
    reset();
    onClose();
  };

  const onSubmit = handleSubmit((values) => {
    openCase.mutate(
      {
        category: values.category,
        subject: values.subject,
        description: values.description,
        bookingId: values.bookingId || null,
      },
      {
        onSuccess: (created) => {
          toast.showSuccess(t('openedSuccess'));
          reset();
          onOpened?.(created.id);
          onClose();
        },
        onError: (error) => toast.showError(errorMessage(error)),
      },
    );
  });

  return (
    <BottomSheet open={open} onClose={close} title={t('title')}>
      <YStack gap={space.md}>
        <SelectField
          control={control}
          name="category"
          label={t('category')}
          options={categoryOptions}
          required
        />
        <TextField control={control} name="subject" label={t('subject')} required />
        <TextField
          control={control}
          name="description"
          label={t('description')}
          multiline
          required
        />

        {/*
          Tranh chấp TẠM GIỮ việc chốt khoản giữ chỗ của chuyến đó cho tới khi có kết luận — người
          mở phải biết điều đó TRƯỚC khi gửi, không phải đọc được sau khi tiền đã bị giữ lại.
        */}
        {isDispute ? (
          <>
            <Callout tone="warning">{t('disputeHint')}</Callout>
            <TextField
              control={control}
              name="bookingId"
              label={t('bookingId')}
              hint={t('bookingIdHint')}
              required
            />
          </>
        ) : null}

        <YStack gap={space.sm}>
          <Button
            label={t('submit')}
            loading={openCase.isPending}
            onPress={() => void onSubmit()}
          />
          <Button
            label={tCommon('cancel')}
            variant="ghost"
            disabled={openCase.isPending}
            onPress={close}
          />
        </YStack>
      </YStack>
    </BottomSheet>
  );
}
