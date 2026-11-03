import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { DRIVER_WAGE_STAGE } from '@xeprime/types';
import { driverWageLine } from '@xeprime/domain';
import { Button } from '@/components/ui/Button';
import { useAppFormat } from '@/i18n/use-app-format';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import type { DriverWage } from '../api';

/**
 * Tiền công của một lượt gán nhìn từ BÊN THUÊ (ADR 0075) — bản native của web `DriverWageInfo`:
 * dòng số theo giai đoạn (`driverWageLine`), nút sửa khi còn hạn, và lịch sử sửa (mới nhất trước).
 * XePrime chỉ ghi nhận — chủ xe trả trực tiếp cho tài xế.
 */
export function DriverWageInfo({
  wage,
  canEdit,
  onEdit,
}: {
  wage: DriverWage;
  canEdit: boolean;
  onEdit: () => void;
}) {
  const colors = useColors();
  const t = useTranslations('Drivers.wage');
  const fmt = useAppFormat();
  const line = driverWageLine(wage);
  const editable = canEdit && wage.editable;
  if (!line && !editable) return null;

  const muted = (text: string, key?: string) => (
    <Text key={key} col={colors.textMuted} fos={fontSize.label}>
      {text}
    </Text>
  );

  return (
    <YStack gap={space.xs}>
      <XStack ai="center" gap={space.sm} flexWrap="wrap">
        {line ? (
          <Text
            col={line.kind === 'none' ? colors.textMuted : colors.text}
            fos={fontSize.bodySm}
            fow={line.kind === 'none' ? fontWeight.regular : fontWeight.semibold}
          >
            {t(`line.${line.kind}`, { amount: fmt.money(line.amount), days: wage.days ?? 0 })}
          </Text>
        ) : null}
        {editable ? (
          <Button
            label={
              wage.stage === DRIVER_WAGE_STAGE.NOT_RUN ? t('edit.actionAgreed') : t('edit.action')
            }
            variant="secondary"
            size="sm"
            icon="create-outline"
            block={false}
            onPress={onEdit}
          />
        ) : null}
      </XStack>
      {wage.changes.length > 0 ? (
        <YStack gap={2}>
          <Text col={colors.text} fos={fontSize.label} fow={fontWeight.medium}>
            {t('changes.title')}
          </Text>
          {wage.changes.map((c) => (
            <YStack key={c.id} gap={1}>
              <Text col={colors.text} fos={fontSize.label}>
                {t('changes.item', { old: fmt.money(c.oldAmount), new: fmt.money(c.newAmount) })}
              </Text>
              {muted(
                c.changedByName
                  ? t('changes.by', { name: c.changedByName, time: fmt.dateTime(c.changedAt) })
                  : t('changes.at', { time: fmt.dateTime(c.changedAt) }),
              )}
              {c.reason ? muted(t('changes.reason', { reason: c.reason })) : null}
            </YStack>
          ))}
        </YStack>
      ) : null}
    </YStack>
  );
}
