from pathlib import Path


def test_corrective_skip_vote_migration_handles_played_queue_items():
    migration = (
        Path(__file__).parents[1]
        / "migrations"
        / "versions"
        / "008_fix_played_queue_skip_vote.py"
    )

    assert migration.exists()
    source = migration.read_text()
    assert "IF v_status IN ('queued', 'played') THEN" in source
