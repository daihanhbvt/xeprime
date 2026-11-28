import { useMemo, useState } from 'react';
import { useFieldArray, useWatch, type Control } from 'react-hook-form';
import { AddLink, EditableSummaryRow } from '@/components/ui/EditableSummaryRow';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import {
  BOOKING_COLLATERAL_DESCRIPTION_MAX,
  BOOKING_COLLATERAL_MAX_ITEMS,
  BOOKING_COLLATERAL_TYPE,
  BOOKING_COLLATERAL_TYPE_VALUES,
  type BookingCollateralType,
} from '@xeprime/types';
import { Card } from '@/components/ui/Card';
import { InfoHint } from '@/components/ui/InfoHint';
import { MoneyField } from '@/components/ui/MoneyField';
import { SelectControl } from '@/components/ui/SelectControl';
import { TextControl } from '@/components/ui/TextControl';
import { useDomainLabel } from '@/i18n/domain';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, space } from '@/theme/tokens';
import type { StaffBookingValues } from '../staff-booking-schema';

/**
 * Thẻ "Cọc & thế chấp" của luồng ĐẶT HỘ (ADR 0109) — native port of web `StaffBookingCollateralCard`
 * (26/11/2026): một ô tiền cọc và một danh sách tài sản (CCCD, bằng lái, xe máy kèm biển số…). Nhập
 * khoản nào thì đơn ghi khoản đó - tiền cọc để 0 và danh sách trống nghĩa là không cọc. Không có ô
 * chọn "hình thức": server suy chế độ từ dữ liệu.
 */
/** `editing` khi đang THÊM mới (không trỏ vào dòng nào). */
const NEW_ROW = -1;

export function StaffBookingCollateralCard({ control }: { control: Control<StaffBookingValues> }) {
  const colors = useColors();
  const t = useTranslations('BookingRequests.staffFlow.review.collateral');
  const domainLabel = useDomainLabel();
  const items = useFieldArray({ control, name: 'collaterals' });
  const rows = useWatch({ control, name: 'collaterals' });
  const canAdd = items.fields.length < BOOKING_COLLATERAL_MAX_ITEMS;
  const tActions = useTranslations('Common.actions');
  const tFlow = useTranslations('BookingRequests.staffFlow');
  /*
   * Popup nhập NHÁP (người dùng 28/11/2026): "+ Thêm tài sản" hay bút sửa chỉ mở popup; bấm
   * "Xác nhận" mới thêm/sửa vào đơn, "Huỷ" / đóng thì không đổi gì. `editing` = vị trí đang sửa,
   * `NEW_ROW` = đang thêm mới.
   */
  const [editing, setEditing] = useState<number | null>(null);
  const [draftType, setDraftType] = useState<BookingCollateralType>(BOOKING_COLLATERAL_TYPE.CITIZEN_ID);
  const [draftDesc, setDraftDesc] = useState('');
  const [draftError, setDraftError] = useState<string | null>(null);
  const openDraft = (index: number) => {
    const row = index === NEW_ROW ? null : rows?.[index];
    setDraftType((row?.collateralType as BookingCollateralType) ?? BOOKING_COLLATERAL_TYPE.CITIZEN_ID);
    setDraftDesc(row?.description ?? '');
    setDraftError(null);
    setEditing(index);
  };
  const confirmDraft = () => {
    const description = draftDesc.trim();
    // Mô tả luôn bắt buộc (mọi loại); loại đã có sẵn giá trị nên không đánh dấu bắt buộc.
    if (!description) {
      setDraftError(tFlow('validation.collateralDescriptionRequired'));
      return;
    }
    const value = { collateralType: draftType, description };
    if (editing === NEW_ROW) items.append(value);
    else if (editing != null) items.update(editing, value);
    setEditing(null);
  };

  const typeOptions = useMemo(
    () =>
      BOOKING_COLLATERAL_TYPE_VALUES.map((value) => ({
        value,
        label: domainLabel('bookingCollateralType', value),
      })),
    [domainLabel],
  );

  return (
    <Card>
      <YStack gap={space.md}>
        <XStack ai="center" gap={4}>
          <Text col={colors.text} fos={fontSize.bodyLg} fow={fontWeight.semibold} accessibilityRole="header">
            {t('title')}
          </Text>
          <InfoHint label={t('title')} content={t('lead')} size={fontSize.bodyLg} />
        </XStack>

        <MoneyField control={control} name="depositAmount" label={t('cash')} hint={t('cashHint')} hintInLabel />

        <YStack gap={12}>
          <XStack ai="center" gap={4}>
            <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
              {t('assetsTitle')}
            </Text>
            <InfoHint label={t('assetsTitle')} content={t('assetsHint')} />
          </XStack>
          {items.fields.length === 0 ? null : (
            /* Dòng tóm tắt "Loại / Mô tả" + xoá/sửa; sửa trong POPUP (như chính sách gian hàng). */
            items.fields.map((field, index) => {
              const row = rows?.[index];
              return (
                <EditableSummaryRow
                  key={field.id}
                  lines={[
                    {
                      label: `${t('type')}:`,
                      value: row?.collateralType ? domainLabel('bookingCollateralType', row.collateralType) : '-',
                    },
                    { label: `${t('description')}:`, value: row?.description?.trim() || '-' },
                  ]}
                  removeLabel={t('remove')}
                  editLabel={t('type')}
                  disabled={false}
                  onRemove={() => items.remove(index)}
                  onEdit={() => openDraft(index)}
                />
              );
            })
          )}
          {canAdd ? (
            <AddLink
              label={t('add')}
              onPress={() => openDraft(NEW_ROW)}
            />
          ) : null}
        </YStack>
        <BottomSheet
          open={editing != null}
          onClose={() => setEditing(null)}
          title={t('assetsTitle')}
          footer={
            <XStack gap={8}>
              <YStack f={1}>
                <Button label={tActions('cancel')} variant="secondary" onPress={() => setEditing(null)} />
              </YStack>
              <YStack f={1}>
                <Button label={tActions('confirm')} variant="gradient" onPress={confirmDraft} />
              </YStack>
            </XStack>
          }
        >
          {editing == null ? null : (
            <YStack gap={12}>
              <SelectControl
                label={t('type')}
                value={draftType}
                options={typeOptions}
                onChange={(next) => {
                  setDraftType(next as BookingCollateralType);
                  setDraftError(null);
                }}
              />
              <TextControl
                label={t('description')}
                value={draftDesc}
                onChangeText={(next) => {
                  setDraftDesc(next);
                  if (draftError) setDraftError(null);
                }}
                maxLength={BOOKING_COLLATERAL_DESCRIPTION_MAX}
                placeholder={
                  draftType === BOOKING_COLLATERAL_TYPE.MOTORBIKE
                    ? t('descriptionMotorbike')
                    : draftType === BOOKING_COLLATERAL_TYPE.OTHER
                      ? t('descriptionOther')
                      : t('descriptionPlaceholder')
                }
                required
                {...(draftError ? { error: draftError } : {})}
              />
            </YStack>
          )}
        </BottomSheet>
      </YStack>
    </Card>
  );
}
