import unittest

from ingest import chunk_text
from rag_utils import EMBEDDING_DIMENSIONS, vector_literal


class ChunkTextTests(unittest.TestCase):
    def test_short_text_is_one_chunk(self) -> None:
        self.assertEqual(chunk_text("  alpha\nbeta  "), ["alpha\nbeta"])

    def test_long_text_obeys_size_and_overlaps(self) -> None:
        text = "a" * 2500
        chunks = chunk_text(text, chunk_size=1000, overlap=100)

        self.assertEqual([len(chunk) for chunk in chunks], [1000, 1000, 700])
        self.assertEqual(chunks[0][-100:], chunks[1][:100])
        self.assertEqual(chunks[1][-100:], chunks[2][:100])

    def test_invalid_overlap_is_rejected(self) -> None:
        with self.assertRaises(ValueError):
            chunk_text("text", chunk_size=10, overlap=10)


class VectorLiteralTests(unittest.TestCase):
    def test_serializes_expected_dimension(self) -> None:
        vector = [0.0] * EMBEDDING_DIMENSIONS
        self.assertTrue(vector_literal(vector).startswith("[0.0,"))
        self.assertTrue(vector_literal(vector).endswith("]"))

    def test_rejects_wrong_dimension(self) -> None:
        with self.assertRaises(ValueError):
            vector_literal([1.0])


if __name__ == "__main__":
    unittest.main()
