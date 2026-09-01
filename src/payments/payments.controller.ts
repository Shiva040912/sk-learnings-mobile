import {
  Body,
  Controller,
  Get,
  Param,
  Post,
  Put,
  UseGuards,
} from '@nestjs/common';

import { PaymentsService } from './payments.service';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';

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
    @Body('studentIds')
    studentIds?: string[],
  ) {
    return this.paymentsService.sendDueReminders(
      studentIds,
      true,
    );
  }

  @UseGuards(JwtAuthGuard)
  @Get()
  getPayments() {
    return this.paymentsService.getPayments();
  }

  @UseGuards(JwtAuthGuard)
  @Get(':id')
  getPaymentById(
    @Param('id')
    id: string,
  ) {
    return this.paymentsService.getPaymentById(
      id,
    );
  }
}
