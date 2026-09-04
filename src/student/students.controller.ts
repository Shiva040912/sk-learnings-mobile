import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  ForbiddenException,
  Get,
  Param,
  Patch,
  Post,
  Req,
  Res,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';

import { StudentsService } from './students.service';
import { CreateStudentDto } from './dto/create-student.dto';
import { UpdateStudentDto } from './dto/update-student.dto';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import {
  RequirePageAccess,
  RequirePermission,
} from '../permissions/permissions.decorator';

@UseGuards(JwtAuthGuard, PermissionsGuard)
@Controller('students')
export class StudentsController {
  constructor(private readonly studentsService: StudentsService) {}

  private ensureAdministrator(role?: string) {
    if (role !== 'admin') {
      throw new ForbiddenException(
        'Administrator access required',
      );
    }
  }

  @RequirePermission('students', 'actions', 'add')
  @Post()
  create(@Body() createStudentDto: CreateStudentDto) {
    return this.studentsService.create(createStudentDto);
  }

  @RequirePageAccess('students')
  @Get()
  findAll(@Req() req: any) {
    return this.studentsService.findAllForRole(req.user?.role, req.user?.userId);
  }

  @RequirePageAccess('students')
  @Get(':id')
  findOne(@Req() req: any, @Param('id') id: string) {
    return this.studentsService.findOneForRole(id, req.user?.role, req.user?.userId);
  }

  @RequirePermission('students', 'actions', 'edit')
  @Patch(':id')
  update(
    @Param('id') id: string,
    @Body() updateStudentDto: UpdateStudentDto,
  ) {
    return this.studentsService.update(id, updateStudentDto);
  }

  @RequirePermission('payments', 'actions', 'collect')
  @Patch(':id/collect-payment')
  collectPayment(
    @Req() req: any,
    @Param('id') id: string,
    @Body()
    body: {
      amount: number;
      paymentMethod?: 'cash' | 'bank' | 'upi' | 'qr';
    },
  ) {
    return this.studentsService.collectPayment(
      id,
      body.amount,
      body.paymentMethod,
      req.user?.role,
      req.user?.userId,
    );
  }

  @Get('bulk-upload/template')
  async downloadBulkUploadTemplate(
    @Req() req: any,
    @Res() res: Response,
  ) {
    this.ensureAdministrator(req.user?.role);

    const buffer =
      await this.studentsService.generateBulkUploadTemplate();

    res.set({
      'Content-Type':
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition':
        'attachment; filename="sk-learnings-student-upload-template.xlsx"',
    });

    res.send(buffer);
  }

  @Post('bulk-upload/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async previewBulkUpload(
    @Req() req: any,
    @UploadedFile() file: any,
  ) {
    this.ensureAdministrator(req.user?.role);

    if (!file) {
      throw new BadRequestException(
        'No file uploaded',
      );
    }

    const rows =
      await this.studentsService.parseBulkUploadFile(
        file.buffer,
        file.originalname || '',
      );

    return this.studentsService.validateBulkUpload(
      rows,
    );
  }

  @Post('bulk-upload/import')
  importBulkUpload(
    @Req() req: any,
    @Body()
    body: {
      rows: Array<{
        row: number;
        data: Record<string, any>;
      }>;
    },
  ) {
    this.ensureAdministrator(req.user?.role);

    return this.studentsService.importBulkUpload(
      body.rows || [],
    );
  }

  @RequirePermission('students', 'actions', 'delete')
  @Delete(':id')
  remove(@Param('id') id: string) {
    return this.studentsService.remove(id);
  }
}