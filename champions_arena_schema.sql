-- CHAMPIONS ARENA SCHEMA
-- Stores international calisthenics competitions and pro athlete benchmarks

-- 1. Arena Competitions (e.g., Leap World Series 2024)
CREATE TABLE public.arena_competitions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name TEXT NOT NULL,
    description TEXT,
    difficulty_tier INTEGER DEFAULT 8, -- Usually Titan/Demigod level
    category TEXT DEFAULT 'strength',
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Arena Phases (Quarter, Semi, Final)
CREATE TABLE public.arena_phases (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    competition_id UUID REFERENCES public.arena_competitions(id) ON DELETE CASCADE,
    name TEXT NOT NULL, -- 'Quarter Finals', 'Semi-Finals', 'The Final'
    order_index INTEGER NOT NULL,
    total_pro_benchmark_time INTEGER, -- The record time for this phase
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. Arena Workout Steps (The Circuits)
CREATE TABLE public.arena_workout_steps (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phase_id UUID REFERENCES public.arena_phases(id) ON DELETE CASCADE,
    movement_name TEXT NOT NULL,
    reps INTEGER,
    added_weight_kg INTEGER DEFAULT 0,
    is_unbroken BOOLEAN DEFAULT false,
    special_notes TEXT,
    order_index INTEGER NOT NULL
);

-- 4. Arena Pro Results (The Legends)
CREATE TABLE public.arena_pro_results (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    phase_id UUID REFERENCES public.arena_phases(id) ON DELETE CASCADE,
    athlete_name TEXT NOT NULL,
    time_seconds INTEGER NOT NULL,
    rank INTEGER NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. User Arena Attempts
CREATE TABLE public.arena_attempts (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    phase_id UUID REFERENCES public.arena_phases(id) ON DELETE CASCADE,
    time_seconds INTEGER NOT NULL,
    completed_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.arena_competitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_phases ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_workout_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_pro_results ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.arena_attempts ENABLE ROW LEVEL SECURITY;

-- Public Read Access for Arena Content
CREATE POLICY "Allow public read access for arena competitions" ON public.arena_competitions FOR SELECT USING (true);
CREATE POLICY "Allow public read access for arena phases" ON public.arena_phases FOR SELECT USING (true);
CREATE POLICY "Allow public read access for arena steps" ON public.arena_workout_steps FOR SELECT USING (true);
CREATE POLICY "Allow public read access for arena pro results" ON public.arena_pro_results FOR SELECT USING (true);

-- User Access for Attempts
CREATE POLICY "Users can view their own arena attempts" ON public.arena_attempts FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert their own arena attempts" ON public.arena_attempts FOR INSERT WITH CHECK (auth.uid() = user_id);
