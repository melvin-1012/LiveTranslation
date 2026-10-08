-- 002_seed_data.sql
-- Insert the supported languages
INSERT INTO public.supported_languages (code, name, native_name, is_indic, is_active)
VALUES
  ('en', 'English', 'English', false, true),
  ('ta', 'Tamil', 'தமிழ்', true, true),
  ('hi', 'Hindi', 'हिन्दी', true, true),
  ('te', 'Telugu', 'తెలుగు', true, true),
  ('kn', 'Kannada', 'ಕನ್ನಡ', true, true),
  ('ml', 'Malayalam', 'മലയാളം', true, true)
ON CONFLICT (code) DO NOTHING;

-- Create a development evaluation dataset
INSERT INTO public.evaluation_datasets (id, name, description, dataset_type)
VALUES (
  '11111111-1111-1111-1111-111111111111', 
  'Development Seed Dataset', 
  'Initial dataset covering basic scenarios for English, Tamil, Hindi, and Code-Mixing',
  'development'
) ON CONFLICT (id) DO NOTHING;

-- Retrieve language IDs for seeding samples (using DO block to handle variables safely)
DO $$
DECLARE
    en_id UUID;
    ta_id UUID;
    hi_id UUID;
BEGIN
    SELECT id INTO en_id FROM public.supported_languages WHERE code = 'en';
    SELECT id INTO ta_id FROM public.supported_languages WHERE code = 'ta';
    SELECT id INTO hi_id FROM public.supported_languages WHERE code = 'hi';

    -- Seed evaluation samples if English and Tamil are present
    IF en_id IS NOT NULL AND ta_id IS NOT NULL THEN
        -- English to Tamil
        INSERT INTO public.evaluation_samples (id, dataset_id, source_language_id, target_language_id, source_text, reference_translation, is_code_mixed, contains_name, contains_number, contains_domain_term)
        VALUES (
            '22222222-1111-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', en_id, ta_id, 
            'Hello, how are you?', 'வணக்கம், நீங்கள் எப்படி இருக்கிறீர்கள்?',
            false, false, false, false
        ) ON CONFLICT (id) DO NOTHING;
        
        -- Tamil to English
        INSERT INTO public.evaluation_samples (id, dataset_id, source_language_id, target_language_id, source_text, reference_translation, is_code_mixed, contains_name, contains_number, contains_domain_term)
        VALUES (
            '22222222-2222-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', ta_id, en_id, 
            'நான் நாளை சென்னை போகிறேன்.', 'I am going to Chennai tomorrow.',
            false, true, false, false
        ) ON CONFLICT (id) DO NOTHING;

        -- Tamil-English Code Mixing
        INSERT INTO public.evaluation_samples (id, dataset_id, source_language_id, target_language_id, source_text, reference_translation, is_code_mixed, contains_name, contains_number, contains_domain_term)
        VALUES (
            '22222222-3333-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', ta_id, en_id, 
            'நான் tomorrow Chennai போறேன்', 'I am going to Chennai tomorrow.',
            true, true, false, false
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Seed evaluation samples if Hindi is present
    IF en_id IS NOT NULL AND hi_id IS NOT NULL THEN
        -- Hindi to English
        INSERT INTO public.evaluation_samples (id, dataset_id, source_language_id, target_language_id, source_text, reference_translation, is_code_mixed, contains_name, contains_number, contains_domain_term)
        VALUES (
            '22222222-4444-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', hi_id, en_id, 
            'मेरा नाम राहुल है।', 'My name is Rahul.',
            false, true, false, false
        ) ON CONFLICT (id) DO NOTHING;

        -- Hindi-English Code Mixing
        INSERT INTO public.evaluation_samples (id, dataset_id, source_language_id, target_language_id, source_text, reference_translation, is_code_mixed, contains_name, contains_number, contains_domain_term)
        VALUES (
            '22222222-5555-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', hi_id, en_id, 
            'Mujhe kal ek meeting attend karna hai.', 'I have to attend a meeting tomorrow.',
            true, false, false, true
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

    -- Example with Number & Domain-term
    IF en_id IS NOT NULL AND ta_id IS NOT NULL THEN
        INSERT INTO public.evaluation_samples (id, dataset_id, source_language_id, target_language_id, source_text, reference_translation, is_code_mixed, contains_name, contains_number, contains_domain_term)
        VALUES (
            '22222222-6666-1111-1111-111111111111', '11111111-1111-1111-1111-111111111111', en_id, ta_id, 
            'The latency is 500 milliseconds for streaming ASR.', 'ஸ்ட்ரீமிங் ASR-க்கான லேட்டன்சி 500 மில்லிசெகண்டுகள்.',
            false, false, true, true
        ) ON CONFLICT (id) DO NOTHING;
    END IF;

END $$;
