"""Exercise the shipped SQLite migrations and the actual production SQL statements."""
import re
import sqlite3
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SERVER = (ROOT / "lib/server.ts").read_text()

def statement(prefix):
    return re.search(r'"(' + re.escape(prefix) + r'[^"\n]*)"', SERVER).group(1)

class PersistenceTests(unittest.TestCase):
    def setUp(self):
        self.db = sqlite3.connect(":memory:")
        for migration in sorted((ROOT / "drizzle").glob("*.sql")):
            self.db.executescript(migration.read_text())

    def test_owner_records_and_stale_revisions_are_isolated(self):
        insert = statement("INSERT INTO revenue_workspaces")
        self.db.execute(insert, ("owner-a", 1, '{"value":"A"}', "date"))
        self.db.execute(insert, ("owner-b", 1, '{"value":"B"}', "date"))
        read = statement("SELECT state,revision FROM revenue_workspaces")
        self.assertEqual(self.db.execute(read, ("owner-a",)).fetchone(), ('{"value":"A"}', 1))
        update = statement("UPDATE revenue_workspaces")
        winner = self.db.execute(update, ('{"value":"new"}', 2, "date", "owner-a", 1))
        self.assertEqual(winner.rowcount, 1)
        stale = self.db.execute(update, ('{"value":"stale"}', 2, "date", "owner-a", 1))
        self.assertEqual(stale.rowcount, 0)
        self.assertEqual(self.db.execute(read, ("owner-b",)).fetchone()[0], '{"value":"B"}')

    def test_daily_ai_limit_is_atomic_and_scoped_to_owner_and_day(self):
        reserve = statement("INSERT INTO revenue_ai_usage")
        call = lambda owner, day: self.db.execute(reserve, (owner, day, 2)).fetchone()
        self.assertEqual(call("a", "2026-10-31"), (1,))
        self.assertEqual(call("a", "2026-10-31"), (2,))
        self.assertIsNone(call("a", "2026-10-31"))
        self.assertEqual(call("b", "2026-10-31"), (1,))
        self.assertEqual(call("a", "2026-11-01"), (1,))

    def test_automatic_ai_and_publishing_jobs_cannot_be_created_twice(self):
        analysis = (ROOT / "lib/analysis.ts").read_text()
        sql = re.search(r'"(INSERT INTO revenue_ai_jobs[^"\n]*)"', analysis).group(1)
        first = self.db.execute(sql, ("a:data-hash", "a", "date"))
        self.assertEqual(first.rowcount, 1)
        second = self.db.execute(sql, ("a:data-hash", "a", "date"))
        self.assertEqual(second.rowcount, 0)
        publishing = (ROOT / "app/api/instagram/route.ts").read_text()
        sql = re.search(r'"(INSERT INTO revenue_external_operations[^"\n]*)"', publishing).group(1)
        self.assertEqual(self.db.execute(sql, ("a:content:hash", "a", "content", "date")).rowcount, 1)
        self.assertEqual(self.db.execute(sql, ("a:content:hash", "a", "content", "date")).rowcount, 0)

if __name__ == "__main__":
    unittest.main()
