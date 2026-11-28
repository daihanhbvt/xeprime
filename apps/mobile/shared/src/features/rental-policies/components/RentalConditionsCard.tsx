import type { ReactNode } from 'react';
import { Controller, type Control } from 'react-hook-form';
import { Text, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  RENTAL_TERMS_GROUP,
  RENTAL_TERMS_GROUP_VALUES,
  RENTAL_TERMS_MAX_LENGTH,
  type RentalTermsGroup,
} from '@xeprime/types';
import { LineIcon } from '@/components/icons/LineIcon';
import { FieldLabel, FieldShell } from '@/components/ui/Field';
import { InfoGroupCard } from '@/components/ui/InfoGroupCard';
import { RowDivider, SwitchRow } from '@/components/ui/SwitchRow';
import { TextField } from '@/components/ui/TextField';
import { useColors } from '@/theme/ThemeProvider';
import { fontWeight, radius, space, typeScale } from '@/theme/tokens';
import { useRentalConditionsText } from '../rental-conditions';

/** Điều khoản thuê của MỘT nhóm dịch vụ trên form màn Chính sách thuê (ADR 0112 điều 3). */
export interface RentalTermsFormGroup {
  termsText: string;
  requireTermsAcceptance: boolean;
}
export type RentalTermsFormValues = Record<RentalTermsGroup, RentalTermsFormGroup>;

/**
 * "Điều kiện cho thuê" - bản native của web `RentalConditionsCard`: hai nhóm Tự lái & Dài hạn · Có tài
 * xế. Giấy tờ và cách đối chiếu là LUẬT CHUẨN của nền tảng (`PLATFORM_RENTAL_CONDITIONS`) - chỉ hiện.
 * Điều khoản + công tắc "khách xác nhận trước khi gửi yêu cầu" là của gian hàng, áp cho mọi xe.
 *
 * `control` vắng ⇒ chỉ hiện luật chuẩn (màn của một xe: điều khoản sửa ở trang Chính sách thuê).
 */
export function RentalConditionsCard({
  control,
  disabled = true,
  onOpenContracts,
  footer,
}: {
  control?: Control<{ terms: RentalTermsFormValues }>;
  disabled?: boolean;
  onOpenContracts?: () => void;
  footer?: ReactNode;
}) {
  const t = useTranslations('Shop.policies.workspace.conditions');
  return (
    <InfoGroupCard title={t('title')}>
      {RENTAL_TERMS_GROUP_VALUES.map((group) => (
        <TermsGroup
          key={group}
          group={group}
          disabled={disabled}
          {...(control ? { control } : {})}
          {...(onOpenContracts ? { onOpenContracts } : {})}
        />
      ))}
      {footer}
    </InfoGroupCard>
  );
}

/**
 * Ô "chọn" KHOÁ (Figma `24789:85455` vẽ ô chọn): giấy tờ và cách đối chiếu là luật chuẩn nền tảng
 * (ADR 0112 điều 3) - chỉ hiện, không chọn được (người dùng chốt 27/11/2026). Câu giải thích vào ⓘ.
 */
function LockedSelect({ label, value, hint }: { label: string; value: string; hint?: string }) {
  const colors = useColors();
  return (
    <YStack gap={6}>
      <FieldLabel label={label} {...(hint ? { hint } : {})} />
      <FieldShell disabled>
        <Text f={1} py={space.sm} col={colors.placeholder} fos={typeScale.body.fontSize} numberOfLines={2}>
          {value}
        </Text>
        <LineIcon name="chevron-down-md" size={20} color={colors.placeholder} />
      </FieldShell>
    </YStack>
  );
}

function TermsGroup({
  group,
  control,
  disabled,
  onOpenContracts,
}: {
  group: RentalTermsGroup;
  control?: Control<{ terms: RentalTermsFormValues }>;
  disabled: boolean;
  onOpenContracts?: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Shop.policies.workspace.conditions');
  const rules = useRentalConditionsText();
  const withDriver = group === RENTAL_TERMS_GROUP.WITH_DRIVER;
  /* Figma: mỗi nhóm một khung viền `stroke/gray-low200` bo 12, đệm 12. */
  return (
    <YStack gap={GROUP_GAP} p={GROUP_GAP} br={radius.control} bw={1} bc={colors.border}>
      <Text
        col={colors.text}
        fos={typeScale.body.fontSize}
        lh={typeScale.body.lineHeight}
        fow={fontWeight.semibold}
      >
        {t(`groups.${group}`)}
      </Text>
      <LockedSelect label={t('documents')} value={rules.documents} hint={t('platformNote')} />
      <LockedSelect label={t('verify')} value={rules.verify} />
      {control ? (
        <>
          <Controller
            control={control}
            name={`terms.${group}.requireTermsAcceptance`}
            render={({ field }) => (
              <SwitchRow
                title={withDriver ? t('acceptTitleWithDriver') : t('acceptTitle')}
                description={
                  <>
                    {withDriver ? t('acceptHintWithDriver') : t('acceptHint')}
                    {withDriver ? ' ' : null}
                    {withDriver
                      ? t.rich('contractTemplate', {
                          link: (chunks) =>
                            onOpenContracts ? (
                              <Text
                                col={colors.brandLink}
                                fos={typeScale.label.fontSize}
                                lh={typeScale.label.lineHeight}
                                textDecorationLine="underline"
                                onPress={onOpenContracts}
                              >
                                {chunks}
                              </Text>
                            ) : (
                              chunks
                            ),
                        })
                      : null}
                  </>
                }
                value={field.value === true}
                disabled={disabled}
                onChange={(next) => field.onChange(next)}
              />
            )}
          />
          <RowDivider />
          <TextField
            control={control}
            name={`terms.${group}.termsText`}
            label={withDriver ? t('termsTitleWithDriver') : t('termsTitle')}
            hint={withDriver ? t('termsHintWithDriver') : t('termsHint')}
            placeholder={t('termsPlaceholder', { max: RENTAL_TERMS_MAX_LENGTH })}
            maxLength={RENTAL_TERMS_MAX_LENGTH}
            multiline
            rows={4}
            editable={!disabled}
          />
        </>
      ) : null}
    </YStack>
  );
}

/** Figma "Nhóm" trong thẻ Điều kiện: đệm + khoảng cách 12. */
const GROUP_GAP = 12;
