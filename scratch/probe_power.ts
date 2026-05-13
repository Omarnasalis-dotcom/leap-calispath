import { supabase } from '../src/lib/supabase';

async function probe() {
  const { data, error } = await supabase
    .from('power_assessments')
    .select('*')
    .limit(1);

  if (error) {
    console.error('PROBE ERROR:', error);
  } else {
    console.log('POWER ASSESSMENT SCHEMA:', data ? Object.keys(data[0]) : 'No data found');
  }
}

probe();
