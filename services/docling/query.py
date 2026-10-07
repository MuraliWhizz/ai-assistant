import argparse
import json
import os

import psycopg

from ingest import ensure_schema
from rag_utils import embed_texts, generate_answer, required_setting, vector_literal


def retrieve(question: str, limit: int) -> list[tuple[str, int, str, float]]:
    database_url = required_setting("DATABASE_URL")
    query_embedding = embed_texts([question], prefix="search_query: ")[0]
    with psycopg.connect(database_url) as connection:
        ensure_schema(connection)
        rows = connection.execute(
            """
            SELECT documents.source_path, chunks.chunk_index, chunks.content,
                   1 - (chunks.embedding <=> %s::vector) AS similarity
            FROM rag_chunks AS chunks
            JOIN rag_documents AS documents ON documents.id = chunks.document_id
            ORDER BY chunks.embedding <=> %s::vector
            LIMIT %s
            """,
            (vector_literal(query_embedding), vector_literal(query_embedding), limit),
        ).fetchall()
    return [(row[0], row[1], row[2], float(row[3])) for row in rows]


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Retrieve document context from pgvector and ask the local Ollama model."
    )
    parser.add_argument("question", help="Question to answer from indexed documents")
    parser.add_argument(
        "--top-k",
        type=int,
        default=int(os.getenv("RAG_TOP_K", "5")),
        help="Number of similar chunks to retrieve (1-20; default: RAG_TOP_K or 5)",
    )
    parser.add_argument(
        "--json", action="store_true", help="Print the answer and sources as JSON"
    )
    args = parser.parse_args()
    question = args.question.strip()
    if not question:
        parser.error("question must not be empty")
    if not 1 <= args.top_k <= 20:
        parser.error("--top-k must be between 1 and 20")

    results = retrieve(question, args.top_k)
    if not results:
        raise RuntimeError("No indexed chunks found. Ingest documents before querying.")

    context_parts = []
    for index, (source, chunk_index, content, _similarity) in enumerate(
        results, start=1
    ):
        context_parts.append(
            f"[{index}] Source: {source} (chunk {chunk_index})\n{content}"
        )

    answer = generate_answer(question, "\n\n".join(context_parts))
    sources = [
        {
            "source": source,
            "chunk": chunk_index,
            "similarity": similarity,
        }
        for source, chunk_index, _content, similarity in results
    ]
    if args.json:
        print(json.dumps({"answer": answer, "sources": sources}))
    else:
        print(f"\nAnswer:\n{answer}\n\nRetrieved sources:")
        for index, source in enumerate(sources, start=1):
            print(
                f"[{index}] {source['source']} (chunk {source['chunk']}; "
                f"cosine similarity {source['similarity']:.4f})"
            )


if __name__ == "__main__":
    main()
