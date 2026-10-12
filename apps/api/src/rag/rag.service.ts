import {
  BadRequestException,
  BadGatewayException,
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { execFile } from 'node:child_process';
import { access, mkdir, rm, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { extname, resolve } from 'node:path';
import { promisify } from 'node:util'; 

const execFileAsync = promisify(execFile);
const MAX_OUTPUT_BYTES = 1024 * 1024;
const MAX_TIMEOUT_MS = 10 * 60 * 1000;
const SUPPORTED_EXTENSIONS = new Set([
  '.docx',
  '.html',
  '.md',
  '.pdf',
  '.pptx',
  '.txt',
  '.xlsx',
]);

export interface RagSource {
  source: string;
  chunk: number;
  similarity: number;
}

export interface RagAnswer {
  answer: string;
  sources: RagSource[];
}

export interface IngestResult {
  source: string;
  status: 'indexed' | 'unchanged';
  chunks: number;
}

@Injectable()
export class RagService {
  private readonly logger = new Logger(RagService.name);
  private readonly projectRoot = resolve(
    process.env.RAG_PROJECT_ROOT ?? resolve(process.cwd(), '../..'),
  );
  private readonly pythonPath =
    process.env.RAG_PYTHON ?? resolve(this.projectRoot, '.venv-docling/bin/python');
  private readonly servicePath = resolve(this.projectRoot, 'services/docling');

  async checkHealth(): Promise<{ status: 'ok'; service: string }> {
    await access(this.pythonPath);
    return { status: 'ok', service: 'rag' };
  }

  async ask(question: string, topK = 5): Promise<RagAnswer> {
    const { stdout } = await this.runPython(
      'query.py',
      [question, '--top-k', String(topK), '--json'],
      MAX_TIMEOUT_MS,
    );

    try {
      const result: unknown = JSON.parse(stdout);
      if (
        typeof result !== 'object' ||
        result === null ||
        !('answer' in result) ||
        typeof result.answer !== 'string' ||
        !('sources' in result) ||
        !Array.isArray(result.sources)
      ) {
        throw new Error('Unexpected answer response shape');
      }
      const sources = result.sources;
      if (
        !sources.every(
          (source): source is RagSource =>
            typeof source === 'object' &&
            source !== null &&
            'source' in source &&
            typeof source.source === 'string' &&
            'chunk' in source &&
            typeof source.chunk === 'number' &&
            'similarity' in source &&
            typeof source.similarity === 'number',
        )
      ) {
        throw new Error('Unexpected source response shape');
      }
      return { answer: result.answer, sources };
    } catch (error) {
      this.logger.error('RAG query returned invalid JSON', error);
      throw new BadGatewayException('The RAG service returned an invalid response');
    }
  }

  async ingest(
    file: Express.Multer.File,
  ): Promise<{ document: IngestResult }> {
    const extension = extname(file.originalname).toLowerCase();
    if (!SUPPORTED_EXTENSIONS.has(extension)) {
      throw new BadRequestException('Unsupported document extension');
    }

    const uploadsPath = resolve(this.projectRoot, 'documents/uploads');
    await mkdir(uploadsPath, { recursive: true });
    const storedPath = resolve(uploadsPath, `${randomUUID()}${extension}`);

    try {
      await writeFile(storedPath, file.buffer, { flag: 'wx' });
      const { stdout } = await this.runPython(
        'ingest.py',
        ['--json', storedPath],
        MAX_TIMEOUT_MS,
      );
      const results: unknown = JSON.parse(stdout);
      if (
        !Array.isArray(results) ||
        results.length !== 1 ||
        typeof results[0] !== 'object' ||
        results[0] === null ||
        !('source' in results[0]) ||
        typeof results[0].source !== 'string' ||
        !('status' in results[0]) ||
        (results[0].status !== 'indexed' && results[0].status !== 'unchanged') ||
        !('chunks' in results[0]) ||
        typeof results[0].chunks !== 'number'
      ) {
        throw new Error('Unexpected ingestion response shape');
      }
      return {
        document: {
          source: results[0].source,
          status: results[0].status,
          chunks: results[0].chunks,
        },
      };
    } catch (error) {
      await rm(storedPath, { force: true });
      if (error instanceof BadGatewayException) {
        throw error;
      }
      this.logger.error('Document ingestion failed', error);
      throw new BadGatewayException(
        'Document ingestion failed. Check that PostgreSQL, pgvector, and Ollama are available.',
      );
    }
  }

  private async runPython(
    script: string,
    args: string[],
    timeout: number,
  ): Promise<{ stdout: string; stderr: string }> {
    try {
      return await execFileAsync(
        this.pythonPath,
        [resolve(this.servicePath, script), ...args],
        {
          cwd: this.projectRoot,
          encoding: 'utf8',
          maxBuffer: MAX_OUTPUT_BYTES,
          timeout,
          windowsHide: true,
        },
      );
    } catch (error) {
      const details =
        typeof error === 'object' && error !== null && 'stderr' in error
          ? String(error.stderr).trim().slice(-2000)
          : error instanceof Error
            ? error.message
            : String(error);
      this.logger.error(`Python RAG process failed: ${details}`);
      throw new ServiceUnavailableException(
        'The RAG service could not complete the request. Check its Python environment, PostgreSQL, and Ollama.',
      );
    }
  }
}
