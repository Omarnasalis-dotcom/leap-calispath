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

async function probe() {
  console.log('Probing tournament_sessions table...');
  const { data, error } = await supabase
    .from('tournament_sessions')
    .select('*')
    .limit(1);

  if (error) {
    console.error('PROBE_ERROR', error);
    return;
  }

  if (data && data.length > 0) {
    console.log('COLUMNS:', Object.keys(data[0]));
    console.log('Sample data:', data[0]);
  } else {
    console.log('TABLE_EMPTY_OR_NOT_FOUND');
  }
}

probe();
