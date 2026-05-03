-- Allows any session participant to update platform_links.youtube on a queue item.
-- SECURITY DEFINER bypasses RLS (which only allows DJ/host to UPDATE queue_items),
-- but the function enforces its own participant membership check.
CREATE OR REPLACE FUNCTION patch_youtube_link(p_item_id uuid, p_youtube_url text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE queue_items
  SET platform_links = jsonb_set(
    COALESCE(platform_links, '{}'),
    '{youtube}',
    to_jsonb(p_youtube_url)
  )
  WHERE id = p_item_id
    AND EXISTS (
      SELECT 1 FROM session_participants sp
      WHERE sp.session_id = queue_items.session_id
        AND sp.user_id = auth.uid()
    );
END;
$$;
