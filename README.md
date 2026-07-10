# AI Optimizer

A Next.js app where each user (personal workspace) or org (shared workspace)
submits URLs to scrape. Every scrape streams live, pauses for human
approval before the AI-extraction stage runs, and each resubmission of the
same URL in a workspace is kept as a new version so you can see how a page's
content/analysis has evolved over time.

## Stack

- Next.js 14 (App Router)
- Clerk (auth + organizations)
- Neon Postgres + Drizzle ORM
- cheerio (HTML scraping/extraction)

## Local setup

1. `npm install`
2. Copy `.env.local.example` to `.env` and fill in:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` / `CLERK_SECRET_KEY` — from your Clerk app (Dashboard → API Keys).
   - `CLERK_WEBHOOK_SECRET` — see "Clerk webhook" below. Not required for local dev to function (see note).
   - `DATABASE_URL` — a Neon (or any Postgres) connection string.
3. Push the schema: `npx drizzle-kit push`
4. `npm run dev`

### Note on local dev without a webhook tunnel

The Clerk webhook (`/api/webhooks/clerk`) is how `users`/`organizations` rows
normally get created in Postgres. Clerk can't reach `localhost`, so locally
that webhook never fires unless you run a tunnel (e.g. `ngrok http 3000`) and
register the tunnel URL in the Clerk Dashboard's Webhooks page. Instead, the
app lazily creates the `users`/`organizations` row itself the first time an
authenticated user/org is missing from the DB (see `app/page.tsx` and
`app/(main)/org/[orgId]/workspaces/page.tsx`), so local dev works without a
tunnel. In production, the webhook is the fast path; the lazy-create logic
still acts as a self-healing fallback if a webhook delivery is ever missed.

## Deploying to Vercel

1. Push this repo to GitHub/GitLab/Bitbucket and import it in Vercel (or use
   `vercel` CLI to deploy directly from this folder).
2. In the Vercel project's environment variables, set:
   - `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY`
   - `CLERK_SECRET_KEY`
   - `CLERK_WEBHOOK_SECRET` (see step 4)
   - `NEXT_PUBLIC_CLERK_SIGN_IN_URL=/sign-in`
   - `NEXT_PUBLIC_CLERK_SIGN_UP_URL=/sign-up`
   - `NEXT_PUBLIC_CLERK_AFTER_SIGN_IN_URL=/`
   - `NEXT_PUBLIC_CLERK_AFTER_SIGN_UP_URL=/`
   - `DATABASE_URL` (a Neon Postgres connection string — can reuse the dev one, or provision a separate prod database)
3. Push the schema to whichever database `DATABASE_URL` points at:
   `npx drizzle-kit push` (run this from your machine with the prod
   `DATABASE_URL` in your environment, before or after the first deploy).
4. Set up the Clerk webhook: in the Clerk Dashboard → Webhooks, add an
   endpoint at `https://<your-vercel-domain>/api/webhooks/clerk`, subscribed
   to `user.created`, `organization.created`, `organizationMembership.created`,
   `organizationMembership.deleted`. Copy the signing secret it gives you into
   `CLERK_WEBHOOK_SECRET` in Vercel's env vars.
5. Deploy.

## Known limitations

- The AI-extraction stage (after human approval) is a placeholder — no LLM
  provider key is configured yet. `POST /api/sources/versions/[versionId]/approve`
  currently just marks the version `completed` on the raw scraped content.
  Wire in a real provider call there when ready.
