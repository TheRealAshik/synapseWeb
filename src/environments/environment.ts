export const environment = {
  supabase: {
    // The application was failing because process.env variables are not available
    // in this client-side environment. I've hardcoded the values to fix the crash.
    // 
    // IMPORTANT: Please replace the anonKey placeholder below with your actual
    // Supabase anonymous key. The one provided in the prompt was incomplete.
    url: 'https://apqvyyphlrtmuyjnzmuq.supabase.co',
    anonKey: 'YOUR_SUPABASE_ANON_KEY_HERE_THE_PROVIDED_ONE_WAS_INCOMPLETE',
  }
};
