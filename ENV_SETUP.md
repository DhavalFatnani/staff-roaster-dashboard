# Environment Variables Setup Guide

## Required Supabase Credentials

You need **3 credentials** from your Supabase project:

### 1. NEXT_PUBLIC_SUPABASE_URL
- **What it is**: Your Supabase project URL
- **Where to find it**: 
  - Go to your Supabase project dashboard
  - Click on **Settings** (gear icon) in the left sidebar
  - Click on **API** in the settings menu
  - Look for **Project URL** under "Project API keys"
  - It looks like: `https://xxxxxxxxxxxxx.supabase.co`

### 2. NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
- **What it is**: Your Supabase publishable key (safe to expose in client-side code)
- **Where to find it**:
  - Same location as above (Settings > API)
  - Look for **Publishable key** under "Publishable and secret API keys"
  - It starts with `sb_publishable_` followed by a long string
  - ⚠️ **Note**: This key is safe for browser use if you have Row Level Security (RLS) enabled

### 3. SUPABASE_SECRET_KEY
- **What it is**: Your Supabase secret key (⚠️ **KEEP THIS SECRET!**)
- **Where to find it**:
  - Same location (Settings > API)
  - Look for **Secret key** under "Secret keys" section
  - It starts with `sb_secret_` followed by a long string
  - ⚠️ **WARNING**: This key has admin privileges. Never commit it to git or expose it publicly!
  - Use this only in server-side code (API routes)

## Creating .env.local File

1. In the root directory of your project, create a file named `.env.local`

2. Copy and paste this template:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project-id.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key-here
SUPABASE_SECRET_KEY=your-secret-key-here

# Application (optional - defaults work for development)
NODE_ENV=development
PORT=3000
NEXT_PUBLIC_BASE_URL=http://localhost:3000
```

3. Replace the placeholder values with your actual Supabase credentials

## Example .env.local File

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=https://abcdefghijklmnop.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable___6c81ZUZUwAd4V2WZGyfA_FQAGBDqw
SUPABASE_SECRET_KEY=sb_secret_NIcMHxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

# Application
NODE_ENV=development
```

**Note**: The secret key shown above is truncated. Use your full secret key from Supabase.

## Visual Guide: Finding Credentials in Supabase

```
Supabase Dashboard
├── Your Project
    └── Settings (⚙️ icon)
        └── API
            ├── Project URL: https://xxxxx.supabase.co  ← NEXT_PUBLIC_SUPABASE_URL
            └── Publishable and secret API keys:
                ├── Publishable key: sb_publishable_...  ← NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
                └── Secret key: sb_secret_...  ← SUPABASE_SECRET_KEY (⚠️ secret!)
```

## Security Notes

1. **Never commit `.env.local` to git** - It's already in `.gitignore`
2. **The `NEXT_PUBLIC_` prefix** means those variables are exposed to the browser (safe for publishable key)
3. **Secret key** should NEVER be in `NEXT_PUBLIC_` variables - it's server-side only
4. **Publishable key** is safe for browser use when Row Level Security (RLS) is enabled on your tables
5. **For production**, use your hosting platform's environment variable settings (Vercel, Netlify, etc.)

## Verifying Your Setup

After creating `.env.local`, restart your Next.js dev server:

```bash
# Stop the server (Ctrl+C) and restart
npm run dev
```

The app should now connect to your Supabase database. If you see connection errors, double-check:
- The URL is correct (no trailing slashes)
- The keys are complete (they're very long strings)
- No extra spaces or quotes around the values

## Troubleshooting

**Error: "Missing Supabase environment variables"**
- Make sure `.env.local` exists in the root directory
- Make sure variable names match exactly (case-sensitive)
- Restart the dev server after creating/updating `.env.local`

**Error: "Invalid API key"**
- Verify you copied the entire key (they're very long)
- Make sure you didn't accidentally add spaces or line breaks
- Check that you're using the correct key type (publishable vs secret)
- Publishable keys start with `sb_publishable_`
- Secret keys start with `sb_secret_`

**Error: "Failed to fetch" or connection errors**
- Verify your Supabase project is active
- Check that your Project URL is correct
- Ensure your Supabase project isn't paused (free tier projects pause after inactivity)
