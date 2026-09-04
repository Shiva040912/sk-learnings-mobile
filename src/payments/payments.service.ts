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
import { PermissionsService } from '../permissions/permissions.service';

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

    private readonly permissionsService:
      PermissionsService,
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

  private async getActivePaymentSetting() {
    return this.paymentSettingModel
      .findOne({
        isActive: true,
      })
      .sort({
        updatedAt: -1,
      });
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
      await this.getActivePaymentSetting();

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
          upiId: '',
          receiverName: '',
          paymentPhone: '',
          upiQrImage: '',
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

        student.paidAmount =
          0;

        student.pendingAmount =
          student.totalFee;

        student.paymentMethod =
          undefined;

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
      await this.getActivePaymentSetting();

    if (!setting) {
      return {
        feeDueDate:
          null,
      };
    }

    return {
      feeDueDate:
        setting.feeDueDate,
    };
  }

  async getPaymentSettings() {
    const setting =
      await this.getActivePaymentSetting();

    if (!setting) {
      return {
        feeDueDate:
          null,

        preventReminderDate: null,

        overdueReminderDate: null,

        upiId:
          '',

        receiverName:
          '',

        paymentPhone:
          '',

        upiQrImage:
          '',
      };
    }

    return {
      feeDueDate:
        setting.feeDueDate,

      preventReminderDate:
        setting.preventReminderDate || null,

      overdueReminderDate:
        setting.overdueReminderDate || null,

      upiId:
        setting.upiId || '',

      receiverName:
        setting.receiverName || '',

      paymentPhone:
        setting.paymentPhone || '',

      upiQrImage:
        setting.upiQrImage || '',
    };
  }

  async updateReminderDates(data: {
    feeDueDate?: string;
    preventReminderDate?: string;
    overdueReminderDate?: string;
  }) {
    if (!data.feeDueDate) {
      throw new BadRequestException('Payment date is required');
    }

    const parseDate = (value?: string) => {
      if (!value) return null;
      const date = new Date(`${value}T00:00:00.000Z`);
      if (Number.isNaN(date.getTime())) {
        throw new BadRequestException('Please enter valid reminder dates');
      }
      return date;
    };

    const feeDueDate = parseDate(data.feeDueDate)!;
    const preventReminderDate = parseDate(data.preventReminderDate);
    const overdueReminderDate = parseDate(data.overdueReminderDate);

    if (preventReminderDate && preventReminderDate >= feeDueDate) {
      throw new BadRequestException('Prevent reminder date must be before the payment date');
    }

    if (overdueReminderDate && overdueReminderDate <= feeDueDate) {
      throw new BadRequestException('Overdue reminder date must be after the payment date');
    }

    const dueDateResult = await this.setFeeDueDate(data.feeDueDate);
    const setting = await this.getActivePaymentSetting();

    if (!setting) throw new BadRequestException('Unable to save reminder dates');

    setting.preventReminderDate = preventReminderDate;
    setting.overdueReminderDate = overdueReminderDate;
    setting.lastPreventReminderSentAt = null;
    setting.lastOverdueReminderSentAt = null;
    await setting.save();

    return {
      ...dueDateResult,
      message: 'Reminder dates saved successfully',
      preventReminderDate: setting.preventReminderDate,
      overdueReminderDate: setting.overdueReminderDate,
    };
  }

  async updatePaymentSettings(
    data: {
      upiId?: string;
      receiverName?: string;
      paymentPhone?: string;
      upiQrImage?: string;
    },
  ) {
    const upiId =
      data.upiId?.trim();

    const receiverName =
      data.receiverName?.trim();

    const paymentPhone =
      data.paymentPhone
        ?.replace(/\s+/g, '')
        .trim();

    const upiQrImage =
      data.upiQrImage?.trim();

    if (
      upiId !== undefined &&
      upiId.length > 0 &&
      !upiId.includes('@')
    ) {
      throw new BadRequestException(
        'Please enter a valid UPI ID',
      );
    }

    if (
      paymentPhone !== undefined &&
      paymentPhone.length > 0 &&
      !/^[6-9]\d{9}$/.test(
        paymentPhone,
      )
    ) {
      throw new BadRequestException(
        'Payment phone number must be a valid 10 digit Indian mobile number',
      );
    }

    if (
      upiQrImage &&
      !upiQrImage.startsWith(
        'data:image/',
      )
    ) {
      throw new BadRequestException(
        'Please upload a valid QR image',
      );
    }

    const setting =
      await this.getActivePaymentSetting();

    if (!setting) {
      throw new BadRequestException(
        'Please set the fee due date first',
      );
    }

    if (upiId !== undefined) {
      setting.upiId =
        upiId;
    }

    if (
      receiverName !== undefined
    ) {
      setting.receiverName =
        receiverName;
    }

    if (
      paymentPhone !== undefined
    ) {
      setting.paymentPhone =
        paymentPhone;
    }

    if (
      upiQrImage !== undefined
    ) {
      setting.upiQrImage =
        upiQrImage;
    }

    await setting.save();

    return {
      message:
        'Payment settings updated successfully',

      paymentSettings: {
        upiId:
          setting.upiId || '',

        receiverName:
          setting.receiverName || '',

        paymentPhone:
          setting.paymentPhone || '',

        upiQrImage:
          setting.upiQrImage || '',
      },
    };
  }

  async getPublicPaymentDetails(
    studentId: string,
  ) {
    const student =
      await this.studentModel.findById(
        studentId,
      );

    if (
      !student ||
      !student.isActive
    ) {
      throw new NotFoundException(
        'Student payment details not found',
      );
    }

    const setting =
      await this.getActivePaymentSetting();

    if (!setting) {
      throw new BadRequestException(
        'Payment configuration is not available',
      );
    }

    const hasUpiConfiguration =
      Boolean(
        setting.upiId &&
        setting.receiverName,
      );

    return {
      student: {
        id:
          student._id,

        studentName:
          student.studentName,

        rollNo:
          student.rollNo,

        course:
          student.course,

        batch:
          student.batch || '',

        paymentStatus:
          student.paymentStatus,

        paymentAmount:
          student.pendingAmount,

        paymentProofImage:
          student.paymentProofImage || '',

        paymentProofUploadedAt:
          student.paymentProofUploadedAt || null,
      },

      payment: {
        feeDueDate:
          setting.feeDueDate,

        upiId:
          setting.upiId || '',

        receiverName:
          setting.receiverName || '',

        paymentPhone:
          setting.paymentPhone || '',

        upiQrImage:
          setting.upiQrImage || '',

        isConfigured:
          hasUpiConfiguration,
      },
    };
  }

  async uploadPaymentProof(
    studentId: string,
    proofImage?: string,
  ) {
    const student =
      await this.studentModel.findById(
        studentId,
      );

    if (
      !student ||
      !student.isActive
    ) {
      throw new NotFoundException(
        'Student payment details not found',
      );
    }

    const trimmedImage =
      proofImage?.trim() || '';

    if (
      trimmedImage &&
      !trimmedImage.startsWith(
        'data:image/',
      )
    ) {
      throw new BadRequestException(
        'Please upload a valid payment screenshot',
      );
    }

    student.paymentProofImage =
      trimmedImage;

    student.paymentProofUploadedAt =
      trimmedImage
        ? new Date()
        : null;

    await student.save();

    return {
      message:
        trimmedImage
          ? 'Payment screenshot uploaded successfully'
          : 'Payment screenshot removed successfully',

      paymentProofImage:
        student.paymentProofImage || '',

      paymentProofUploadedAt:
        student.paymentProofUploadedAt || null,
    };
  }

  // `amount` (the per-transaction sum collected) is fee-sensitive data, so
  // it's stripped for trainers without the payments.totalFee permission at
  // the response boundary, same reasoning/pattern as students' omitFeeFields.
  private omitAmount(
    payment: PaymentDocument,
    effective: Awaited<
      ReturnType<
        PermissionsService['effectivePermissionsForUserId']
      >
    >,
  ) {
    return this.permissionsService.pickAllowedFields(
      payment,
      effective,
      'payments',
      [
        {
          kind: 'columns',
          key: 'totalFee',
          fields: ['amount'],
        },
      ],
    );
  }

  async getPayments(
    role?: string,
    userId?: string,
  ) {
    const payments =
      await this.paymentModel
        .find()
        .sort({
          paymentDate:
            -1,
        });

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return payments.map((payment) =>
      this.omitAmount(payment, effective),
    );
  }

  async getPaymentById(
    id: string,
    role?: string,
    userId?: string,
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

    const effective =
      await this.permissionsService.effectivePermissionsForUserId(
        userId || '',
        role,
      );

    return this.omitAmount(payment, effective);
  }

  private formatDueDateForMessage(date: Date) {
    return new Date(date).toLocaleDateString('en-IN', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  }

  async sendDueReminders(
    studentIds?: string[],
    skipDueDateCheck = false,
    reminderType: 'prevent' | 'overdue' = 'prevent',
  ) {
    const setting =
      await this.getActivePaymentSetting();

    if (!setting?.feeDueDate) {
      return {
        message:
          'Fee due date is not set',

        totalEligible:
          0,

        sent:
          0,

        failed:
          0,
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

    if (!skipDueDateCheck && today < dueDate) {
      return {
        message:
          'Fee due date has not started yet',

        totalEligible:
          0,

        sent:
          0,

        failed:
          0,
      };
    }

    const reminderFilter: any = {
      paymentStatus:
        'unpaid',

      pendingAmount: {
        $gt:
          0,
      },

      isActive:
        true,
    };

    if (studentIds && studentIds.length > 0) {
      reminderFilter._id = {
        $in: studentIds,
      };
    }

    const unpaidStudents =
      await this.studentModel.find(reminderFilter);

    if (
      unpaidStudents.length === 0
    ) {
      return {
        message:
          'No unpaid students found',

        totalEligible:
          0,

        sent:
          0,

        failed:
          0,
      };
    }

    const formattedDueDate = this.formatDueDateForMessage(feeDueDate);

    let sent = 0;
    let failed = 0;

    for (
      const student
      of unpaidStudents
    ) {
      try {
        if (reminderType === 'overdue') {
          await this.whatsappService.sendOverdueFeeReminder(
            {
              phone:
                student.phone,

              parentName:
                student.parentName,

              studentName:
                student.studentName,

              studentId:
                student._id.toString(),
            },
          );
        } else {
          await this.whatsappService.sendFeeDueReminder(
            {
              phone:
                student.phone,

              parentName:
                student.parentName,

              studentName:
                student.studentName,

              dueDate:
                formattedDueDate,

              studentId:
                student._id.toString(),
            },
          );
        }

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
      await this.getActivePaymentSetting();

    if (!setting?.feeDueDate) {
      return {
        message:
          'Fee due date is not set',

        sent:
          0,

        failed:
          0,
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

    const sameDay = (date?: Date | null) => date && new Date(date).toDateString() === today.toDateString();
    const runs = [
      { date: setting.preventReminderDate, last: 'lastPreventReminderSentAt' as const, label: 'Prevent reminder', type: 'prevent' as const },
      { date: setting.overdueReminderDate, last: 'lastOverdueReminderSentAt' as const, label: 'Overdue reminder', type: 'overdue' as const },
    ];

    for (const run of runs) {
      if (!sameDay(run.date) || sameDay(setting[run.last])) continue;
      const result = await this.sendDueReminders(
        undefined,
        true,
        run.type,
      );
      setting[run.last] = new Date();
      await setting.save();
      return { ...result, message: `${run.label} processed successfully`, automatic: true };
    }

    return { message: 'No reminder scheduled for today', sent: 0, failed: 0, automatic: true };
  }

  async createPayment(
    data: {
      studentId:
        string;

      studentName:
        string;

      phone:
        string;

      course:
        string;

      amount:
        number;

      paymentMethod:
        | 'cash'
        | 'bank'
        | 'upi'
        | 'qr';

      paymentProofImage?:
        string;
    },
  ) {
    const setting =
      await this.getActivePaymentSetting();

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

        paymentProofImage:
          data.paymentProofImage || '',
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

  async recordCollection(
    data: {
      studentId:
        string;

      studentName:
        string;

      phone:
        string;

      course:
        string;

      amount:
        number;

      paymentMethod:
        | 'cash'
        | 'bank'
        | 'upi'
        | 'qr';

      paymentProofImage?:
        string;
    },
  ) {
    const setting =
      await this.getActivePaymentSetting();

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

        paymentProofImage:
          data.paymentProofImage || '',
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
