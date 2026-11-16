import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  StreamableFile,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBody,
  ApiConsumes,
  ApiCreatedResponse,
  ApiNoContentResponse,
  ApiOkResponse,
  ApiOperation,
  ApiProduces,
  ApiTags,
} from '@nestjs/swagger';
import { ACCOUNT_REALM, PERMISSION, VEHICLE_DATA_IMPORT_LIMITS } from '@xeprime/types';
import { CurrentUser, PlatformOnly, Realms, RequirePermissions } from '../../common/decorators';
import type { AuthenticatedUser } from '../../common/types/request-context';
import {
  ApproveVehicleDataDto,
  MergeVehicleDataDto,
  RejectVehicleDataDto,
  SaveVehicleDataDto,
  UpdateVehicleDataDto,
  VehicleDataDetailDto,
  VehicleDataImportDto,
  VehicleDataImportListQueryDto,
  VehicleDataImportPageDto,
  VehicleDataImportRowPageDto,
  VehicleDataImportRowsQueryDto,
  VehicleDataImportUploadDto,
  VehicleDataListQueryDto,
  VehicleDataPageDto,
  VehicleDataReviewResultDto,
} from './dto/vehicle-data.dto';
import { VehicleDataImportService } from './vehicle-data-import.service';
import { VehicleDataQueryService } from './vehicle-data-query.service';
import { VehicleDataService } from './vehicle-data.service';

const XLSX_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

function xlsx(file: { file: Buffer; fileName: string }): StreamableFile {
  return new StreamableFile(file.file, {
    type: XLSX_TYPE,
    length: file.file.length,
    disposition: `attachment; filename="${file.fileName}"`,
  });
}

/**
 * Màn "Dữ liệu xe" của quản trị (ADR 0090): mỗi dòng là một xe chuẩn — thông số, tiện ích, giá bán,
 * giá thuê tham khảo; dữ liệu tự ghi nhận từ xe của chủ xe nằm CÙNG danh sách ở trạng thái chờ
 * duyệt. Cùng quyền với Danh mục (người dùng chốt 11/11/2026).
 *
 * Route tĩnh (`template`, `export`, `imports…`) khai TRƯỚC `:id` — Nest khớp theo thứ tự khai báo.
 */
