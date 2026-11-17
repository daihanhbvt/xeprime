import { Text, YStack } from 'tamagui';
import { fontWeight } from '@/theme/tokens';

/**
 * Văn bản giới thiệu CÓ ĐỊNH DẠNG - bản native của `RichText` web.
 *
 * `html` là chuỗi ĐÃ LỌC Ở SERVER (`sanitizeShopBioHtml`: chỉ `p` · `br` · `strong` · `em` · `u`
 * và `text-align` trên `p`), nên ở đây chỉ cần dịch đúng tập thẻ đó sang `<Text>` lồng nhau - mọi
 * thẻ khác (không thể có) bị bỏ qua, chữ vẫn giữ. Không có HTML thì rơi về `text` thuần.
 */

type Align = 'left' | 'center' | 'right' | 'justify';

interface Run {
  text: string;
  bold: boolean;
  italic: boolean;
  underline: boolean;
}

interface Paragraph {
  align: Align;
  runs: Run[];
}

const ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
};

function decodeEntities(value: string): string {
  return value.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code: string) => {
    if (code[0] === '#') {
      const n = code[1]?.toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
      // Ngoài dải Unicode (> 0x10FFFF) thì `fromCodePoint` ném RangeError — giữ nguyên chuỗi gốc.
      return Number.isFinite(n) && n >= 0 && n <= 0x10ffff ? String.fromCodePoint(n) : match;
    }
    return ENTITIES[code.toLowerCase()] ?? match;
  });
}

function alignOf(attrs: string): Align {
  const m = /text-align\s*:\s*(left|center|right|justify)/i.exec(attrs);
  return (m?.[1]?.toLowerCase() as Align | undefined) ?? 'left';
}

/** Tách HTML đã lọc thành đoạn + các khúc chữ mang cờ định dạng. Thuần, test được. */
export function parseRichText(html: string): Paragraph[] {
  const paragraphs: Paragraph[] = [];
  let current: Paragraph | null = null;
  const state = { bold: 0, italic: 0, underline: 0 };
  const ensure = (): Paragraph => {
    if (!current) {
      current = { align: 'left', runs: [] };
      paragraphs.push(current);
    }
    return current;
  };
  const push = (text: string) => {
    if (!text) return;
    ensure().runs.push({
      text,
      bold: state.bold > 0,
      italic: state.italic > 0,
      underline: state.underline > 0,
    });
  };

  const re = /<(\/?)([a-z0-9]+)([^>]*)>|([^<]+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    if (m[4] !== undefined) {
      push(decodeEntities(m[4]));
      continue;
    }
    const closing = m[1] === '/';
    const tag = (m[2] ?? '').toLowerCase();
    const attrs = m[3] ?? '';
    if (tag === 'p') {
      current = closing ? null : { align: alignOf(attrs), runs: [] };
      if (current) paragraphs.push(current);
    } else if (tag === 'br') {
      push('\n');
    } else if (tag === 'strong' || tag === 'b') {
      state.bold += closing ? -1 : 1;
    } else if (tag === 'em' || tag === 'i') {
      state.italic += closing ? -1 : 1;
    } else if (tag === 'u') {
      state.underline += closing ? -1 : 1;
    }
    state.bold = Math.max(0, state.bold);
    state.italic = Math.max(0, state.italic);
    state.underline = Math.max(0, state.underline);
  }
  return paragraphs;
}

export function RichText({
  html,
  text,
  color,
  fontSize,
  gap,
}: {
  html?: string | null;
  text?: string | null;
  color: string;
  fontSize: number;
  gap: number;
}) {
  const paragraphs = html ? parseRichText(html) : [];
  if (paragraphs.length > 0) {
    return (
      <YStack gap={gap}>
        {paragraphs.map((p, i) =>
          p.runs.length === 0 ? (
            // Đoạn rỗng của editor (`<p><br></p>` đã gọn) = một dòng trống.
            <Text key={i} col={color} fos={fontSize}>
              {' '}
            </Text>
          ) : (
            <Text key={i} col={color} fos={fontSize} textAlign={p.align}>
              {p.runs.map((run, j) => (
                <Text
                  key={j}
                  fow={run.bold ? fontWeight.bold : undefined}
                  fontStyle={run.italic ? 'italic' : undefined}
                  textDecorationLine={run.underline ? 'underline' : undefined}
                >
                  {run.text}
                </Text>
              ))}
            </Text>
          ),
        )}
      </YStack>
    );
  }
  if (!text) return null;
  return (
    <Text col={color} fos={fontSize}>
      {text}
    </Text>
  );
}
