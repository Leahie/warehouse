import json
import unittest
from pathlib import Path

from matcher import match_receipt

ROOT = Path(__file__).resolve().parents[2]


def _load(*parts: str) -> dict:
    return json.loads((ROOT.joinpath(*parts)).read_text())


class MatchReceiptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.papers = {
            "purchase_order": _load("data", "inbox", "docs", "PO-4419.json"),
            "bill_of_lading": _load("data", "inbox", "docs", "BOL-8821.json"),
            "packing_slip": _load("data", "inbox", "docs", "PACK-3301.json"),
        }

    def test_short_ship_asks_about_quantity(self) -> None:
        voice = _load("data", "inbox", "voice", "EVT-001.json")["parsed"]
        result = match_receipt(self.papers, voice)
        self.assertEqual(result.suggested_status, "pending_clarification")
        self.assertEqual(result.clarification_kind, "quantity")
        self.assertEqual(result.quantity_expected, 50)
        self.assertEqual(result.quantity_received, 40)
        self.assertTrue(any(row["field"] == "quantity" for row in result.mismatches))
        self.assertIn("40", result.clarification_question)
        self.assertIn("50", result.clarification_question)

    def test_clean_strawberry_commits(self) -> None:
        papers = {
            "purchase_order": _load("data", "inbox", "docs", "PO-4420.json"),
            "bill_of_lading": _load("data", "inbox", "docs", "BOL-8822.json"),
            "packing_slip": _load("data", "inbox", "docs", "PACK-3302.json"),
        }
        voice = _load("data", "inbox", "voice", "EVT-003.json")["parsed"]
        result = match_receipt(papers, voice)
        self.assertEqual(result.suggested_status, "committed")
        self.assertEqual(result.mismatches, [])
        self.assertIsNone(result.clarification_question)


if __name__ == "__main__":
    unittest.main()
