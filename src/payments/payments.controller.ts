import {
  Body,
  Controller,
  Delete,
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
import {
  RequirePageAccess,
  RequirePermission,
} from '../permissions/permissions.decorator';

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

  // These expose/alter the UPI ID, receiver name and phone number every
  // student is told to pay fees to (see getPublicPaymentDetails) — must
  // require 'settings' page access like updateReminderDates below, not
  // just any authenticated session, or any Trainer could redirect fee
  // collection to a different account.
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePageAccess('settings')
  @Get('settings')
  getPaymentSettings() {
    return this.paymentsService.getPaymentSettings();
  }

  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePageAccess('settings')
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

  // Only the standalone Settings page's "Reminders" tab calls this (the
  // Payments page uses the separate due-date endpoints below, which stay
  // gated by 'payments' access, not this) — safe to require 'settings'
  // page access specifically.
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePageAccess('settings')
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

  // Changes the fee due date for every student — was reachable by any
  // authenticated session regardless of permissions; now requires the same
  // 'payments' page access the comment above already claimed this held.
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePageAccess('payments')
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

  // Triggers WhatsApp reminder messages to students — was reachable by any
  // authenticated session regardless of permissions; now requires
  // 'payments' page access like the rest of this page's actions.
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePageAccess('payments')
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

  // Deleting a history record is a log-cleanup action, not a balance
  // change — it never touches the student's paidAmount/pendingAmount, so
  // it's gated behind the same "collect" permission as the action that
  // creates these records, rather than a new permission of its own.
  @UseGuards(JwtAuthGuard, PermissionsGuard)
  @RequirePermission('payments', 'actions', 'collect')
  @Delete(':id')
  deletePayment(
    @Param('id')
    id: string,
  ) {
    return this.paymentsService.deletePayment(id);
  }
}
