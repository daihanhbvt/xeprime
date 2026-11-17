import type { AbstractNode, IconDefinition } from '@ant-design/icons-svg/lib/types';
import { SvgXml } from 'react-native-svg';

/**
 * Icon AntD trên native - CÙNG glyph với `@ant-design/icons` của web (đồng bộ icon 10/11/2026).
 *
 * `@ant-design/icons-svg` chỉ là DỮ LIỆU SVG (không React, không DOM) - đúng nguồn mà
 * `@ant-design/icons` của web vẽ ra, nên app và web chung từng nét. Import TỪNG icon theo đường dẫn
 * `@ant-design/icons-svg/es/asn/<Tên>` để bundle chỉ mang icon đang dùng:
 *
 * ```tsx
 * import CarOutlined from '@ant-design/icons-svg/es/asn/CarOutlined';
 * <AntIcon icon={CarOutlined} color={colors.textMuted} size={iconSize.md} />
 * ```
 *
 * Màu đi qua `currentColor` (web: `color` của chỗ đặt), nên icon theo token và giao diện tối.
 * Bộ two-tone không dùng (web cũng không).
 */
const cache = new WeakMap<IconDefinition, string>();

function escapeAttr(value: string): string {
  return value.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
}

function renderNode(node: AbstractNode, root: boolean): string {
  const attrs: Record<string, string> = { ...(node.attrs as Record<string, string>) };
  if (root) {
    // Web tô bằng CSS `fill: currentColor` ở thẻ <svg>; native phải ghi thẳng vào XML.
    attrs.fill = 'currentColor';
    delete attrs.focusable;
  }
  const attrText = Object.entries(attrs)
    .map(([key, value]) => ` ${key}="${escapeAttr(String(value))}"`)
    .join('');
  const children = (node.children ?? []).map((child) => renderNode(child, false)).join('');
  return `<${node.tag}${attrText}>${children}</${node.tag}>`;
}

function toXml(definition: IconDefinition): string {
  const hit = cache.get(definition);
  if (hit) return hit;
  // Bộ outlined/filled luôn có `icon` là node (chỉ two-tone mới là hàm nhận màu).
  const node = definition.icon as AbstractNode;
  const xml = renderNode(node, true);
  cache.set(definition, xml);
  return xml;
}

export type AntIconDefinition = IconDefinition;

export function AntIcon({
  icon,
  color,
  size,
}: {
  icon: IconDefinition;
  color: string;
  /** Cỡ khung vuông (AntD vẽ trên viewBox 1024 nên co giãn đều). */
  size: number;
}) {
  return <SvgXml xml={toXml(icon)} width={size} height={size} color={color} />;
}
