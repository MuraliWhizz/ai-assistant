import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Post,
  UploadedFile,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { extname } from 'node:path';
import { memoryStorage } from 'multer';
import { RagService } from './rag.service.js';

const MAX_UPLOAD_BYTES = 25 * 1024 * 1024;
const SUPPORTED_EXTENSIONS = new Set([
  '.docx',
  '.html',
  '.md',
  '.pdf',
  '.pptx',
  '.txt',
  '.xlsx',
]);

@Controller()
export class RagController {
  constructor(private readonly ragService: RagService) {}

  @Get('health')
  async health() {
    return this.ragService.checkHealth();
  }

  @Post('chat')
  async chat(@Body() body: unknown) {
    if (typeof body !== 'object' || body === null || !('question' in body)) {
      throw new BadRequestException('question is required');
    }
    const { question } = body;
    if (
      typeof question !== 'string' ||
      question.trim().length === 0 ||
      question.length > 4000
    ) {
      throw new BadRequestException(
        'question must be a non-empty string of at most 4000 characters',
      );
    }

    let topK = 5;
    if ('topK' in body && body.topK !== undefined) {
      if (
        typeof body.topK !== 'number' ||
        !Number.isInteger(body.topK) ||
        body.topK < 1 ||
        body.topK > 20
      ) {
        throw new BadRequestException('topK must be an integer between 1 and 20');
      }
      topK = body.topK;
    }

    return this.ragService.ask(question.trim(), topK);
  }

  @Post('documents')
  @UseInterceptors(
    FileInterceptor('file', {
      storage: memoryStorage(),
      limits: { fileSize: MAX_UPLOAD_BYTES, files: 1 },
      fileFilter: (_request, file, callback) => {
        if (!SUPPORTED_EXTENSIONS.has(extname(file.originalname).toLowerCase())) {
          callback(new BadRequestException('Unsupported document extension'), false);
          return;
        }
        callback(null, true);
      },
    }),
  )
  async upload(@UploadedFile() file: Express.Multer.File | undefined) {
    if (!file) {
      throw new BadRequestException(
        'A supported document is required in the "file" field',
      );
    }
    return this.ragService.ingest(file);
  }
}
