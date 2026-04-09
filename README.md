# cat-prep

Competitive exam preparation tracker built with Next.js and Supabase Auth.

## Features

- Supabase email/password login for the three users
- Section-wise tracker for `QUANT`, `DILR`, `VARC`
- Topic study links and completion checklist
- Proof submission for each topic:
  - number of topic questions + image proofs
  - number of PYQ questions + image proofs
  - short notes images
- Approval workflow:
  - user submits proof
  - another user reviews
  - progress increases after first approval
- Weekly planning:
  - create a week plan with date + selected subtopics
  - plan is visible to all users
  - dashboard shows weekly completed vs remaining goals
- Resources page:
  - open from dashboard header `Resources` button
  - add resources with name, description, and link array
  - all resources visible to all users

## Environment Variables

Create `.env.local` with:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_SERVICE_ROLE_KEY` is sensitive and should never be exposed client-side.

## Database setup (required once)

Run `supabase-schema.sql` in your Supabase SQL editor.

This creates:
- `topics`
- `topic_submissions`
- `submission_reviews`

Also run:
- `supabase-subtopics-migration.sql`
- `supabase-videos-migration.sql`
- `supabase-weekly-plans-migration.sql`
- `supabase-resources-migration.sql`

## Run

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Build

```bash
npm run build
npm start
```
