const { createClient } = require('@supabase/supabase-js');
const fs = require('fs');

require('dotenv').config();

const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function dumpConstraints() {
  const { data, error } = await supabase.rpc('get_foreign_keys');
  
  if (error) {
    console.error('RPC failed, trying raw query via pg_catalog if possible');
    // We cannot run raw queries via the supabase JS client without RPC.
    // Let's create an artifact that describes the likely issue.
    console.log(error);
  } else {
    console.log(JSON.stringify(data, null, 2));
  }
}

dumpConstraints();
