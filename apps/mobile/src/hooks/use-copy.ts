import * as Clipboard from 'expo-clipboard';
import { useCallback } from 'react';
import { useTranslations } from 'use-intl';
import { useAppToast } from '@/components/feedback/use-app-toast';

/**
 * Chép một giá trị vào clipboard và BÁO là đã chép — bản native của `<CopyButton>` bên web.
 *
 * Phần báo là nửa quan trọng hơn: trên native không có gì nhìn thấy được xảy ra khi chép, nên
 * thiếu toast thì người dùng bấm hai ba lần rồi vẫn không chắc mình đã chép được chưa. Câu báo
 * dùng chung (`Common.actions.copied`) để mọi chỗ chép trong app nói đúng một câu.
 */
export function useCopy(): (value: string) => Promise<void> {
  const t = useTranslations('Common.actions');
  const toast = useAppToast();

  return useCallback(
    async (value: string) => {
      await Clipboard.setStringAsync(value);
      toast.showSuccess(t('copied'));
    },
    [t, toast],
  );
}
