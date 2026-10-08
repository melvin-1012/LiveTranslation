-- 001_initial_translation_schema.sql

-- Create extension for pgcrypto if needed (gen_random_uuid is built-in for modern PG)

-- ==========================================
-- 1. supported_languages
-- ==========================================
CREATE TABLE IF NOT EXISTS public.supported_languages (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    code TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    native_name TEXT,
    is_indic BOOLEAN DEFAULT false,
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.supported_languages ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 2. profiles & auth integration
-- ==========================================
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    display_name TEXT,
    email TEXT,
    preferred_source_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    preferred_target_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Trigger to auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.profiles (id, email)
    VALUES (new.id, new.email)
    ON CONFLICT (id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$ 
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_auth_user_created') THEN
        CREATE TRIGGER on_auth_user_created
        AFTER INSERT ON auth.users
        FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
    END IF;
END $$;

-- Trigger to auto-update updated_at
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS trigger AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'on_profile_updated') THEN
        CREATE TRIGGER on_profile_updated
        BEFORE UPDATE ON public.profiles
        FOR EACH ROW EXECUTE FUNCTION public.handle_updated_at();
    END IF;
END $$;

-- ==========================================
-- 3. translation_sessions
-- ==========================================
CREATE TABLE IF NOT EXISTS public.translation_sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    source_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    target_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    mode TEXT CHECK (mode IN ('one_way', 'two_way')),
    status TEXT CHECK (status IN ('active', 'paused', 'completed', 'cancelled', 'error')),
    started_at TIMESTAMPTZ DEFAULT now(),
    ended_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.translation_sessions ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_translation_sessions_user_id ON public.translation_sessions(user_id);
CREATE INDEX idx_translation_sessions_status ON public.translation_sessions(status);
CREATE INDEX idx_translation_sessions_started_at ON public.translation_sessions(started_at);

-- ==========================================
-- 4. session_participants
-- ==========================================
CREATE TABLE IF NOT EXISTS public.session_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.translation_sessions(id) ON DELETE CASCADE,
    participant_label TEXT NOT NULL,
    role TEXT CHECK (role IN ('speaker', 'listener', 'both')),
    preferred_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.session_participants ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_session_participants_session_id ON public.session_participants(session_id);

-- ==========================================
-- 5. utterances
-- ==========================================
CREATE TABLE IF NOT EXISTS public.utterances (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID NOT NULL REFERENCES public.translation_sessions(id) ON DELETE CASCADE,
    participant_id UUID REFERENCES public.session_participants(id) ON DELETE SET NULL,
    sequence_number INTEGER NOT NULL CHECK (sequence_number >= 0),
    detected_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    source_text TEXT,
    is_code_mixed BOOLEAN DEFAULT false,
    confidence NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),
    started_at TIMESTAMPTZ,
    speech_end_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE (session_id, sequence_number)
);
ALTER TABLE public.utterances ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_utterances_session_id ON public.utterances(session_id);
CREATE INDEX idx_utterances_detected_lang ON public.utterances(detected_language_id);

-- ==========================================
-- 6. utterance_segments
-- ==========================================
CREATE TABLE IF NOT EXISTS public.utterance_segments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utterance_id UUID NOT NULL REFERENCES public.utterances(id) ON DELETE CASCADE,
    sequence_number INTEGER NOT NULL CHECK (sequence_number >= 0),
    language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    text TEXT NOT NULL,
    start_offset_ms INTEGER CHECK (start_offset_ms >= 0),
    end_offset_ms INTEGER CHECK (end_offset_ms >= 0),
    confidence NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE (utterance_id, sequence_number),
    CHECK (end_offset_ms IS NULL OR start_offset_ms IS NULL OR end_offset_ms >= start_offset_ms)
);
ALTER TABLE public.utterance_segments ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_utterance_segments_utterance_id ON public.utterance_segments(utterance_id, sequence_number);

