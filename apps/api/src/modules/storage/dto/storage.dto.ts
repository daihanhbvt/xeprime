import { ApiProperty } from '@nestjs/swagger';
import { IMAGE_UPLOAD_MAX_BYTES, IMAGE_UPLOAD_MIME_TYPES } from '@xeprime/types';
import { Type } from 'class-transformer';
import { IsIn, IsInt, IsString, Max, MaxLength, Min } from 'class-validator';

/**
 * Xin presigned URL upload ảnh (xe / shop). MIME allow-list + trần dung lượng validate ở đây;
 * `fileSize` còn được KÝ vào presigned PUT (Content-Length) nên vượt trần là R2 từ chối,
 * không chỉ là check thiện chí.
 */
export class PresignImageDto {
  @ApiProperty({ description: 'Tên file gốc (chỉ để đặt key, đã sanitize)', example: 'xe-01.jpg' })
  @IsString()
  @MaxLength(255)
  fileName!: string;

  @ApiProperty({ enum: IMAGE_UPLOAD_MIME_TYPES })
  @IsIn(IMAGE_UPLOAD_MIME_TYPES)
  contentType!: string;

  @ApiProperty({ description: `Dung lượng file (byte), tối đa ${IMAGE_UPLOAD_MAX_BYTES}` })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(IMAGE_UPLOAD_MAX_BYTES)
  fileSize!: number;
}

/** Kết quả presign — client PUT file lên `uploadUrl`, lưu `publicUrl` vào form. */
export class UploadPresignDto {
  @ApiProperty({ description: 'Key trong bucket' }) key!: string;
  @ApiProperty({ description: 'URL để PUT file (hết hạn ngắn)' }) uploadUrl!: string;
  @ApiProperty({ description: 'URL công khai của file sau khi upload' }) publicUrl!: string;
  @ApiProperty({ description: 'Giây còn hiệu lực của uploadUrl' }) expiresIn!: number;
}
