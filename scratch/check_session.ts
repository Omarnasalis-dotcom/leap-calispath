import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';

// Load .env file
dotenv.config();

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

if (!supabaseUrl || !supabaseKey) {
  console.error('Missing EXPO_PUBLIC_SUPABASE_URL or EXPO_PUBLIC_SUPABASE_ANON_KEY');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatest() {
  console.log('Checking latest tournament session...');
  const { data: session, error } = await supabase
    .from('tournament_sessions')
    .select('*, config:tournament_configs(*)')
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error('ERROR', error);
    return;
  }

  if (session) {
    console.log('LATEST_SESSION_ID:', session.id);
    console.log('STATUS:', session.status);
    console.log('CONFIG:', JSON.stringify(session.config?.workout_config || {}, null, 2));
  } else {
    console.log('NO_SESSION_FOUND');
  }
}

checkLatest();
