import { createClient } from '@supabase/supabase-js';

export const supabaseUrl = 'https://slrpesefjkzoaufvogdj.supabase.co';
const supabaseAnonKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNscnBlc2Vmamt6b2F1ZnZvZ2RqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTkxOTk5NjAsImV4cCI6MjA3NDc3NTk2MH0._ZFfjr_DKP-0HNXFapth3gPhTSlce6FP2142aP_NhKo';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);