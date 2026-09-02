import {
  BadRequestException,
  Injectable,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

type WhatsAppApiResponse = {
  messaging_product?: string;
  contacts?: Array<{
    input?: string;
    wa_id?: string;
  }>;
  messages?: Array<{
    id?: string;
  }>;
};

@Injectable()
export class WhatsappService {
  private readonly logger = new Logger(WhatsappService.name);

  constructor(
    private readonly configService: ConfigService,
  ) {}

  private getApiUrl() {
    const apiVersion =
      this.configService.get<string>('WHATSAPP_API_VERSION');

    const phoneNumberId =
      this.configService.get<string>('WHATSAPP_PHONE_NUMBER_ID');

    if (!apiVersion || !phoneNumberId) {
      throw new BadRequestException(
        'WhatsApp configuration is missing',
      );
    }

    return `https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`;
  }

  private getAccessToken() {
    const accessToken =
      this.configService.get<string>('WHATSAPP_ACCESS_TOKEN');

    if (!accessToken) {
      throw new BadRequestException(
        'WhatsApp access token is missing',
      );
    }

    return accessToken;
  }

  private normalizePhoneNumber(phone: string) {
    const cleanedPhone = String(phone || '').replace(/\D/g, '');

    if (cleanedPhone.length === 10) {
      return `91${cleanedPhone}`;
    }

    return cleanedPhone;
  }

  private validatePhoneNumber(phone: string) {
    if (!phone || phone.length < 11) {
      throw new BadRequestException(
        'Invalid WhatsApp phone number',
      );
    }
  }

  private async sendTemplateMessage(
    phone: string,
    templateName: string,
    components: any[],
  ): Promise<WhatsAppApiResponse> {
    const normalizedPhone = this.normalizePhoneNumber(phone);
    this.validatePhoneNumber(normalizedPhone);

    const payload = {
      messaging_product: 'whatsapp',
      to: normalizedPhone,
      type: 'template',
      template: {
        name: templateName,
        language: {
          code: 'en',
        },
        components,
      },
    };

    try {
      this.logger.log(
        `Sending WhatsApp template "${templateName}" to ${normalizedPhone}`,
      );

      const response = await axios.post<WhatsAppApiResponse>(
        this.getApiUrl(),
        payload,
        {
          headers: {
            Authorization: `Bearer ${this.getAccessToken()}`,
            'Content-Type': 'application/json',
          },
          timeout: 15000,
        },
      );

      const messageId = response.data?.messages?.[0]?.id;

      if (!messageId) {
        this.logger.error(
          `WhatsApp API returned success without a message ID: ${JSON.stringify(
            response.data,
          )}`,
        );

        throw new BadRequestException(
          'WhatsApp API accepted the request but did not return a message ID',
        );
      }

      this.logger.log(
        `WhatsApp message accepted. template=${templateName}, to=${normalizedPhone}, messageId=${messageId}`,
      );

      return response.data;
    } catch (error) {
      if (error instanceof BadRequestException) {
        throw error;
      }

      const axiosError = error as AxiosError<any>;
      const apiError = axiosError?.response?.data?.error;

      const message =
        apiError?.message ||
        axiosError?.message ||
        `Failed to send WhatsApp template "${templateName}"`;

      this.logger.error(
        `WhatsApp send failed. template=${templateName}, to=${normalizedPhone}, status=${axiosError?.response?.status || 'unknown'}, message=${message}`,
        JSON.stringify(axiosError?.response?.data || {}),
      );

      throw new BadRequestException(message);
    }
  }

  async sendFeeDueReminder(data: {
    phone: string;
    parentName: string;
    studentName: string;
    dueDate: string;
    studentId: string;
  }) {
    return this.sendTemplateMessage(
      data.phone,
      'sk_fee_reminder',
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: data.parentName },
            { type: 'text', text: data.studentName },
            { type: 'text', text: data.dueDate },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: data.studentId },
          ],
        },
      ],
    );
  }

  async sendOverdueFeeReminder(data: {
    phone: string;
    parentName: string;
    studentName: string;
    studentId: string;
  }) {
    return this.sendTemplateMessage(
      data.phone,
      'sk_overdue_reminder',
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: data.parentName },
            { type: 'text', text: data.studentName },
          ],
        },
        {
          type: 'button',
          sub_type: 'url',
          index: '0',
          parameters: [
            { type: 'text', text: data.studentId },
          ],
        },
      ],
    );
  }

  async sendPaymentReceived(data: {
    phone: string;
    studentName: string;
    course: string;
    amount: number;
  }) {
    return this.sendTemplateMessage(
      data.phone,
      'fee_payment_received',
      [
        {
          type: 'body',
          parameters: [
            { type: 'text', text: data.studentName },
            { type: 'text', text: data.course },
            { type: 'text', text: String(data.amount) },
          ],
        },
      ],
    );
  }

}