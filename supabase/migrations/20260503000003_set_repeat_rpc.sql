-- Revert the overly broad DJ UPDATE policy — host-only for general session updates
DROP POLICY IF EXISTS "Sessions updatable by host or dj" ON sessions;
CREATE POLICY "Sessions updatable by host" ON sessions
  FOR UPDATE USING (auth.uid() = host_user_id);

-- DJ-scoped RPC: only updates the repeat column, enforces dj_user_id server-side
CREATE OR REPLACE FUNCTION set_session_repeat(p_session_id uuid, p_repeat boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER
AS $$
BEGIN
  UPDATE sessions SET repeat = p_repeat
  WHERE id = p_session_id AND dj_user_id = auth.uid();
END;
$$;

GRANT EXECUTE ON FUNCTION set_session_repeat TO authenticated;
