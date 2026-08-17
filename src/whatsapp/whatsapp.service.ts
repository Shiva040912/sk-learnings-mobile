import {
  BadRequestException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class WhatsappService {
  constructor(
    private readonly configService: ConfigService,
  ) {}

  private getApiUrl() {
    const apiVersion =
      this.configService.get<string>(
        'WHATSAPP_API_VERSION',
      );

    const phoneNumberId =
      this.configService.get<string>(
        'WHATSAPP_PHONE_NUMBER_ID',
      );

    if (!apiVersion || !phoneNumberId) {
      throw new BadRequestException(
        'WhatsApp configuration is missing',
      );
    }

    return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  }

  private getAccessToken() {
    const accessToken =
      this.configService.get<string>(
        'WHATSAPP_ACCESS_TOKEN',
      );

    if (!accessToken) {
      throw new BadRequestException(
        'WhatsApp access token is missing',
      );
    }

    return accessToken;
  }

  private normalizePhoneNumber(
    phone: string,
  ) {
    const cleanedPhone =
      phone.replace(/\D/g, '');

    if (
      cleanedPhone.length === 10
    ) {
      return `91${cleanedPhone}`;
    }

    return cleanedPhone;
  }

  async sendFeeDueReminder(data: {
    phone: string;
    studentName: string;
    course: string;
    pendingAmount: number;
    studentId: string;
  }) {
    const phone =
      this.normalizePhoneNumber(
        data.phone,
      );

    try {
      const response = await axios.post(
        this.getApiUrl(),
        {
          messaging_product:
            'whatsapp',

          to: phone,

          type: 'template',

          template: {
            name: 'fee_due_reminder',

            language: {
              code: 'en',
            },

            components: [
              {
                type: 'body',

                parameters: [
                  {
                    type: 'text',
                    text:
                      data.studentName,
                  },
                  {
                    type: 'text',
                    text:
                      data.course,
                  },
                  {
                    type: 'text',
                    text:
                      String(
                        data.pendingAmount,
                      ),
                  },
                ],
              },
              {
                type: 'button',
                sub_type: 'url',
                index: '0',

                parameters: [
                  {
                    type: 'text',
                    text:
                      data.studentId,
                  },
                ],
              },
            ],
          },
        },
        {
          headers: {
            Authorization:
              `Bearer ${this.getAccessToken()}`,

            'Content-Type':
              'application/json',
          },
        },
      );

      return response.data;
    } catch (error: any) {
      const message =
        error?.response?.data
          ?.error?.message ||
        error?.message ||
        'Failed to send WhatsApp fee reminder';

      throw new BadRequestException(
        message,
      );
    }
  }

  async sendPaymentReceived(data: {
    phone: string;
    studentName: string;
    course: string;
    amount: number;
  }) {
    const phone =
      this.normalizePhoneNumber(
        data.phone,
      );

    try {
      const response = await axios.post(
        this.getApiUrl(),
        {
          messaging_product:
            'whatsapp',

          to: phone,

          type: 'template',

          template: {
            name:
              'fee_payment_received',

            language: {
              code: 'en',
            },

            components: [
              {
                type: 'body',

                parameters: [
                  {
                    type: 'text',
                    text:
                      data.studentName,
                  },
                  {
                    type: 'text',
                    text:
                      data.course,
                  },
                  {
                    type: 'text',
                    text:
                      String(
                        data.amount,
                      ),
                  },
                ],
              },
            ],
          },
        },
        {
          headers: {
            Authorization:
              `Bearer ${this.getAccessToken()}`,

            'Content-Type':
              'application/json',
          },
        },
      );

      return response.data;
    } catch (error: any) {
      const message =
        error?.response?.data
          ?.error?.message ||
        error?.message ||
        'Failed to send WhatsApp payment confirmation';

      throw new BadRequestException(
        message,
      );
    }
  }
}