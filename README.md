# Aevon Knowledge Base

A GitHub-friendly knowledge base powered by Supabase.

## Included

- Aqua/cloud responsive public design with subtle flying birds
- Search, categories, emoji + text tags
- Pinned articles
- Discord-only user sign-in
- Likes
- Comments: max 3 per Discord account per article every rolling 24 hours
- Admin-only dashboard
- Rich article editor: headings, font sizes, bold, italic, underline, lists, links, emoji, screenshots/images
- Draft/publish, pin, featured, comments on/off
- Category/tag management and comment moderation
- Supabase Row Level Security
- Supabase Storage for article images
- Search/view analytics foundations

## SECURITY

`config.js` contains the browser-safe Supabase URL and **publishable/anon** key. Those are designed for browser use and are protected by RLS.

NEVER put any of these in this repository:
- Supabase `service_role` key
- Discord Client Secret
- Database password
- Admin password

Admin permission lives in the database (`profiles.role = 'admin'`) and is checked by RLS.

## Quick setup

1. Create a Supabase project.
2. Open **SQL Editor**, paste the complete contents of `supabase-setup.sql`, and Run.
3. Open **Project Settings / API** (wording may vary). Copy your Project URL and publishable/anon key.
4. Edit `config.js`:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
5. In Discord Developer Portal create an Application.
6. In Supabase: **Authentication > Sign In / Providers > Discord**, copy the Supabase callback URL.
7. In Discord: **OAuth2 > Redirects**, add that exact Supabase callback URL. Copy Client ID and Client Secret.
8. Back in Supabase Discord provider, enable Discord and enter Client ID + Client Secret.
9. In Supabase Authentication URL Configuration:
   - Set Site URL to your final GitHub Pages URL.
   - Add the same GitHub Pages URL to Redirect URLs.
10. Disable other sign-in providers you do not want (especially email/password) so Discord is the only normal sign-in route.
11. Push these website files to GitHub and enable GitHub Pages.
12. Visit the live site and click **Continue with Discord** once.
13. Supabase Dashboard > Authentication > Users: copy YOUR user UUID.
14. SQL Editor, run:
    `update public.profiles set role='admin' where id='YOUR-UUID';`
15. Refresh/re-login. The **Admin** button appears.

## GitHub Pages

For a repository named `knowledge-base` under account `YOURNAME`, the URL is normally:
`https://YOURNAME.github.io/knowledge-base/`

GitHub:
1. Repository > Settings > Pages
2. Source: Deploy from a branch
3. Branch: `main`, folder `/ (root)`
4. Save
5. Wait for GitHub Pages to publish

## Discord OAuth callback

Do NOT use the GitHub Pages URL as the Discord provider callback.

Discord's OAuth redirect should be the callback Supabase shows you, normally:
`https://YOUR_PROJECT_REF.supabase.co/auth/v1/callback`

Your GitHub Pages URL belongs in Supabase's Site URL / redirect allow list.

## Admin images

Images are limited to 5 MB and PNG/JPEG/WebP/GIF. Only admins can upload to `article-images`; files are publicly readable so published articles can display them.

## Notes

The frontend uses Supabase JS v2 and DOMPurify from jsDelivr CDN. If you later want a fully bundled build with no CDN dependencies, migrate this to a Vite/Next.js build.

`document.execCommand` is used for the lightweight rich editor because this project is intentionally build-free/GitHub-Pages-friendly. For a larger CMS, migrate the editor to TipTap or Lexical.
