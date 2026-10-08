-- Add optional default languages to existing user profiles.
ALTER TABLE public.profiles
    ADD COLUMN IF NOT EXISTS preferred_source_language_id UUID,
    ADD COLUMN IF NOT EXISTS preferred_target_language_id UUID;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'profiles_preferred_source_language_id_fkey'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_preferred_source_language_id_fkey
            FOREIGN KEY (preferred_source_language_id)
            REFERENCES public.supported_languages(id)
            ON DELETE SET NULL;
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_constraint
        WHERE conname = 'profiles_preferred_target_language_id_fkey'
          AND conrelid = 'public.profiles'::regclass
    ) THEN
        ALTER TABLE public.profiles
            ADD CONSTRAINT profiles_preferred_target_language_id_fkey
            FOREIGN KEY (preferred_target_language_id)
            REFERENCES public.supported_languages(id)
            ON DELETE SET NULL;
    END IF;
END
$$;
