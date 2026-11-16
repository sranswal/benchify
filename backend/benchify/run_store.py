import logging
import os
from contextlib import contextmanager
from datetime import datetime, timezone
from uuid import UUID, uuid4

from fastapi import HTTPException

logger = logging.getLogger(__name__)


@contextmanager
def connect():
    dsn = os.getenv("DATABASE_URL")
    if not dsn:
        raise HTTPException(503, "Set DATABASE_URL to your Neon connection string to use run history.")
    try:
        import psycopg
    except ModuleNotFoundError as exc:
        raise HTTPException(503, "Install the backend requirements to enable Neon storage.") from exc

    try:
        with psycopg.connect(dsn, connect_timeout=8) as connection:
            connection.execute("SET LOCAL statement_timeout = '10s'")
            connection.execute("SET LOCAL lock_timeout = '5s'")
            yield connection
    except psycopg.Error as exc:
        raise HTTPException(503, "Benchmark storage is unavailable. Check the Neon connection and schema permissions.") from exc


def initialize(connection):
    connection.execute("SELECT pg_advisory_xact_lock(91277401)")
    connection.execute("""
        CREATE TABLE IF NOT EXISTS benchify_runs (
            id uuid PRIMARY KEY,
            created_at timestamptz NOT NULL,
            record jsonb NOT NULL
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS benchify_attempts (
            run_id uuid NOT NULL REFERENCES benchify_runs(id) ON DELETE CASCADE,
            position integer NOT NULL,
            record jsonb NOT NULL,
            PRIMARY KEY (run_id, position)
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS benchify_events (
            run_id uuid NOT NULL,
            attempt_position integer NOT NULL,
            sequence integer NOT NULL,
            record jsonb NOT NULL,
            PRIMARY KEY (run_id, attempt_position, sequence),
            FOREIGN KEY (run_id, attempt_position) REFERENCES benchify_attempts(run_id, position) ON DELETE CASCADE
        )
    """)
    connection.execute("""
        CREATE TABLE IF NOT EXISTS benchify_jobs (
            run_id uuid PRIMARY KEY REFERENCES benchify_runs(id) ON DELETE CASCADE,
            position integer NOT NULL DEFAULT 0,
            lease_token uuid,
            lease_until timestamptz
        )
    """)


def prepare():
    with connect() as connection:
        initialize(connection)


def enqueue(run):
    with connect() as connection:
        from psycopg.types.json import Jsonb

        initialize(connection)
        run_id = UUID(run["id"])
        summary = {key: value for key, value in run.items() if key != "attempts"}
        summary.update(status="queued", completed_attempts=0)
        connection.execute(
            "INSERT INTO benchify_runs (id, created_at, record) VALUES (%s, %s, %s)",
            (run_id, datetime.fromisoformat(run["created_at"]), Jsonb(summary)),
        )
        connection.execute("INSERT INTO benchify_jobs (run_id) VALUES (%s)", (run_id,))
        return {**summary, "attempts": []}


def claim():
    token = uuid4()
    with connect() as connection:
        row = connection.execute("""
            SELECT job.run_id, job.position, run.record, job.lease_token IS NOT NULL
            FROM benchify_jobs job JOIN benchify_runs run ON run.id = job.run_id
            WHERE job.lease_until IS NULL OR job.lease_until <= now()
            ORDER BY run.created_at, job.run_id
            LIMIT 1 FOR UPDATE OF job SKIP LOCKED
        """).fetchone()
        if row is None:
            return None
        run_id, position, record, recovered = row
        connection.execute("""
            UPDATE benchify_jobs SET lease_token = %s, lease_until = now() + interval '120 seconds'
            WHERE run_id = %s
        """, (token, run_id))
        update_progress(connection, run_id, "running", position)
    if recovered:
        logger.warning("Reclaimed benchmark lease run_id=%s position=%s", run_id, position)
    return run_id, position, record, token


def update_progress(connection, run_id, status, position, error=None):
    from psycopg.types.json import Jsonb

    patch = {"status": status, "completed_attempts": position}
    if error:
        patch["error"] = error
    connection.execute("UPDATE benchify_runs SET record = record || %s WHERE id = %s", (Jsonb(patch), run_id))


