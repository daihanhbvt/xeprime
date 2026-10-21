import { Ionicons } from '@expo/vector-icons';
import { Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ownerResourcesOfKind } from '@xeprime/domain';
import { ShellPageHeader, type PageShell } from '@/features/shell/ShellPageHeader';
import { Screen } from '@/components/layout/Screen';
import { BlockTitle } from '@/components/ui/BlockTitle';
import { Card } from '@/components/ui/Card';
import { ROUTES } from '@/navigation/routes';
import { useColors } from '@/theme/ThemeProvider';
import { fontSize, fontWeight, iconSize, radius, sizing, space } from '@/theme/tokens';
import { ResourceList, openOwnerResource } from './components/ResourceList';

/**
 * Hợp đồng & Chứng từ — THƯ VIỆN BIỂU MẪU (PDF từ manifest), không phải danh sách hợp đồng phát
 * sinh theo đơn thuê (thứ đó ở `manage/contracts`). Bản native của `ContractsDocumentsView`.
 *
 * Nội dung tĩnh, không gọi API nào. Hai khối theo đúng web — nút hợp đồng mẫu và danh sách chứng
 * từ quyết toán — rồi một ghi chú nói rõ đây là biểu mẫu CHUNG.
 */
export function ContractsDocumentsScreen({
  shell = 'account',
}: {
  /**
   * `manage` = mục menu Owner Lite của app XePrime Partner (trong bộ tab, nút mở menu) — ADR 0053.
   * `account` = màn chen ngang có nút lui.
   */
  shell?: PageShell;
} = {}) {
  const colors = useColors();
  const t = useTranslations('Account.contracts');
  const tResources = useTranslations('Account.resources');

  return (
    <>
      <ShellPageHeader
        shell={shell}
        backTo={ROUTES.account.home()}
        title={t('title')}
        subtitle={t('subtitle')}
      />
      <Screen edges={['left', 'right', 'bottom']}>
        <YStack gap={space.lg}>
          <YStack gap={space.sm}>
            <BlockTitle>{t('templatesHeading')}</BlockTitle>
            <Text col={colors.textMuted} fos={fontSize.bodySm}>
              {t('templatesBody')}
            </Text>
            {/*
              Hợp đồng mẫu là hai NÚT ngang hàng bên web. Trên điện thoại chúng xếp dọc: hai nút
              chữ dài cạnh nhau ở 360dp thì mỗi nút chỉ còn ~160dp và tên biểu mẫu bị cắt đúng
              phần phân biệt chúng ("Hợp đồng cho…" / "Biên bản bàn…").
            */}
            <YStack gap={space.sm}>
              {ownerResourcesOfKind('contract').map((resource) => {
                const title = tResources(`items.${resource.key}.title` as never);
                return (
                  <Pressable
                    key={resource.key}
                    onPress={() => openOwnerResource(resource)}
                    accessibilityRole="link"
                    accessibilityLabel={tResources('open', { title })}
                    style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
                  >
                    <XStack
                      ai="center"
                      gap={space.sm}
                      minHeight={sizing.touchTarget}
                      px={space.md}
                      br={radius.md}
                      bw={1}
                      bc={colors.primary}
                      bg={colors.primary}
                    >
                      <Ionicons name="document-text" size={iconSize.sm} color={colors.danger} />
                      <Text
                        f={1}
                        col={colors.onPrimary}
                        fos={fontSize.bodySm}
                        fow={fontWeight.semibold}
                      >
                        {title}
                      </Text>
                      <Ionicons
                        name="open-outline"
                        size={iconSize.sm}
                        color={colors.onPrimary}
                      />
                    </XStack>
                  </Pressable>
                );
              })}
            </YStack>
          </YStack>

          <YStack gap={space.sm}>
            <BlockTitle>{t('documentsHeading')}</BlockTitle>
            <Card>
              <ResourceList resources={ownerResourcesOfKind('document')} variant="compact" />
            </Card>
          </YStack>

          <Text col={colors.placeholder} fos={fontSize.label}>
            {t('note')}
          </Text>
        </YStack>
      </Screen>
    </>
  );
}
