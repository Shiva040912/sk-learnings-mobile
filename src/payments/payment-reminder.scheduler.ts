import { Injectable } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';

import { PaymentsService } from './payments.service';

@Injectable()
export class PaymentReminderScheduler {
  constructor(
    private readonly paymentsService: PaymentsService,
  ) {}

  @Cron('0 0 * * *', {
    timeZone: 'Asia/Kolkata',
  })
  async handleFeeDueReminder() {
    try {
      const result =
        await this.paymentsService.sendAutomaticDueReminders();

      console.log(
        'Automatic fee reminder result:',
        result,
      );
    } catch (error) {
      console.error(
        'Automatic fee reminder scheduler failed:',
        error,
      );
    }
  }
}