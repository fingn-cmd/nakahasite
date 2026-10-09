# Nakahasite

Nakahasite is an Express app served by Vercel. Local development can use the JSON files in `data/`; deployed environments use Supabase so data and uploads persist across function runs.

## Supabase setup

1. Create a Supabase project.
2. In **SQL Editor**, run [`supabase/schema.sql`](./supabase/schema.sql).
3. Copy `.env.example` to `.env` and fill in `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, and a long random `SESSION_SECRET`. Keep `.env` private; never commit or share the service-role key.
4. Before migrating, edit each staff member's `password` in `data/nakahasite_users.json` to a new password. The migration script refuses the default `password123` credential.
5. From the project folder, run `npm install`, then `npm run migrate:supabase` once to copy the local Nakahasite data and referenced upload files. The migration hashes staff passwords and does not modify local files.
6. Deploy the project to Vercel and set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SUPABASE_STORAGE_BUCKET`, and `SESSION_SECRET` in **Project Settings → Environment Variables**. Redeploy after adding them.

The `nakahasite-private` Storage bucket is private. The server creates temporary signed links when displaying uploaded files. Only the server uses the Supabase service-role key.

Because Vercel limits request size, one upload request (including all order photos) is limited to 3 MB.

## GitHub

Commit the application source, but not local JSON data, `.env`, or user-uploaded files. `.gitignore` excludes those files. Existing local data is copied to Supabase by the migration script instead of being pushed to GitHub.

For local development without Supabase credentials, the server continues to use the JSON files in `data/`.
