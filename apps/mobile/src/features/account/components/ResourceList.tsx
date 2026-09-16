import { Ionicons } from '@expo/vector-icons';
import { Linking, Pressable } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';
import { useTranslations } from 'use-intl';
import { ownerResourcePath, type OwnerResource } from '@xeprime/domain';
import { Card } from '@/components/ui/Card';
import { IconDisc } from '@/components/ui/IconDisc';
import { logger } from '@/lib/logger';
import { resolveWebBaseUrl } from '@/lib/web-base-url';
import { colors, fontSize, fontWeight, iconSize, sizing, space } from '@/theme/tokens';

/** Địa chỉ THẬT của một tài liệu: web phục vụ file tĩnh, app mở chính địa chỉ đó. */
export function ownerResourceUrl(resource: OwnerResource): string {
  return `${resolveWebBaseUrl()}${ownerResourcePath(resource)}`;
}

/**
 * Mở một PDF bằng trình xem của hệ điều hành.
 *
 * KHÔNG dùng WebView như `LegalDocScreen`: văn bản pháp lý là một trang HTML render được trong
 * app, còn đây là file PDF — WebView trên Android không có trình đọc PDF sẵn và chỉ hiện một
 * trang trắng. Trình xem của máy còn cho lưu và chia sẻ, đúng thứ người ta làm với một mẫu hợp
 * đồng.
 */
export function openOwnerResource(resource: OwnerResource): void {
  const url = ownerResourceUrl(resource);
  Linking.openURL(url).catch((error: unknown) => {
    // Không có trình xem PDF nào là chuyện có thật trên máy tối giản — ghi rõ ĐỊA CHỈ đã thử mở.
    logger.error(`Không mở được tài liệu chủ xe: ${url}`, { error });
  });
}

interface ResourceListProps {
  resources: readonly OwnerResource[];
  /** `card` = hàng có mô tả (cẩm nang); `compact` = một dòng tên + mũi tên (chứng từ). */
  variant?: 'card' | 'compact';
}

/**
 * Danh sách tài liệu PDF từ manifest `OWNER_RESOURCES` — dùng chung cho Cẩm nang và Hợp đồng &
 * Chứng từ, đúng như `ResourceList` bên web.
 *
 * Tên file và nhãn đều đến từ manifest `@xeprime/domain` + bó message chung, không màn nào ghép
 * đường dẫn tay. File thật do vận hành chép vào `apps/web/public/owner-resources/`; thiếu file
 * thì máy báo không mở được — vẫn tốt hơn một PDF rỗng trông như tài liệu thật.
 */
export function ResourceList({ resources, variant = 'card' }: ResourceListProps) {
  const t = useTranslations('Account.resources');

  return (
    <YStack gap={variant === 'card' ? space.sm : 0}>
      {resources.map((resource, index) => {
        const title = t(`items.${resource.key}.title`);
        const row = (
          <XStack ai="center" gap={space.sm} minHeight={sizing.touchTarget}>
            <IconDisc icon="document-text" tone={colors.danger} surface={colors.dangerSurface} />
            <YStack f={1} minWidth={0} gap={2}>
              <Text col={colors.text} fos={fontSize.body} fow={fontWeight.semibold}>
                {title}
              </Text>
              {variant === 'card' ? (
                <Text col={colors.textMuted} fos={fontSize.bodySm}>
                  {t(`items.${resource.key}.description`)}
                </Text>
              ) : null}
            </YStack>
            {/* Nhãn PDF: người dùng cần biết cú chạm này mở một FILE, không phải một màn app. */}
            <Text col={colors.placeholder} fos={fontSize.meta} fow={fontWeight.semibold}>
              {t('pdfBadge')}
            </Text>
            <Ionicons name="open-outline" size={iconSize.sm} color={colors.placeholder} />
          </XStack>
        );

        const label = t('open', { title });

        if (variant === 'card') {
          return (
            <Card
              key={resource.key}
              onPress={() => openOwnerResource(resource)}
              accessibilityLabel={label}
            >
              {row}
            </Card>
          );
        }

        return (
          <Pressable
            key={resource.key}
            onPress={() => openOwnerResource(resource)}
            accessibilityRole="link"
            accessibilityLabel={label}
            style={({ pressed }) => (pressed ? { opacity: 0.6 } : null)}
          >
            {/* Nét ngăn chỉ giữa hai dòng kề nhau — một nét dưới dòng cuối trông như còn mục bị cắt. */}
            {index > 0 ? <YStack h={1} bg={colors.borderSubtle} /> : null}
            <YStack py={space.xs}>{row}</YStack>
          </Pressable>
        );
      })}
    </YStack>
  );
}
