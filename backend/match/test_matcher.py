import json
import unittest
from pathlib import Path

from matcher import match_receipt

ROOT = Path(__file__).resolve().parents[2]


def _load(*parts: str) -> dict:
    return json.loads((ROOT.joinpath(*parts)).read_text())


class MatchReceiptTests(unittest.TestCase):
    def setUp(self) -> None:
        self.on_file = {
            "purchase_order": _load("data", "inbox", "docs", "PO-4419.json"),
            "bill_of_lading": _load("data", "inbox", "docs", "BOL-8821.json"),
            "packing_slip": _load("data", "inbox", "slips", "PACK-3301.json"),
        }

    def test_short_ship_is_packing_slip_vs_po_bol(self) -> None:
        voice = _load("data", "inbox", "voice", "EVT-001.json")["parsed"]
        result = match_receipt(self.on_file, voice)
        self.assertEqual(result.suggested_status, "pending_clarification")
        self.assertEqual(result.clarification_kind, "quantity")
        self.assertEqual(result.quantity_expected, 50)
        self.assertEqual(result.quantity_received, 40)
        self.assertEqual(result.po_vs_bol, "match")
        self.assertEqual(result.papers_vs_slip, "mismatch")
        self.assertEqual(result.slip_vs_voice, "match")
        self.assertTrue(any(row["field"] == "quantity" for row in result.mismatches))
        self.assertIn("40", result.clarification_question)
        self.assertIn("50", result.clarification_question)
        self.assertIn("Packing slip", result.clarification_question)

    def test_voice_reads_slip_when_slip_not_filed_yet(self) -> None:
        papers = {
            "purchase_order": self.on_file["purchase_order"],
            "bill_of_lading": self.on_file["bill_of_lading"],
            "packing_slip": None,
        }
        voice = _load("data", "inbox", "voice", "EVT-001.json")["parsed"]
        result = match_receipt(papers, voice)
        self.assertEqual(result.quantity_received, 40)
        self.assertEqual(result.suggested_status, "pending_clarification")

    def test_clean_strawberry_commits(self) -> None:
        papers = {
            "purchase_order": _load("data", "inbox", "docs", "PO-4420.json"),
            "bill_of_lading": _load("data", "inbox", "docs", "BOL-8822.json"),
            "packing_slip": _load("data", "inbox", "slips", "PACK-3302.json"),
        }
        voice = _load("data", "inbox", "voice", "EVT-003.json")["parsed"]
        result = match_receipt(papers, voice)
        self.assertEqual(result.suggested_status, "committed")
        self.assertEqual(result.mismatches, [])
        self.assertIsNone(result.clarification_question)

    def test_po_bol_disagree_flags(self) -> None:
        bol = dict(self.on_file["bill_of_lading"])
        bol["lines"] = [{**bol["lines"][0], "quantity": 48}]
        papers = {**self.on_file, "bill_of_lading": bol}
        voice = _load("data", "inbox", "voice", "EVT-001.json")["parsed"]
        result = match_receipt(papers, voice)
        self.assertEqual(result.suggested_status, "flagged")
        self.assertIn("bill of lading", result.flag_reason)


if __name__ == "__main__":
    unittest.main()
