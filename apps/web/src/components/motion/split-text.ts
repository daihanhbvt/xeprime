/** Một từ của câu đã tách — mỗi ký tự mang vị trí của nó trong CẢ câu (để so le liên tục qua các từ). */
export interface SplitWord {
  chars: { char: string; index: number }[];
}

/** Câu dài hơn mức này thì các ký tự cuối đứng chung một độ trễ — tiêu đề không phải chờ quá 0.8s. */
const MAX_STAGGER_INDEX = 40;

const graphemeSegmenter =
  typeof Intl !== 'undefined' && 'Segmenter' in Intl
    ? new Intl.Segmenter(undefined, { granularity: 'grapheme' })
    : null;

/**
 * Tách theo CỤM CHỮ (grapheme), không theo code unit: "ệ" viết tổ hợp (e + dấu nặng + dấu mũ) vẫn
 * là MỘT ký tự trên màn hình — tách theo code unit sẽ rơi dấu ra một ô riêng.
 */
function graphemes(word: string): string[] {
  if (!graphemeSegmenter) return Array.from(word);
  return Array.from(graphemeSegmenter.segment(word), (part) => part.segment);
}

/** Tách câu thành từ → ký tự cho `SplitText`. Khoảng trắng liên tiếp/đầu/cuối bị gộp hoặc bỏ. */
export function splitText(text: string): SplitWord[] {
  let index = 0;
  return text
    .split(/\s+/)
    .filter(Boolean)
    .map((word) => ({
      chars: graphemes(word).map((char) => ({
        char,
        index: Math.min(index++, MAX_STAGGER_INDEX),
      })),
    }));
}
