import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { Model } from 'mongoose';

import {
  Payment,
  PaymentDocument,
} from './payments.schema';

import {
  PaymentSetting,
  PaymentSettingDocument,
} from './payments-settings.schema';

import {
  Student,
  StudentDocument,
} from '../student/students.schema';

import { WhatsappService } from '../whatsapp/whatsapp.service';

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel:
      Model<PaymentDocument>,

    @InjectModel(PaymentSetting.name)
    private readonly paymentSettingModel:
      Model<PaymentSettingDocument>,

    @InjectModel(Student.name)
    private readonly studentModel:
      Model<StudentDocument>,

    private readonly whatsappService:
      WhatsappService,
  ) {}

  private getBillingMonth(
    date: Date,
  ) {
    const year =
      date.getUTCFullYear();

    const month = String(
      date.getUTCMonth() + 1,
    ).padStart(2, '0');

    return `${year}-${month}`;
  }

  async setFeeDueDate(
    feeDueDate: string,
  ) {
    const parsedDate =
      new Date(
        `${feeDueDate}T00:00:00.000Z`,
      );

    if (
      Number.isNaN(
        parsedDate.getTime(),
      )
    ) {
      throw new BadRequestException(
        'Invalid fee due date',
      );
    }

    let setting =
      await this.paymentSettingModel.findOne({
        isActive: true,
      });

    let shouldResetStudents = false;

    if (setting?.feeDueDate) {
      const previousDate =
        new Date(
          setting.feeDueDate,
        );

      const previousBillingMonth =
        this.getBillingMonth(
          previousDate,
        );

      const newBillingMonth =
        this.getBillingMonth(
          parsedDate,
        );

      shouldResetStudents =
        previousBillingMonth !==
        newBillingMonth;
    }

    if (!setting) {
      setting =
        new this.paymentSettingModel({
          feeDueDate: parsedDate,
          isActive: true,
          lastReminderSentAt: null,
        });
    } else {
      setting.feeDueDate =
        parsedDate;

      setting.lastReminderSentAt =
        null;
    }

    await setting.save();

    let resetStudentCount = 0;

    if (shouldResetStudents) {
      const students =
        await this.studentModel.find();

      for (
        const student
        of students
      ) {
        student.paymentStatus =
          'unpaid';

        student.paidAmount = 0;

        student.pendingAmount =
          student.totalFee;

        await student.save();
      }

      resetStudentCount =
        students.length;
    }

    return {
      message:
        shouldResetStudents
          ? 'New month fee date updated and all students reset to unpaid'
          : 'Fee due date updated successfully',

      feeDueDate:
        setting.feeDueDate,

      studentsReset:
        shouldResetStudents,

      resetStudentCount,
    };
  }

  async getFeeDueDate() {
    const setting =
      await this.paymentSettingModel
        .findOne({
          isActive: true,
        })
        .sort({
          updatedAt: -1,
        });

    if (!setting) {
      return {
        feeDueDate: null,
      };
    }

    return {
      feeDueDate:
        setting.feeDueDate,
    };
  }

  async getPayments() {
    return this.paymentModel
      .find()
      .sort({
        paymentDate: -1,
      });
  }

  async getPaymentById(
    id: string,
  ) {
    const payment =
      await this.paymentModel.findById(
        id,
      );

    if (!payment) {
      throw new NotFoundException(
        'Payment record not found',
      );
    }

    return payment;
  }

  async sendDueReminders() {
    const setting =
      await this.paymentSettingModel.findOne({
        isActive: true,
      });

    if (!setting?.feeDueDate) {
      return {
        message:
          'Fee due date is not set',
        totalEligible: 0,
        sent: 0,
        failed: 0,
      };
    }

    const now =
      new Date();

    const today =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

    const feeDueDate =
      new Date(
        setting.feeDueDate,
      );

    const dueDate =
      new Date(
        feeDueDate.getFullYear(),
        feeDueDate.getMonth(),
        feeDueDate.getDate(),
      );

    if (today < dueDate) {
      return {
        message:
          'Fee due date has not started yet',
        totalEligible: 0,
        sent: 0,
        failed: 0,
      };
    }

    const unpaidStudents =
      await this.studentModel.find({
        paymentStatus:
          'unpaid',

        pendingAmount: {
          $gt: 0,
        },

        isActive: true,
      });

    if (
      unpaidStudents.length === 0
    ) {
      return {
        message:
          'No unpaid students found',
        totalEligible: 0,
        sent: 0,
        failed: 0,
      };
    }

    let sent = 0;
    let failed = 0;

    for (
      const student
      of unpaidStudents
    ) {
      try {
        await this.whatsappService.sendFeeDueReminder(
          {
            phone:
              student.phone,

            studentName:
              student.studentName,

            course:
              student.course,

            pendingAmount:
              student.pendingAmount,

            paymentToken:
              student._id.toString(),
          },
        );

        sent++;
      } catch (error) {
        failed++;

        console.error(
          `Fee reminder failed for ${student.studentName}:`,
          error,
        );
      }
    }

    return {
      message:
        'Fee reminders processed successfully',

      totalEligible:
        unpaidStudents.length,

      sent,

      failed,
    };
  }

  async sendAutomaticDueReminders() {
    const setting =
      await this.paymentSettingModel.findOne({
        isActive: true,
      });

    if (!setting?.feeDueDate) {
      return {
        message:
          'Fee due date is not set',
        sent: 0,
        failed: 0,
      };
    }

    const now =
      new Date();

    const today =
      new Date(
        now.getFullYear(),
        now.getMonth(),
        now.getDate(),
      );

    const feeDueDate =
      new Date(
        setting.feeDueDate,
      );

    const dueDate =
      new Date(
        feeDueDate.getFullYear(),
        feeDueDate.getMonth(),
        feeDueDate.getDate(),
      );

    if (today < dueDate) {
      return {
        message:
          'Fee due date has not started yet',
        sent: 0,
        failed: 0,
      };
    }

    if (
      setting.lastReminderSentAt
    ) {
      const lastSent =
        new Date(
          setting.lastReminderSentAt,
        );

      const lastSentDate =
        new Date(
          lastSent.getFullYear(),
          lastSent.getMonth(),
          lastSent.getDate(),
        );

      if (
        lastSentDate.getTime() >=
        dueDate.getTime()
      ) {
        return {
          message:
            'Automatic reminder already sent for this fee due date',
          sent: 0,
          failed: 0,
        };
      }
    }

    const result =
      await this.sendDueReminders();

    if (
      result.totalEligible === 0 ||
      result.sent === 0
    ) {
      return {
        ...result,
        automatic: true,
      };
    }

    setting.lastReminderSentAt =
      new Date();

    await setting.save();

    return {
      ...result,
      automatic: true,
    };
  }

  async createPayment(data: {
    studentId: string;
    studentName: string;
    phone: string;
    course: string;
    amount: number;
    paymentMethod:
      | 'cash'
      | 'bank'
      | 'upi'
      | 'qr';
  }) {
    const setting =
      await this.paymentSettingModel
        .findOne({
          isActive: true,
        })
        .sort({
          updatedAt: -1,
        });

    const billingDate =
      setting?.feeDueDate
        ? new Date(
            setting.feeDueDate,
          )
        : new Date();

    const billingMonth =
      this.getBillingMonth(
        billingDate,
      );

    const existingPayment =
      await this.paymentModel.findOne({
        studentId:
          data.studentId,

        billingMonth,

        paymentStatus:
          'paid',
      });

    if (existingPayment) {
      return existingPayment;
    }

    const payment =
      new this.paymentModel({
        studentId:
          data.studentId,

        studentName:
          data.studentName,

        phone:
          data.phone,

        course:
          data.course,

        amount:
          data.amount,

        billingMonth,

        paymentMethod:
          data.paymentMethod,

        paymentStatus:
          'paid',

        paymentDate:
          new Date(),
      });

    const savedPayment =
      await payment.save();

    try {
      await this.whatsappService.sendPaymentReceived(
        {
          phone:
            data.phone,

          studentName:
            data.studentName,

          course:
            data.course,

          amount:
            data.amount,
        },
      );
    } catch (error) {
      console.error(
        'Payment received WhatsApp message failed:',
        error,
      );
    }

    return savedPayment;
  }
}