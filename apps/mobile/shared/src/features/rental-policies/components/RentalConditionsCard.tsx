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
import { Divider } from '@/components/ui/DataRow';
import { InfoCard } from '@/components/ui/InfoCard';
import { TextField } from '@/components/ui/TextField';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, radius, space } from '@/theme/tokens';
import { useRentalConditionsText } from '../rental-conditions';
import { ToggleRow } from './PolicySections';

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
    <InfoCard title={t('title')}>
      <YStack gap={space.lg}>
        {RENTAL_TERMS_GROUP_VALUES.map((group, index) => (
          <YStack key={group} gap={space.md}>
            {index > 0 ? <Divider /> : null}
            <TermsGroup
              group={group}
              disabled={disabled}
              {...(control ? { control } : {})}
              {...(onOpenContracts ? { onOpenContracts } : {})}
            />
          </YStack>
        ))}
        {footer}
      </YStack>
    </InfoCard>
  );
}

function ReadonlyField({ label, value }: { label: string; value: string }) {
  const colors = useColors();
  return (
    <YStack gap={2} p={space.sm} br={radius.md} bg={colors.surfaceMuted} bw={1} bc={colors.borderSubtle}>
      <Text col={colors.textMuted} fos={fontSize.label}>
        {label}
      </Text>
      <Text col={colors.text} fos={fontSize.bodySm} fow={fontWeight.semibold}>
        {value}
      </Text>
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
  return (
    <YStack gap={space.sm}>
      <Text col={colors.text} fos={fontSize.body} fow={fontWeight.bold}>
        {t(`groups.${group}`)}
      </Text>
      <ReadonlyField label={t('documents')} value={rules.documents} />
      <ReadonlyField label={t('verify')} value={rules.verify} />
      <Text col={colors.textMuted} fos={fontSize.label}>
        {t('platformNote')}
      </Text>
      {control ? (
        <>
          <Controller
            control={control}
            name={`terms.${group}.requireTermsAcceptance`}
            render={({ field }) => (
              <ToggleRow
                label={withDriver ? t('acceptTitleWithDriver') : t('acceptTitle')}
                hint={
                  <>
                    {withDriver ? t('acceptHintWithDriver') : t('acceptHint')}
                    {withDriver ? ' ' : null}
                    {withDriver
                      ? t.rich('contractTemplate', {
                          link: (chunks) =>
                            onOpenContracts ? (
                              <Text
                                col={colors.brandLink}
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
                checked={field.value === true}
                disabled={disabled}
                onToggle={() => field.onChange(!field.value)}
              />
            )}
          />
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
