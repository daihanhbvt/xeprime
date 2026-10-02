import { useMemo, useState } from 'react';
import { yupResolver } from '@hookform/resolvers/yup';
import { useForm } from 'react-hook-form';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import * as yup from 'yup';
import {
  CANCELLATION_REASON_CATEGORY_VALUES,
  cancellationReasonNeedsText,
  type CancellationReasonCategory,
} from '@xeprime/types';
import { REASON_MAX } from '@/lib/reason';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { InfoHint } from '@/components/ui/InfoHint';
import { TextField } from '@/components/ui/TextField';
import { useDomainLabel } from '@/i18n/domain';
import { colors, fontSize, fontWeight, radius, space } from '@/theme/tokens';
import type { BookingRequestDecisionTarget } from '../api';

type CancelValues = { reason: string };

/**
 * HUỶ một chuyến ĐÃ NHẬN — bản native, cùng luật với hộp thoại web (ADR 0045 điều 1).
 *
 * Khác "Từ chối" về bản chất chứ không chỉ về nhãn: từ chối là trả lời "không" cho một câu hỏi
 * còn treo, huỷ là rút lại một lời đã hứa trong lúc khách đang đếm ngược để chuyển tiền. Nên ở
 * đây có ba thứ tấm "Từ chối" không có:
 *
 *  1. **Bốn hệ quả nói thẳng, KHÔNG nằm sau dấu "i"** — xe quay lại chợ, khách được báo, tiền
 *     đã chuyển được hoàn. Đó là thứ người bấm cần biết trước khi bấm. Chỉ ảnh hưởng tới chỉ số
 *     uy tín mới nằm sau dấu "i", vì nó là phần giải thích chứ không phải hệ quả tức thì.
 *  2. **Nhóm lý do BẮT BUỘC** — ô văn xuôi không thống kê được, và nhóm lý do là khoá mà chỉ số
 *     uy tín lọc theo.
 *  3. **Không có nhóm "bất khả kháng"** — trách nhiệm do server suy từ người thao tác, không do
 *     người huỷ tự khai (cho tự chọn là xoá luôn ý nghĩa của chỉ số).
 *
 * Nhóm lý do là CHIP CHỌN MỘT, không phải chip bấm-rồi-sửa như tấm "Từ chối": ở đó chip chỉ là
 * gợi ý để gõ nhanh vào ô chữ, còn ở đây lựa chọn ĐI THẲNG vào dữ liệu.
 */
export function CancelRequestSheet({
  open,
  onClose,
  request,
  onConfirm,
  loading,
}: {
  open: boolean;
  onClose: () => void;
  request: BookingRequestDecisionTarget;
  onConfirm: (input: { reasonCategory: CancellationReasonCategory; reason?: string }) => void;
  loading: boolean;
}) {
  const t = useTranslations('BookingRequests.cancel');
  const domainLabel = useDomainLabel();

  const [category, setCategory] = useState<CancellationReasonCategory | null>(null);
  const [categoryTouched, setCategoryTouched] = useState(false);
  const needsText = category !== null && cancellationReasonNeedsText(category);

  /*
   * Ô chữ chỉ bắt buộc khi chọn "Lý do khác" — mọi nhóm khác đã tự nói đủ cho khách hiểu. Schema
   * dựng lại theo `needsText` để câu lỗi xuất hiện đúng lúc, không phải lúc nào cũng đỏ.
   */
  const schema = useMemo(
    () =>
      yup.object({
        reason: needsText
          ? yup.string().trim().required(t('reasonRequired')).max(REASON_MAX).default('')
          : yup.string().trim().max(REASON_MAX).default(''),
      }),
    [t, needsText],
  );

  const { control, handleSubmit } = useForm<CancelValues>({
    resolver: yupResolver(schema),
    defaultValues: { reason: '' },
  });

  const submit = handleSubmit((values) => {
    setCategoryTouched(true);
    if (category === null) return;
    onConfirm({ reasonCategory: category, reason: values.reason.trim() || undefined });
  });

  return (
    <BottomSheet
      open={open}
      onClose={onClose}
      title={t('title')}
      subtitle={t('context', { customer: request.customerName, vehicle: request.vehicleName })}
      footer={
        <Button
          label={t('confirm')}
          icon="close-circle-outline"
          variant="danger"
          loading={loading}
          onPress={() => void submit()}
        />
      }
    >
      {/*
        Hệ quả là chữ chính trên nền cảnh báo, không phải tooltip. Người chạm nút đỏ này cần biết
        tiền đi đâu trước khi chạm — giấu điều đó sau dấu "i" là giấu đúng thứ không được giấu.
      */}
      <YStack gap={space.xs} p={space.md} br={radius.md} bg={colors.warningSurface}>
        <Text col={colors.text} fos={fontSize.bodySm}>
          {t('effects.vehicle')}
        </Text>
        <Text col={colors.text} fos={fontSize.bodySm}>
          {t('effects.customer')}
        </Text>
        <Text col={colors.text} fos={fontSize.bodySm}>
          {t('effects.money')}
        </Text>
        <XStack ai="center" gap={4}>
          <Text col={colors.text} fos={fontSize.bodySm} flexShrink={1}>
            {t('effects.metrics')}
          </Text>
          <InfoHint label={t('effects.metricsHintLabel')} content={t('effects.metricsHint')} />
        </XStack>
      </YStack>

      <YStack gap={space.sm} p={space.md} br={radius.md} bg={colors.surfaceMuted}>
        <Text col={colors.textMuted} fos={fontSize.bodySm} fow={fontWeight.medium}>
          {t('categoryLabel')}
        </Text>
        <XStack gap={space.xs} flexWrap="wrap">
          {CANCELLATION_REASON_CATEGORY_VALUES.map((value) => (
            <Chip
              key={value}
              label={domainLabel('cancellationReasonCategory', value)}
              size="sm"
              selected={category === value}
              onPress={() => {
                setCategory(value);
                setCategoryTouched(true);
              }}
            />
          ))}
        </XStack>
        {categoryTouched && category === null ? (
          <Text col={colors.danger} fos={fontSize.label}>
            {t('categoryRequired')}
          </Text>
        ) : null}
      </YStack>

      <TextField
        control={control}
        name="reason"
        label={needsText ? t('reasonLabelRequired') : t('reasonLabel')}
        placeholder={t('reasonPlaceholder')}
        hint={t('reasonHint')}
        multiline
        rows={4}
        maxLength={REASON_MAX}
        required={needsText}
      />
    </BottomSheet>
  );
}
