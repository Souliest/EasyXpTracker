// common/supabase.js
// Supabase client — single instance shared across all modules.
// Import { supabase } from this file wherever Supabase access is needed.
//
// SUPABASE_URL and SUPABASE_KEY are injected at deploy time by the GitHub
// Actions workflow (.github/workflows/deploy.yml). The placeholder strings
// below are replaced via sed before the site is published to GitHub Pages.
// Do not hardcode credentials here — the placeholders are intentional.

import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = '__SUPABASE_URL__';
const SUPABASE_KEY = '__SUPABASE_KEY__';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);