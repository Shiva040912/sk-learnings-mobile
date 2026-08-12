import {
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

@Injectable()
export class PaymentsService {
  constructor(
    @InjectModel(Payment.name)
    private readonly paymentModel:
      Model<PaymentDocument>,

    @InjectModel(PaymentSetting.name)
    private readonly paymentSettingModel:
      Model<PaymentSettingDocument>,
  ) {}

  async setFeeDueDate(
    feeDueDate: string,
  ) {
    const parsedDate =
      new Date(feeDueDate);

    if (
      Number.isNaN(
        parsedDate.getTime(),
      )
    ) {
      throw new Error(
        'Invalid fee due date',
      );
    }

    let setting =
      await this.paymentSettingModel.findOne({
        isActive: true,
      });

    if (!setting) {
      setting =
        new this.paymentSettingModel({
          feeDueDate: parsedDate,
          isActive: true,
        });
    } else {
      setting.feeDueDate =
        parsedDate;
    }

    await setting.save();

    return {
      message:
        'Fee due date updated successfully',
      feeDueDate:
        setting.feeDueDate,
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
    const existingPayment =
      await this.paymentModel.findOne({
        studentId:
          data.studentId,
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

        paymentMethod:
          data.paymentMethod,

        paymentStatus:
          'paid',

        paymentDate:
          new Date(),
      });

    return payment.save();
  }
}