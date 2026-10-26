import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { LISTING_MIN_RATING_VALUES } from '@xeprime/types';
import {
  ListingFacetsQueryDto,
  PublicListingQueryDto,
} from '../src/modules/public-listings/dto/public-listing.dto';

/**
 * Hai bộ lọc chợ `instantBook` và `minRating` ở tầng validate DTO — không cần DB. Query string
 * đến dưới dạng CHUỖI, nên thứ cần khoá là phép chuyển kiểu: `instantBook=1` thành `true`,
 * `minRating=4.5` thành số 4.5, và một mức ngoài danh sách đóng bị chặn chứ không thành một phép
 * lọc lạ (cũng không phình khoá cache facet). Facets dùng chung bộ filter nên kiểm cả hai DTO.
 */
const DTOS = [PublicListingQueryDto, ListingFacetsQueryDto] as const;

function parse<T extends object>(cls: new () => T, raw: Record<string, string>) {
  const dto = plainToInstance(cls, raw);
  return { dto, errors: validateSync(dto).map((error) => error.property) };
}

describe.each(DTOS)('%p — instantBook / minRating', (cls) => {
  it('instantBook nhận 1/true như các toggle tiện ích khác', () => {
    for (const raw of ['1', 'true']) {
      const { dto, errors } = parse(cls, { instantBook: raw });
      expect(errors).toEqual([]);
      expect((dto as PublicListingQueryDto).instantBook).toBe(true);
    }
    expect(parse(cls, { instantBook: 'yes' }).errors).toContain('instantBook');
  });

  it('minRating nhận đúng các mức của LISTING_MIN_RATING_VALUES, ở dạng số', () => {
    for (const value of LISTING_MIN_RATING_VALUES) {
      const { dto, errors } = parse(cls, { minRating: String(value) });
      expect(errors).toEqual([]);
      expect((dto as PublicListingQueryDto).minRating).toBe(value);
    }
  });

  it('minRating ngoài danh sách đóng bị chặn', () => {
    for (const raw of ['4.2', '5', '0', 'abc']) {
      expect(parse(cls, { minRating: raw }).errors).toContain('minRating');
    }
  });
});
