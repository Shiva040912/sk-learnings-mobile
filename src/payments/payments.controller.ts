import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';

import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PermissionsGuard } from '../permissions/permissions.guard';
import { RequirePageAccess } from '../permissions/permissions.decorator';

@Controller('payments')
export class PaymentsController {
  constructor(
    private readonly paymentsService:
      PaymentsService,
  ) {}

  @Get('public/student/:studentId')
  getPublicPaymentDetails(
    @Param('studentId')
    studentId: string,
  ) {
    return this.paymentsService.getPublicPaymentDetails(
      studentId,
    );
  }

  @Put('public/student/:studentId/proof')
  uploadPaymentProof(
    @Param('studentId')
    studentId: string,

    @Body('proofImage')
    proofImage: string,
  ) {
    return this.paymentsService.uploadPaymentProof(
      studentId,
      proofImage,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('settings')
  getPaymentSettings() {
    return this.paymentsService.getPaymentSettings();
  }

  @UseGuards(JwtAuthGuard)
  @Put('settings')
  updatePaymentSettings(
    @Body()
    body: {
      upiId?: string;
      receiverName?: string;
      paymentPhone?: string;
      upiQrImage?: string;
    },
  ) {
    return this.paymentsService.updatePaymentSettings(
      body,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Put('reminder-dates')
  updateReminderDates(
    @Body()
    body: {
      feeDueDate?: string;
      preventReminderDate?: string;
      overdueReminderDate?: string;
    },
  ) {
    return this.paymentsService.updateReminderDates(body);
  }

  @UseGuards(JwtAuthGuard)
  @Put('due-date')
  setFeeDueDate(
    @Body('feeDueDate')
    feeDueDate: string,
  ) {
    return this.paymentsService.setFeeDueDate(
      feeDueDate,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get('due-date')
  getFeeDueDate() {
    return this.paymentsService.getFeeDueDate();
  }

  @UseGuards(JwtAuthGuard)
  @Post('send-reminders')
  sendDueReminders(
    @Body()
    body: {
      studentIds?: string[];
      messageType?: 'prevent' | 'overdue';
    },
  ) {
    return this.paymentsService.sendDueReminders(
      body.studentIds,
      true,
      body.messageType || 'prevent',
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePageAccess('payments')
  @Get()
  getPayments(@Req() req: any) {
    return this.paymentsService.getPayments(
      req.user?.role,
      req.user?.userId,
    );
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePageAccess('payments')
  @Get(':id')
  getPaymentById(
    @Req() req: any,
    @Param('id')
    id: string,
  ) {
    return this.paymentsService.getPaymentById(
      id,
      req.user?.role,
      req.user?.userId,
    );
  }
}
