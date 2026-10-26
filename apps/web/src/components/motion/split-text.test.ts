import { describe, expect, it } from 'vitest';
import { splitText } from './split-text';

const chars = (text: string) => splitText(text).map((word) => word.chars.map((c) => c.char));

describe('splitText', () => {
  it('tách câu thành từ, ký tự đánh số liên tục qua các từ', () => {
    const words = splitText('Xe ổn');
    expect(words.map((w) => w.chars.map((c) => [c.char, c.index]))).toEqual([
      [
        ['X', 0],
        ['e', 1],
      ],
      [
        ['ổ', 2],
        ['n', 3],
      ],
    ]);
  });

  it('giữ dấu tiếng Việt viết tổ hợp trong CÙNG một ký tự', () => {
    // "ệ" = e + U+0323 (nặng) + U+0302 (mũ) — ba code unit, một ký tự trên màn hình.
    const decomposed = 'Việt';
    expect(chars(decomposed)).toEqual([['V', 'i', 'ệ', 't']]);
  });

  it('gộp khoảng trắng thừa, bỏ khoảng trắng đầu/cuối', () => {
    expect(chars('  Thuê   xe  ')).toEqual([
      ['T', 'h', 'u', 'ê'],
      ['x', 'e'],
    ]);
  });

  it('chuỗi rỗng không sinh từ nào', () => {
    expect(splitText('   ')).toEqual([]);
  });

  it('chặn độ trễ ở ký tự thứ 40 — tiêu đề dài không bắt chờ', () => {
    const indices = splitText('a'.repeat(60)).flatMap((w) => w.chars.map((c) => c.index));
    expect(Math.max(...indices)).toBe(40);
    expect(indices.slice(0, 41)).toEqual(Array.from({ length: 41 }, (_, i) => i));
  });
});
