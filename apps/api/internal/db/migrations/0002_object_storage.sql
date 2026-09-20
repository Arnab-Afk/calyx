ALTER TABLE chat_uploads
  ALTER COLUMN data DROP NOT NULL,
  ADD COLUMN object_key TEXT,
  ADD COLUMN storage_status TEXT NOT NULL DEFAULT 'legacy'
    CHECK (storage_status IN ('legacy', 'pending', 'ready', 'failed'));

CREATE UNIQUE INDEX chat_uploads_object_key
  ON chat_uploads (object_key) WHERE object_key IS NOT NULL;

CREATE TABLE chat_object_deletions (
  object_key   TEXT PRIMARY KEY,
  attempts     INTEGER NOT NULL DEFAULT 0,
  available_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  last_error   TEXT,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION enqueue_chat_object_deletion()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.object_key IS NOT NULL THEN
    INSERT INTO chat_object_deletions (object_key)
    VALUES (OLD.object_key)
    ON CONFLICT (object_key) DO NOTHING;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER chat_upload_object_deletion
AFTER DELETE ON chat_uploads
FOR EACH ROW EXECUTE FUNCTION enqueue_chat_object_deletion();

ALTER TABLE chat_messages
  ADD COLUMN upload_id UUID REFERENCES chat_uploads(id) ON DELETE SET NULL;

UPDATE chat_messages m
SET upload_id = u.id
FROM chat_uploads u
WHERE m.image_url = '/v1/uploads/' || u.id::text;

CREATE OR REPLACE FUNCTION delete_chat_message_upload()
RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.upload_id IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM chat_messages WHERE upload_id = OLD.upload_id
  ) THEN
    DELETE FROM chat_uploads WHERE id = OLD.upload_id;
  END IF;
  RETURN OLD;
END;
$$;

CREATE TRIGGER chat_message_upload_deletion
AFTER DELETE ON chat_messages
FOR EACH ROW EXECUTE FUNCTION delete_chat_message_upload();