@ApiTags('platform-vehicle-data')
@Controller('platform/vehicle-data')
@PlatformOnly()
@RequirePermissions(PERMISSION.PLATFORM_CATALOG_MANAGE)
@Realms(ACCOUNT_REALM.PLATFORM)
export class PlatformVehicleDataController {
  constructor(
    private readonly vehicleData: VehicleDataService,
    private readonly query: VehicleDataQueryService,
    private readonly imports: VehicleDataImportService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Danh sách dữ liệu xe (lọc, sắp xếp, phân trang) + số liệu tổng' })
  @ApiOkResponse({ type: VehicleDataPageDto })
  list(@Query() query: VehicleDataListQueryDto): Promise<VehicleDataPageDto> {
    return this.query.list(query);
  }

  @Get('template')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'File mẫu nhập dữ liệu xe (.xlsx, có ô chọn sẵn + hướng dẫn)' })
  @ApiProduces(XLSX_TYPE)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async template(): Promise<StreamableFile> {
    return xlsx(await this.imports.template());
  }

  @Get('export')
  @Header('Cache-Control', 'private, no-store')
  @ApiOperation({ summary: 'Xuất dữ liệu xe theo bộ lọc đang xem — đúng định dạng file nhập' })
  @ApiProduces(XLSX_TYPE)
  @ApiOkResponse({ schema: { type: 'string', format: 'binary' } })
  async export(@Query() query: VehicleDataListQueryDto): Promise<StreamableFile> {
    return xlsx(await this.imports.exportData(query));
  }

  @Get('imports')
  @ApiOperation({ summary: 'Lịch sử các lượt nhập file' })
  @ApiOkResponse({ type: VehicleDataImportPageDto })
  listImports(@Query() query: VehicleDataImportListQueryDto): Promise<VehicleDataImportPageDto> {
    return this.imports.list(query);
  }

  @Post('imports')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: VEHICLE_DATA_IMPORT_LIMITS.maxBytes, files: 1 },
    }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiBody({ type: VehicleDataImportUploadDto })
  @ApiOperation({ summary: 'Tải file lên để XEM TRƯỚC (chưa ghi gì)' })
  @ApiCreatedResponse({ type: VehicleDataImportDto })
  previewImport(
    @CurrentUser() user: AuthenticatedUser,
    @UploadedFile() file: { buffer: Buffer; originalname: string; size: number } | undefined,
  ): Promise<VehicleDataImportDto> {
    return this.imports.preview(user.id, file);
  }

  @Get('imports/:importId')
  @ApiOperation({ summary: 'Một lượt nhập file (tóm tắt)' })
  @ApiOkResponse({ type: VehicleDataImportDto })
  getImport(@Param('importId') importId: string): Promise<VehicleDataImportDto> {
    return this.imports.get(importId);
  }

  @Get('imports/:importId/rows')
  @ApiOperation({ summary: 'Kết quả từng dòng của một lượt nhập (thay đổi cũ → mới, lỗi)' })
  @ApiOkResponse({ type: VehicleDataImportRowPageDto })
  importRows(
    @Param('importId') importId: string,
    @Query() query: VehicleDataImportRowsQueryDto,
  ): Promise<VehicleDataImportRowPageDto> {
    return this.imports.rows(importId, query);
  }

  @Post('imports/:importId/apply')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Áp dụng bản xem trước (một transaction)' })
  @ApiOkResponse({ type: VehicleDataImportDto })
  applyImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('importId') importId: string,
  ): Promise<VehicleDataImportDto> {
    return this.imports.apply(user.id, importId);
  }

  @Post('imports/:importId/discard')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Huỷ bản xem trước' })
  @ApiOkResponse({ type: VehicleDataImportDto })
  discardImport(
    @CurrentUser() user: AuthenticatedUser,
    @Param('importId') importId: string,
  ): Promise<VehicleDataImportDto> {
    return this.imports.discard(user.id, importId);
  }

  @Post()
  @ApiOperation({ summary: 'Thêm một xe chuẩn' })
  @ApiCreatedResponse({ type: VehicleDataDetailDto })
  async create(
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: SaveVehicleDataDto,
  ): Promise<VehicleDataDetailDto> {
    const id = await this.vehicleData.create(user.id, dto);
    return this.query.detail(id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Chi tiết một xe chuẩn: xe đang dùng, giá thực tế, giá trị theo năm' })
  @ApiOkResponse({ type: VehicleDataDetailDto })
  detail(@Param('id') id: string): Promise<VehicleDataDetailDto> {
    return this.query.detail(id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Sửa một xe chuẩn (kể cả dữ liệu đang chờ duyệt)' })
  @ApiOkResponse({ type: VehicleDataDetailDto })
  async update(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: UpdateVehicleDataDto,
  ): Promise<VehicleDataDetailDto> {
    await this.vehicleData.update(user.id, id, dto);
    return this.query.detail(id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Xoá một xe chuẩn chưa có xe nào dùng (có xe thì Ẩn)' })
  @ApiNoContentResponse()
  remove(@CurrentUser() user: AuthenticatedUser, @Param('id') id: string): Promise<void> {
    return this.vehicleData.remove(user.id, id);
  }

  @Post(':id/approve')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Duyệt dữ liệu tự ghi nhận từ chủ xe (dòng xe mới đi kèm duyệt theo)' })
  @ApiOkResponse({ type: VehicleDataReviewResultDto })
  approve(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: ApproveVehicleDataDto,
  ): Promise<VehicleDataReviewResultDto> {
    return this.vehicleData.approve(user.id, id, dto);
  }

  @Post(':id/merge')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Gộp dữ liệu chờ duyệt vào một xe chuẩn đã có (xe đang gắn trỏ sang)' })
  @ApiOkResponse({ type: VehicleDataReviewResultDto })
  merge(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: MergeVehicleDataDto,
  ): Promise<VehicleDataReviewResultDto> {
    return this.vehicleData.merge(user.id, id, dto);
  }

  @Post(':id/reject')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Từ chối dữ liệu chờ duyệt (xe đang gắn bỏ liên kết, giữ tên đã gõ)' })
  @ApiOkResponse({ type: VehicleDataReviewResultDto })
  reject(
    @CurrentUser() user: AuthenticatedUser,
    @Param('id') id: string,
    @Body() dto: RejectVehicleDataDto,
  ): Promise<VehicleDataReviewResultDto> {
    return this.vehicleData.reject(user.id, id, dto);
  }
}
