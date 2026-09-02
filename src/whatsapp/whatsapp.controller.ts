import {
  Controller,
  Get,
  Post,
  Query,
  Req,
  Res,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Request, Response } from 'express';

@Controller('whatsapp')
export class WhatsappController {
  private readonly logger = new Logger(WhatsappController.name);

  constructor(
    private readonly configService: ConfigService,
  ) {}

  
  @Get('webhook')
  verifyWebhook(
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') token: string,
    @Query('hub.challenge') challenge: string,
    @Res() response: Response,
  ) {
    const verifyToken =
      this.configService.get<string>(
        'WHATSAPP_WEBHOOK_VERIFY_TOKEN',
      );

    if (
      mode === 'subscribe' &&
      token &&
      verifyToken &&
      token === verifyToken
    ) {
      this.logger.log('WhatsApp webhook verified');
      return response.status(200).send(challenge);
    }

    this.logger.warn('WhatsApp webhook verification failed');
    return response.sendStatus(403);
  }


  @Post('webhook')
  receiveWebhook(
    @Req() request: Request,
    @Res() response: Response,
  ) {
    try {
      const body: any = request.body;

      this.logger.log(
        `WhatsApp webhook received: ${JSON.stringify(body)}`,
      );

      const entries = Array.isArray(body?.entry)
        ? body.entry
        : [];

      for (const entry of entries) {
        const changes = Array.isArray(entry?.changes)
          ? entry.changes
          : [];

        for (const change of changes) {
          const value = change?.value;

          const statuses = Array.isArray(value?.statuses)
            ? value.statuses
            : [];

          for (const status of statuses) {
            const messageId = status?.id || 'unknown';
            const recipient = status?.recipient_id || 'unknown';
            const statusName = status?.status || 'unknown';

            if (statusName === 'failed') {
              this.logger.error(
                `WhatsApp DELIVERY FAILED: messageId=${messageId}, recipient=${recipient}, errors=${JSON.stringify(
                  status?.errors || [],
                )}`,
              );
            } else {
              this.logger.log(
                `WhatsApp DELIVERY STATUS: status=${statusName}, messageId=${messageId}, recipient=${recipient}`,
              );
            }
          }
        }
      }

      
      return response.sendStatus(200);
    } catch (error) {
      this.logger.error(
        'WhatsApp webhook processing failed',
        error instanceof Error ? error.stack : String(error),
      );

      
      return response.sendStatus(200);
    }
  }
}
