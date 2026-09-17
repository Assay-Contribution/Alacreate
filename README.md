# Contribution

A Vite + TypeScript manifesto homepage with an image-led story and a Supabase-backed signup form.

## Set up Supabase

1. Go to https://supabase.com → New project (free tier is fine).
2. Once it's ready, open **SQL Editor** → paste the contents of `schema.sql` → Run.
3. Go to **Project Settings → API** and copy:
   - **Project URL**
   - **anon public** key
4. In **Authentication → Providers**, enable **Email**. Configure email confirmation and redirect URLs for your deployed domain.

## Run locally

```bash
npm install
```

Create a `.env.local` file from `.env.example` and add the Supabase values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key
```

Start the development server:

```bash
npm run dev
```

Create a production build with:

```bash
npm run build
```

## Push to GitHub

```bash
git add .
git commit -m "split frontend into vite app"
git push
```

## Deploy on Vercel

1. Go to https://vercel.com/new and import the GitHub repository.
2. Vercel should detect **Vite** automatically.
3. Add `VITE_SUPABASE_URL` and `VITE_SUPABASE_ANON_KEY` under the project environment variables for the selected deployment environments.
4. Deploy. Vercel runs `npm run build` and serves the generated `dist` directory.

## Verify it works

- Open your live URL, submit the form with a test name/email.
- The dedicated signup page is available at `/signup.html`.
- The daily contribution reporting tool is available at `/reporting.html`.
- Create an account or sign in at `/signup.html`; authenticated reports persist across devices.
- In Supabase, go to **Table Editor → signups** — you should see the row appear.

Reports are stored in the `contribution_reports` table with one record per authenticated user per day. The `next_steps` column stores each task and its estimated minutes as JSONB, while Supabase Row Level Security prevents users from reading or editing another user's reports.

## View your signups anytime

Supabase dashboard → Table Editor → `signups` table. You can also export as CSV from there.

## Notes

- The anon key is safe to expose in frontend code — Row Level Security (set up in `schema.sql`) only allows inserts, not reads, so nobody can pull the signup list via the public key.
- Duplicate emails are rejected automatically (unique constraint) and the form shows a friendly message.
