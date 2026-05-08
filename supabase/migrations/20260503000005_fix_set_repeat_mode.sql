-- Fix set_repeat_mode: add schema prefix, SET search_path, and NOT FOUND guard
-- Matches pattern of play_next, cast_skip_vote, pass_dj_token

CREATE OR REPLACE FUNCTION public.set_repeat_mode(p_session_id uuid, p_mode text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF p_mode NOT IN ('none', 'song', 'queue') THEN
    RAISE EXCEPTION 'Invalid repeat mode: %', p_mode;
  END IF;
  UPDATE sessions SET repeat_mode = p_mode
  WHERE id = p_session_id AND dj_user_id = auth.uid();
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Not authorized or session not found';
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.set_repeat_mode TO authenticated;