-- ==========================================
-- 7. asr_results
-- ==========================================
CREATE TABLE IF NOT EXISTS public.asr_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utterance_id UUID NOT NULL REFERENCES public.utterances(id) ON DELETE CASCADE,
    model_name TEXT NOT NULL,
    model_version TEXT,
    transcript TEXT NOT NULL,
    language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    confidence NUMERIC(5,4) CHECK (confidence >= 0 AND confidence <= 1),
    processing_latency_ms INTEGER CHECK (processing_latency_ms >= 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.asr_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_asr_results_utterance_id ON public.asr_results(utterance_id);

-- ==========================================
-- 8. translation_results
-- ==========================================
CREATE TABLE IF NOT EXISTS public.translation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    utterance_id UUID NOT NULL REFERENCES public.utterances(id) ON DELETE CASCADE,
    source_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    target_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    model_name TEXT NOT NULL,
    model_version TEXT,
    translated_text TEXT NOT NULL,
    translation_status TEXT NOT NULL CHECK (translation_status IN ('partial', 'final', 'corrected', 'error')),
    is_final BOOLEAN DEFAULT false,
    version_number INTEGER NOT NULL DEFAULT 1 CHECK (version_number > 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    first_token_at TIMESTAMPTZ,
    completed_at TIMESTAMPTZ,
    metadata JSONB DEFAULT '{}'::jsonb,
    UNIQUE (utterance_id, version_number)
);
ALTER TABLE public.translation_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_translation_results_utterance_id ON public.translation_results(utterance_id, version_number);
CREATE INDEX idx_translation_results_is_final ON public.translation_results(utterance_id, is_final);
CREATE INDEX idx_translation_results_created_at ON public.translation_results(created_at);

-- ==========================================
-- 9. translation_metrics
-- ==========================================
CREATE TABLE IF NOT EXISTS public.translation_metrics (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    translation_result_id UUID NOT NULL UNIQUE REFERENCES public.translation_results(id) ON DELETE CASCADE,
    time_to_first_translation_ms INTEGER CHECK (time_to_first_translation_ms >= 0),
    end_to_end_latency_ms INTEGER CHECK (end_to_end_latency_ms >= 0),
    translation_processing_ms INTEGER CHECK (translation_processing_ms >= 0),
    asr_latency_ms INTEGER CHECK (asr_latency_ms >= 0),
    segmentation_latency_ms INTEGER CHECK (segmentation_latency_ms >= 0),
    caption_rewrite_count INTEGER DEFAULT 0 CHECK (caption_rewrite_count >= 0),
    caption_stability_score NUMERIC(6,4) CHECK (caption_stability_score >= 0 AND caption_stability_score <= 1),
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.translation_metrics ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 10. baseline_runs
-- ==========================================
CREATE TABLE IF NOT EXISTS public.baseline_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    model_name TEXT,
    model_version TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    metadata JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.baseline_runs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 11. baseline_results
-- ==========================================
CREATE TABLE IF NOT EXISTS public.baseline_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    baseline_run_id UUID NOT NULL REFERENCES public.baseline_runs(id) ON DELETE CASCADE,
    utterance_id UUID REFERENCES public.utterances(id) ON DELETE SET NULL,
    source_text TEXT,
    translated_text TEXT,
    time_to_first_translation_ms INTEGER CHECK (time_to_first_translation_ms >= 0),
    end_to_end_latency_ms INTEGER CHECK (end_to_end_latency_ms >= 0),
    quality_score NUMERIC(6,4),
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.baseline_results ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 12. evaluation_datasets
-- ==========================================
CREATE TABLE IF NOT EXISTS public.evaluation_datasets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    dataset_type TEXT CHECK (dataset_type IN ('development', 'validation', 'held_out', 'demo')),
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.evaluation_datasets ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 13. evaluation_samples
-- ==========================================
CREATE TABLE IF NOT EXISTS public.evaluation_samples (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    dataset_id UUID REFERENCES public.evaluation_datasets(id) ON DELETE CASCADE,
    source_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    target_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    source_text TEXT NOT NULL,
    reference_translation TEXT NOT NULL,
    is_code_mixed BOOLEAN DEFAULT false,
    contains_name BOOLEAN DEFAULT false,
    contains_number BOOLEAN DEFAULT false,
    contains_domain_term BOOLEAN DEFAULT false,
    noise_level TEXT,
    accent_notes TEXT,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.evaluation_samples ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_eval_samples_langs ON public.evaluation_samples(source_language_id, target_language_id);

-- ==========================================
-- 14. evaluation_results
-- ==========================================
CREATE TABLE IF NOT EXISTS public.evaluation_results (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    evaluation_sample_id UUID NOT NULL REFERENCES public.evaluation_samples(id) ON DELETE CASCADE,
    model_name TEXT,
    model_version TEXT,
    predicted_translation TEXT,
    bleu_score NUMERIC(8,4) CHECK (bleu_score >= 0),
    chrf_score NUMERIC(8,4) CHECK (chrf_score >= 0),
    adequacy_score NUMERIC(8,4) CHECK (adequacy_score >= 0),
    time_to_first_translation_ms INTEGER CHECK (time_to_first_translation_ms >= 0),
    end_to_end_latency_ms INTEGER CHECK (end_to_end_latency_ms >= 0),
    caption_rewrite_count INTEGER CHECK (caption_rewrite_count >= 0),
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.evaluation_results ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_eval_results_sample_id ON public.evaluation_results(evaluation_sample_id);

-- ==========================================
-- 15. glossary_terms
-- ==========================================
CREATE TABLE IF NOT EXISTS public.glossary_terms (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    source_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    target_language_id UUID REFERENCES public.supported_languages(id) ON DELETE SET NULL,
    source_term TEXT NOT NULL,
    target_term TEXT NOT NULL,
    term_type TEXT CHECK (term_type IN ('name', 'place', 'technical', 'medical', 'organization', 'number', 'general')),
    description TEXT,
    is_active BOOLEAN DEFAULT true,
    created_by UUID REFERENCES public.profiles(id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.glossary_terms ENABLE ROW LEVEL SECURITY;
CREATE INDEX idx_glossary_langs ON public.glossary_terms(source_language_id, target_language_id);
CREATE INDEX idx_glossary_created_by ON public.glossary_terms(created_by);

-- ==========================================
-- 16. audio_assets
-- ==========================================
CREATE TABLE IF NOT EXISTS public.audio_assets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    session_id UUID REFERENCES public.translation_sessions(id) ON DELETE CASCADE,
    utterance_id UUID REFERENCES public.utterances(id) ON DELETE CASCADE,
    storage_path TEXT NOT NULL,
    duration_ms INTEGER CHECK (duration_ms >= 0),
    format TEXT,
    sample_rate INTEGER CHECK (sample_rate >= 0),
    created_at TIMESTAMPTZ DEFAULT now(),
    CHECK (session_id IS NOT NULL)
);
ALTER TABLE public.audio_assets ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 17. experiments
-- ==========================================
CREATE TABLE IF NOT EXISTS public.experiments (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    description TEXT,
    configuration JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);
ALTER TABLE public.experiments ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- 18. experiment_runs
-- ==========================================
CREATE TABLE IF NOT EXISTS public.experiment_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    experiment_id UUID REFERENCES public.experiments(id) ON DELETE CASCADE,
    session_id UUID REFERENCES public.translation_sessions(id) ON DELETE SET NULL,
    started_at TIMESTAMPTZ DEFAULT now(),
    completed_at TIMESTAMPTZ,
    status TEXT,
    metrics JSONB DEFAULT '{}'::jsonb
);
ALTER TABLE public.experiment_runs ENABLE ROW LEVEL SECURITY;

-- ==========================================
-- RLS POLICIES
-- ==========================================

-- Profiles
CREATE POLICY "Users can view own profile" ON public.profiles FOR SELECT USING (auth.uid() = id);
CREATE POLICY "Users can update own profile" ON public.profiles FOR UPDATE USING (auth.uid() = id) WITH CHECK (auth.uid() = id);

-- Supported Languages
CREATE POLICY "Languages are readable by everyone" ON public.supported_languages FOR SELECT USING (true);
-- (No INSERT/UPDATE/DELETE policies, ensuring normal users cannot modify it. Backend Service Role bypasses this.)

-- Translation Sessions
CREATE POLICY "Users can view own sessions" ON public.translation_sessions FOR SELECT USING (auth.uid() = user_id);
CREATE POLICY "Users can insert own sessions" ON public.translation_sessions FOR INSERT WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can update own sessions" ON public.translation_sessions FOR UPDATE USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);
CREATE POLICY "Users can delete own sessions" ON public.translation_sessions FOR DELETE USING (auth.uid() = user_id);

-- Session Participants
CREATE POLICY "Users can view participants of own sessions" ON public.session_participants FOR SELECT USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert participants to own sessions" ON public.session_participants FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update participants of own sessions" ON public.session_participants FOR UPDATE USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
) WITH CHECK (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete participants of own sessions" ON public.session_participants FOR DELETE USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);

-- Utterances
CREATE POLICY "Users can view utterances of own sessions" ON public.utterances FOR SELECT USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert utterances to own sessions" ON public.utterances FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update utterances of own sessions" ON public.utterances FOR UPDATE USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
) WITH CHECK (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete utterances of own sessions" ON public.utterances FOR DELETE USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);

-- Utterance Segments
CREATE POLICY "Users can view utterance segments of own sessions" ON public.utterance_segments FOR SELECT USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can insert utterance segments to own sessions" ON public.utterance_segments FOR INSERT WITH CHECK (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can update utterance segments of own sessions" ON public.utterance_segments FOR UPDATE USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
) WITH CHECK (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can delete utterance segments of own sessions" ON public.utterance_segments FOR DELETE USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);

-- ASR Results
CREATE POLICY "Users can view ASR results of own sessions" ON public.asr_results FOR SELECT USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can insert ASR results to own sessions" ON public.asr_results FOR INSERT WITH CHECK (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can update ASR results of own sessions" ON public.asr_results FOR UPDATE USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
) WITH CHECK (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can delete ASR results of own sessions" ON public.asr_results FOR DELETE USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);

-- Translation Results
CREATE POLICY "Users can view translation results of own sessions" ON public.translation_results FOR SELECT USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can insert translation results to own sessions" ON public.translation_results FOR INSERT WITH CHECK (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can update translation results of own sessions" ON public.translation_results FOR UPDATE USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
) WITH CHECK (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);
CREATE POLICY "Users can delete translation results of own sessions" ON public.translation_results FOR DELETE USING (
    utterance_id IN (SELECT u.id FROM public.utterances u JOIN public.translation_sessions s ON u.session_id = s.id WHERE s.user_id = auth.uid())
);

-- Translation Metrics
CREATE POLICY "Users can view metrics of own sessions" ON public.translation_metrics FOR SELECT USING (
    translation_result_id IN (
        SELECT tr.id FROM public.translation_results tr 
        JOIN public.utterances u ON tr.utterance_id = u.id 
        JOIN public.translation_sessions s ON u.session_id = s.id 
        WHERE s.user_id = auth.uid()
    )
);
CREATE POLICY "Users can insert metrics to own sessions" ON public.translation_metrics FOR INSERT WITH CHECK (
    translation_result_id IN (
        SELECT tr.id FROM public.translation_results tr 
        JOIN public.utterances u ON tr.utterance_id = u.id 
        JOIN public.translation_sessions s ON u.session_id = s.id 
        WHERE s.user_id = auth.uid()
    )
);
CREATE POLICY "Users can update metrics of own sessions" ON public.translation_metrics FOR UPDATE USING (
    translation_result_id IN (
        SELECT tr.id FROM public.translation_results tr 
        JOIN public.utterances u ON tr.utterance_id = u.id 
        JOIN public.translation_sessions s ON u.session_id = s.id 
        WHERE s.user_id = auth.uid()
    )
) WITH CHECK (
    translation_result_id IN (
        SELECT tr.id FROM public.translation_results tr 
        JOIN public.utterances u ON tr.utterance_id = u.id 
        JOIN public.translation_sessions s ON u.session_id = s.id 
        WHERE s.user_id = auth.uid()
    )
);
CREATE POLICY "Users can delete metrics of own sessions" ON public.translation_metrics FOR DELETE USING (
    translation_result_id IN (
        SELECT tr.id FROM public.translation_results tr 
        JOIN public.utterances u ON tr.utterance_id = u.id 
        JOIN public.translation_sessions s ON u.session_id = s.id 
        WHERE s.user_id = auth.uid()
    )
);

-- Audio Assets
CREATE POLICY "Users can view audio of own sessions" ON public.audio_assets FOR SELECT USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can insert audio to own sessions" ON public.audio_assets FOR INSERT WITH CHECK (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can update audio of own sessions" ON public.audio_assets FOR UPDATE USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
) WITH CHECK (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);
CREATE POLICY "Users can delete audio of own sessions" ON public.audio_assets FOR DELETE USING (
    session_id IN (SELECT id FROM public.translation_sessions WHERE user_id = auth.uid())
);

-- Glossary Terms
CREATE POLICY "Users can view own glossary terms" ON public.glossary_terms FOR SELECT USING (created_by = auth.uid());
CREATE POLICY "Users can insert own glossary terms" ON public.glossary_terms FOR INSERT WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can update own glossary terms" ON public.glossary_terms FOR UPDATE USING (created_by = auth.uid()) WITH CHECK (created_by = auth.uid());
CREATE POLICY "Users can delete own glossary terms" ON public.glossary_terms FOR DELETE USING (created_by = auth.uid());

-- Evaluation & Benchmark Data (Protected access)
-- Users can read development/demo evaluation sets, but not held_out or validation (backend restricted)
CREATE POLICY "Authenticated users can read demo evaluation datasets" ON public.evaluation_datasets FOR SELECT TO authenticated USING (dataset_type IN ('development', 'demo'));
CREATE POLICY "Authenticated users can read demo evaluation samples" ON public.evaluation_samples FOR SELECT TO authenticated USING (
    dataset_id IN (SELECT id FROM public.evaluation_datasets WHERE dataset_type IN ('development', 'demo'))
);
CREATE POLICY "Authenticated users can read demo evaluation results" ON public.evaluation_results FOR SELECT TO authenticated USING (
    evaluation_sample_id IN (
        SELECT id FROM public.evaluation_samples WHERE dataset_id IN (
            SELECT id FROM public.evaluation_datasets WHERE dataset_type IN ('development', 'demo')
        )
    )
);
-- Baseline runs, experiments, and results are only accessible by Service Role (no policies for normal users)
-- (No RLS policies created for normal users on these to keep them secure).

-- ==========================================
-- VIEWS 
-- ==========================================
CREATE OR REPLACE VIEW public.session_history_view WITH (security_invoker = true) AS
SELECT 
    s.id AS session_id,
    s.user_id,
    sl_src.name AS source_language,
    sl_tgt.name AS target_language,
    s.mode,
    s.status,
    s.started_at,
    s.ended_at,
    COUNT(u.id) AS total_utterances
FROM public.translation_sessions s
LEFT JOIN public.supported_languages sl_src ON s.source_language_id = sl_src.id
LEFT JOIN public.supported_languages sl_tgt ON s.target_language_id = sl_tgt.id
LEFT JOIN public.utterances u ON u.session_id = s.id
GROUP BY s.id, s.user_id, sl_src.name, sl_tgt.name, s.mode, s.status, s.started_at, s.ended_at;

CREATE OR REPLACE VIEW public.translation_performance_view WITH (security_invoker = true) AS
SELECT 
    tr.id AS translation_id,
    u.session_id,
    u.sequence_number,
    sl_src.name AS source_language,
    sl_tgt.name AS target_language,
    tr.translated_text,
    tr.is_final,
    tm.time_to_first_translation_ms,
    tm.end_to_end_latency_ms,
    tm.caption_rewrite_count,
    tm.caption_stability_score
FROM public.translation_results tr
JOIN public.utterances u ON tr.utterance_id = u.id
LEFT JOIN public.supported_languages sl_src ON tr.source_language_id = sl_src.id
LEFT JOIN public.supported_languages sl_tgt ON tr.target_language_id = sl_tgt.id
LEFT JOIN public.translation_metrics tm ON tm.translation_result_id = tr.id
WHERE tr.is_final = true;

CREATE OR REPLACE VIEW public.language_pair_performance_view WITH (security_invoker = true) AS
SELECT 
    sl_src.name AS source_language,
    sl_tgt.name AS target_language,
    COUNT(tr.id) AS number_of_samples,
    AVG(tm.time_to_first_translation_ms) AS avg_time_to_first_translation,
    AVG(tm.end_to_end_latency_ms) AS avg_end_to_end_latency,
    AVG(tm.caption_rewrite_count) AS avg_caption_rewrites,
    AVG(tm.caption_stability_score) AS avg_stability_score
FROM public.translation_results tr
JOIN public.translation_metrics tm ON tr.id = tm.translation_result_id
LEFT JOIN public.supported_languages sl_src ON tr.source_language_id = sl_src.id
LEFT JOIN public.supported_languages sl_tgt ON tr.target_language_id = sl_tgt.id
WHERE tr.is_final = true
GROUP BY sl_src.name, sl_tgt.name;
