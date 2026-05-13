const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(process.env.EXPO_PUBLIC_SUPABASE_URL, process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY);

async function check() {
  const { data, error } = await supabase
    .from('profiles')
    .select('display_name, statics_tier, power_points, one_mm_points')
    .in('display_name', ['OMARNASALIS', 'ADAMELHANBALY']);
  
  if (error) console.error(error);
  else console.log(JSON.stringify(data, null, 2));
}
check();
