import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { RagController } from './rag.controller.js';
import { RagService } from './rag.service.js';

describe('RagController', () => {
  let controller: RagController;
  let ragService: {
    ask: ReturnType<typeof vi.fn>;
    checkHealth: ReturnType<typeof vi.fn>;
    ingest: ReturnType<typeof vi.fn>;
  };

  beforeEach(async () => {
    ragService = {
      ask: vi.fn(),
      checkHealth: vi.fn(),
      ingest: vi.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [RagController],
      providers: [{ provide: RagService, useValue: ragService }],
    }).compile();
    controller = module.get(RagController);
  });

  it('forwards a valid question and the default topK', async () => {
    ragService.ask.mockResolvedValue({ answer: 'Answer', sources: [] });

    await expect(controller.chat({ question: '  What is this?  ' })).resolves.toEqual({
      answer: 'Answer',
      sources: [],
    });
    expect(ragService.ask).toHaveBeenCalledWith('What is this?', 5);
  });

  it('forwards a requested topK', async () => {
    ragService.ask.mockResolvedValue({ answer: 'Answer', sources: [] });

    await controller.chat({ question: 'Question', topK: 3 });

    expect(ragService.ask).toHaveBeenCalledWith('Question', 3);
  });

  it.each([
    undefined,
    {},
    { question: '' },
    { question: '  ' },
    { question: 42 },
    { question: 'q'.repeat(4001) },
    { question: 'Question', topK: 0 },
    { question: 'Question', topK: 21 },
    { question: 'Question', topK: 1.5 },
  ])('rejects invalid chat request %#', async (body) => {
    await expect(controller.chat(body)).rejects.toBeInstanceOf(
      BadRequestException,
    );
    expect(ragService.ask).not.toHaveBeenCalled();
  });

  it('rejects uploads with no file', async () => {
    await expect(controller.upload(undefined)).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });
});
