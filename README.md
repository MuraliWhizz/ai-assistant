# AI Knowledge Assistant

The first backend milestone is a local RAG proof of concept. It parses local
documents with Docling, stores Qwen3 embeddings in PostgreSQL/pgvector, retrieves
relevant chunks, and asks Qwen3 4B to answer using that context. The NestJS API,
web app, and MCP server are later milestones.

## Prerequisites

- Python 3.10 or newer and the project's `.venv-docling` environment
- PostgreSQL with the `vector` (pgvector) extension available to the database
- Ollama running locally with `qwen3-embedding:0.6b` and `qwen3:4b` available

## Install project dependencies

From the project root, install the root, API, web, and Docling dependencies in
sequence with one command:

```bash
npm run cmd -- install --all
```

Each install runs in the same terminal and displays its output. The command
stops and returns a failure if any step fails. It creates `.venv-docling` if
needed and installs `services/docling/requirements.txt` into that environment.

Create or update the Python environment and configure the database:

```bash
source .venv-docling/bin/activate
python -m pip install -r services/docling/requirements.txt
cp .env.example .env
```

Edit `.env` and set `DATABASE_URL` to the PostgreSQL database where you want
the RAG tables created. To run PostgreSQL with pgvector and Ollama in Docker,
start the dependencies from the project root:

```bash
docker compose up -d
docker compose exec ollama ollama pull qwen3-embedding:0.6b
docker compose exec ollama ollama pull qwen3:4b
```

The Compose defaults create the `ai_assistant` database and user with password
`ai_assistant`; set `DATABASE_URL=postgresql://ai_assistant:ai_assistant@127.0.0.1:5432/ai_assistant`
in `.env` to use them. You can override the database name, user, password, and
host port with `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, and
`POSTGRES_PORT`. Set `OLLAMA_PORT` to change Ollama's host port and update
`OLLAMA_BASE_URL` accordingly. Stop the dependencies with `docker compose down`;
their data is retained in named Docker volumes.

Do not commit `.env`. The scripts also read
`apps/api/.env` as a fallback when a root `.env` is absent or does not define a
setting.

For example, the configured database must have permission to install pgvector
or have the extension installed by an administrator:

```sql
CREATE EXTENSION IF NOT EXISTS vector;
```

The first ingest or query command creates `rag_documents` and `rag_chunks`,
including a 1024-dimensional vector column and cosine-similarity index.

## Index documents

Put source files under `documents/`, or pass a file or directory path directly.
Supported formats are PDF, DOCX, PPTX, XLSX, HTML, Markdown, and plain text.

```bash
python services/docling/ingest.py documents/
python services/docling/ingest.py /path/to/architecture.docx
```

Unchanged files are skipped using a SHA-256 content hash. Re-ingesting a changed
file replaces its chunks in a single database transaction.

## Ask a question

```bash
python services/docling/query.py "What does the architecture document describe?"
```

The command embeds the question with the query prefix, retrieves the five
closest chunks, sends those sources and the question to Qwen3 4B, and prints the
answer with the retrieved source list. Set `RAG_TOP_K` to change the default
number of retrieved chunks (valid range: 1–20).

Optional local service settings:

```dotenv
OLLAMA_BASE_URL=http://127.0.0.1:11434
OLLAMA_EMBED_MODEL=qwen3-embedding:0.6b
OLLAMA_CHAT_MODEL=qwen3:4b
```

## Start the backend API and chat UI together

From the project root, start both the NestJS API and Next.js web app with one
command:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) for the chat UI; the NestJS
API runs on [http://localhost:3001](http://localhost:3001). Press Ctrl+C to stop
both processes. The launcher runs each app from its own directory and does not
require a root `npm install`.

The API expects the root `.venv-docling`, PostgreSQL, and Ollama to remain
available. See [apps/api/README.md](./apps/api/README.md) for endpoint details.
You can still run either app individually with `npm run dev:api` or
`npm run dev:web`.

To use different development ports, set `API_PORT` and/or `WEB_PORT`, for
example `API_PORT=3101 WEB_PORT=3100 npm run dev`.

## Current roadmap

1. Local model, Docling, PostgreSQL, and pgvector setup
2. Prove document ingestion, vector retrieval, and grounded generation
3. Expose the RAG pipeline through the NestJS API (implemented)
4. Connect the Next.js chat UI
5. Add the MCP knowledge server
