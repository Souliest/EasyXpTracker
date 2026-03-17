// common/supabase.js
// Supabase client — single instance shared across all modules.
// Import { supabase } from this file wherever Supabase access is needed.

import {createClient} from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

const SUPABASE_URL = 'https://dpetczhvxznakmnxplbp.supabase.co';
const SUPABASE_KEY = 'sb_publishable_SqFXH-qsJW-25ic1J0p6EQ_TPQ-6Tgv';

export const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);