def checkpoint(run_id, position, token, *, result=None, finished=False, error=None):
    with connect() as connection:
        from psycopg.types.json import Jsonb

        job = connection.execute("""
            SELECT 1 FROM benchify_jobs
            WHERE run_id = %s AND position = %s AND lease_token = %s AND lease_until > clock_timestamp()
            FOR UPDATE
        """, (run_id, position, token)).fetchone()
        if job is None:
            return False
        if result is not None:
            record = {key: value for key, value in result.items() if key != "events"}
            connection.execute(
                "INSERT INTO benchify_attempts (run_id, position, record) VALUES (%s, %s, %s)",
                (run_id, position, Jsonb(record)),
            )
            with connection.cursor() as cursor:
                cursor.executemany(
                    "INSERT INTO benchify_events (run_id, attempt_position, sequence, record) VALUES (%s, %s, %s, %s)",
                    [(run_id, position, seq, Jsonb(event)) for seq, event in enumerate(result["events"])],
                )
            position += 1
        if finished or error:
            connection.execute("DELETE FROM benchify_jobs WHERE run_id = %s", (run_id,))
        else:
            connection.execute("""
                UPDATE benchify_jobs SET position = %s, lease_token = NULL, lease_until = NULL WHERE run_id = %s
            """, (position, run_id))
        status = "failed" if error else "completed" if finished else "running"
        update_progress(connection, run_id, status, position, error)
    return True


def history():
    with connect() as connection:
        initialize(connection)
        rows = connection.execute("SELECT record FROM benchify_runs ORDER BY created_at DESC LIMIT 30")
        return [row[0] for row in rows.fetchall()]


def get(run_id: UUID, *, include_recordings=False):
    with connect() as connection:
        initialize(connection)
        row = connection.execute("SELECT record FROM benchify_runs WHERE id = %s FOR SHARE", (run_id,)).fetchone()
        if row is None:
            raise HTTPException(404, "Benchmark run not found.")
        attempts = connection.execute("""
            SELECT position,
                CASE WHEN %s THEN record ELSE (record - 'recording') ||
                    CASE WHEN (record->'recording'->>'expires_at')::timestamptz > now()
                    THEN jsonb_build_object('capture', jsonb_build_object(
                        'id', record->'recording'->'id',
                        'captured_at', record->'recording'->'captured_at',
                        'expires_at', record->'recording'->'expires_at'
                    ), 'capture_status', 'complete')
                    WHEN record ? 'recording' THEN '{"capture_status":"expired"}'::jsonb
                    ELSE '{}'::jsonb END
                END
            FROM benchify_attempts WHERE run_id = %s ORDER BY position
        """, (include_recordings, run_id))
        events = connection.execute(
            "SELECT attempt_position, record FROM benchify_events WHERE run_id = %s ORDER BY attempt_position, sequence",
            (run_id,))
        by_position = {}
        for position, event in events.fetchall():
            by_position.setdefault(position, []).append(event)
        results = []
        for position, attempt in attempts.fetchall():
            recording = attempt.pop("recording", None)
            if recording and datetime.fromisoformat(recording["expires_at"]) > datetime.now(timezone.utc):
                attempt["capture_status"] = "complete"
                attempt["capture"] = {key: recording[key] for key in ("id", "captured_at", "expires_at")}
                if include_recordings:
                    attempt["recording"] = recording
            elif recording:
                attempt["capture_status"] = "expired"
            results.append({**attempt, "events": by_position.get(position, [])})
        return {**row[0], "attempts": results}


def get_recording(run_id: UUID, attempt_id: UUID):
    with connect() as connection:
        initialize(connection)
        row = connection.execute("""
            SELECT record->'recording' FROM benchify_attempts
            WHERE run_id = %s AND record->>'id' = %s
                AND (record->'recording'->>'expires_at')::timestamptz > now()
        """, (run_id, str(attempt_id))).fetchone()
    if row is None:
        raise HTTPException(404, "Attempt recording is missing or expired.")
    return row[0]


def delete_recording(run_id: UUID, attempt_id: UUID):
    with connect() as connection:
        initialize(connection)
        deleted = connection.execute("""
            UPDATE benchify_attempts SET record = (record - 'recording') || '{"capture_status":"deleted"}'::jsonb
            WHERE run_id = %s AND record->>'id' = %s AND record ? 'recording'
        """, (run_id, str(attempt_id))).rowcount
    if not deleted:
        raise HTTPException(404, "Attempt recording is missing or expired.")


def purge_expired_recordings():
    with connect() as connection:
        connection.execute("SET LOCAL statement_timeout = '5s'")
        connection.execute("""
            WITH expired AS (
                SELECT run_id, position FROM benchify_attempts
                WHERE record ? 'recording'
                    AND (record->'recording'->>'expires_at')::timestamptz <= now()
                LIMIT 100 FOR UPDATE SKIP LOCKED
            )
            UPDATE benchify_attempts AS attempt
            SET record = (attempt.record - 'recording') || '{"capture_status":"expired"}'::jsonb
            FROM expired
            WHERE attempt.run_id = expired.run_id AND attempt.position = expired.position
        """)
