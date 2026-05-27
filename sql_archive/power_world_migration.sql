-- Add Power World fields to profiles table
ALTER TABLE profiles 
ADD COLUMN power_pbs JSONB DEFAULT '{}',
ADD COLUMN power_points INT DEFAULT 0;

-- Update existing profiles to have default power_pbs structure
UPDATE profiles 
SET power_pbs = '{"pull_up": 0, "dip": 0, "squat": 0, "muscle_up": 0}'
WHERE power_pbs = '{}' OR power_pbs IS NULL;
