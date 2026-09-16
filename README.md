# Signup MVP — Deploy Guide (~15–20 min)

## 1. Set up Supabase (5 min)
1. Go to https://supabase.com → New project (free tier is fine).
2. Once it's ready, open **SQL Editor** → paste the contents of `schema.sql` → Run.
3. Go to **Project Settings → API**. Copy:
   - **Project URL**
   - **anon public** key

## 2. Connect the frontend (2 min)
1. Open `index.html`.
2. Replace:
   ```js
   const SUPABASE_URL = "YOUR_SUPABASE_URL";
   const SUPABASE_ANON_KEY = "YOUR_SUPABASE_ANON_KEY";
   ```
   with the values you copied.

## 3. Push to GitHub (3 min)
```bash
git init
git add .
git commit -m "signup mvp"
gh repo create signup-mvp --public --source=. --push
```
(Or just create a repo on github.com and push manually / drag-and-drop the files in.)

## 4. Deploy on Vercel (2 min)
1. Go to https://vercel.com/new
2. Import your GitHub repo.
3. Framework preset: **Other** (it's a static HTML file, no build step needed).
4. Click **Deploy**.

You'll get a live URL in about 30–60 seconds.

## 5. Verify it works
- Open your live URL, submit the form with a test name/email.
- In Supabase, go to **Table Editor → signups** — you should see the row appear.

## View your signups anytime
Supabase dashboard → Table Editor → `signups` table. You can also export as CSV from there.

## Notes
- The anon key is safe to expose in frontend code — Row Level Security (set up in `schema.sql`) only allows inserts, not reads, so nobody can pull the signup list via the public key.
- Duplicate emails are rejected automatically (unique constraint) and the form shows a friendly message.
