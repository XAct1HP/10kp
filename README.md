# 10KP

Online pitch submission platform.

## Setup

1. **Clone the repo**

   ```bash
   git clone <repo-url>
   cd 10KP-Base
   ```

2. **Install dependencies**

   ```bash
   npm install
   ```

3. **Configure environment variables**

   Copy the example env file and fill in your Supabase credentials:

   ```bash
   cp .env.example .env.local
   ```

   Then open `.env.local` and replace the placeholder values with your actual Supabase project URL and anon key.

4. **Switch to your branch**

   ```bash
   git checkout urvi-development   # or javi-development
   ```

5. **Push changes to see them live**

   ```bash
   git add .
   git commit -m "your message"
   git push origin urvi-development   # or javi-development
   ```

   Vercel will automatically generate a preview deployment for your branch. Check the pull request or Vercel dashboard for the preview URL.

## Project Structure

```
app/           → Next.js App Router pages and layouts
components/    → Shared React components (Navbar, etc.)
lib/           → Utilities (Supabase client, etc.)
```

## Branching

This is the shared base. Do not modify base files directly on `main`. Create your own branch to build features and push to see preview deployments on Vercel.
