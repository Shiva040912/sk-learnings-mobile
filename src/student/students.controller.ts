import {
  BadRequestException,
  Body,
  Controller,
  Delete,
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

  // Declared before ':id' so Nest doesn't swallow this static path as an
  // id param. Gated by 'payments' page access, not 'students' — see
  // StudentsService.findAllForPaymentsRole for why the Payments page can't
  // just reuse the plain findAll() above.
  @RequirePageAccess('payments')
  @Get('for-payments')
  findAllForPayments(@Req() req: any) {
    return this.studentsService.findAllForPaymentsRole(
      req.user?.role,
      req.user?.userId,
    );
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

  // Deliberately its own permission, separate from "collect" — Admin gets
  // it automatically (PermissionsGuard short-circuits role === 'admin'
  // before ever looking at a permissions map), and Trainers get denied
  // since 'editFee' isn't in PERMISSION_PAGES.payments.actions yet, so no
  // stored Trainer permissions doc can ever contain it. Wiring up a
  // Trainer enable/disable toggle for this is a later step — at that
  // point it only needs adding to the catalog; this guard doesn't change.
  @RequirePermission('payments', 'actions', 'editFee')
  @Post(':id/fee-cycles')
  generateFeeCycle(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { totalFee: number },
  ) {
    return this.studentsService.generateFeeCycle(
      id,
      body.totalFee,
      req.user?.role,
      req.user?.userId,
    );
  }

  // Corrects the amount on the currently active (unpaid/partial) fee
  // cycle — same 'editFee' permission as generating a fee cycle, since
  // both are "set what this student owes" actions.
  @RequirePermission('payments', 'actions', 'editFee')
  @Patch(':id/fee-cycles/active')
  editFeeCycleAmount(
    @Req() req: any,
    @Param('id') id: string,
    @Body() body: { totalFee: number },
  ) {
    return this.studentsService.editFeeCycleAmount(
      id,
      body.totalFee,
      req.user?.role,
      req.user?.userId,
    );
  }

  // Full/partial fee-cycle history is real sensitive data (past amounts,
  // past screenshots) — gated on 'viewDetails' rather than bare page
  // access, so a Trainer who can only collect the *current* payment can't
  // pull a student's whole payment history straight from the API even
  // though the History button is hidden from them in the UI.
  @RequirePermission('payments', 'actions', 'viewDetails')
  @Get(':id/fee-cycles')
  getFeeCycles(
    @Req() req: any,
    @Param('id') id: string,
  ) {
    return this.studentsService.getFeeCycles(
      id,
      req.user?.role,
      req.user?.userId,
    );
  }

  @RequirePermission('students', 'actions', 'add')
  @Get('bulk-upload/template')
  async downloadBulkUploadTemplate(
    @Res() res: Response,
  ) {
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

  @RequirePermission('students', 'actions', 'add')
  @Post('bulk-upload/preview')
  @UseInterceptors(
    FileInterceptor('file', {
      limits: { fileSize: 5 * 1024 * 1024 },
    }),
  )
  async previewBulkUpload(
    @UploadedFile() file: any,
  ) {
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

  @RequirePermission('students', 'actions', 'add')
  @Post('bulk-upload/import')
  importBulkUpload(
    @Body()
    body: {
      rows: Array<{
        row: number;
        data: Record<string, any>;
      }>;
    },
  ) {
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