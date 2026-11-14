import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Content-Type': 'application/json',
};
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: cors });

const url = Deno.env.get('SUPABASE_URL')!;
const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
const db = createClient(url, serviceKey, { auth: { persistSession: false } });

Deno.serve(async (request) => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (request.method !== 'POST') return json({ error: 'POST required' }, 405);

  try {
    const body = await request.json();
    if (body.action === 'start') {
      const { data, error } = await db.from('merge_balls_sessions').insert({}).select('id, started_at').single();
      if (error) throw error;
      return json({ sessionId: data.id, startedAt: data.started_at });
    }

    if (body.action === 'submit') {
      const sessionId = String(body.sessionId || '');
      const nickname = String(body.nickname || '').trim().replace(/\s+/g, ' ').slice(0, 20);
      const score = Number(body.score);
      if (!/^[0-9a-f-]{36}$/.test(sessionId) || !nickname || !Number.isInteger(score) || score <= 0) {
        return json({ error: 'Invalid submission' }, 400);
      }

      const { data: session, error: sessionError } = await db
        .from('merge_balls_sessions').select('id, started_at, submitted_at').eq('id', sessionId).single();
      if (sessionError || !session || session.submitted_at) return json({ error: 'Session invalid or already used' }, 409);

      const elapsedSeconds = Math.max(1, (Date.now() - Date.parse(session.started_at)) / 1000);
      // A browser cannot submit an enormous score immediately. This is a server-side
      // sanity limit; full authoritative physics would require moving the game loop server-side.
      const maximumPlausibleScore = Math.floor(elapsedSeconds * 120) + 500;
      if (score > maximumPlausibleScore || score > 1000000) return json({ error: 'Score rejected' }, 422);

      const { error: insertError } = await db.from('merge_balls_scores').insert({ nickname, score });
      if (insertError) throw insertError;
      const { error: updateError } = await db.from('merge_balls_sessions').update({ finished_at: new Date().toISOString(), submitted_at: new Date().toISOString() }).eq('id', sessionId).is('submitted_at', null);
      if (updateError) throw updateError;
      return json({ ok: true });
    }
    return json({ error: 'Unknown action' }, 400);
  } catch (error) {
    console.error(error);
    return json({ error: 'Server error' }, 500);
  }
});
