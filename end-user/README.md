# End-user portal

The portal where end users sign in with a one-time code (SMS or email), register complaints with attachments, follow their progress, reply, confirm or reopen them, and manage their profile and notifications.

Next.js 16 (App Router), React 19, Tailwind CSS 4. It talks only to the CMS API (`../backend`).

## Setup

```bash
npm ci
cp .env.example .env.local   # NEXT_PUBLIC_API_URL: the API as the browser reaches it
npm run dev                  # http://localhost:3000
```

`NEXT_PUBLIC_API_URL` is required and is baked in at build time; the app refuses to start without it. The API must list this app's origin in `CORS_ORIGINS`.

Branding, contacts, time zone, limits and refresh intervals are not configured here: they come from the API's `GET /public/config` (the Super Admin edits them under _Settings_).

## Sessions

The API keeps the session in an httpOnly refresh cookie; the short-lived access token is held in memory only and renewed on demand (one renewal at a time across tabs). Nothing about the session is stored in `localStorage`.

## Scripts

| Command                                   |                                                 |
| ----------------------------------------- | ----------------------------------------------- |
| `npm run dev`                             | development server                              |
| `npm run build` / `npm start`             | production build (standalone output) and server |
| `npm run lint`                            | ESLint                                          |
| `npm run typecheck`                       | TypeScript                                      |
| `npm run format` / `npm run format:check` | Prettier                                        |

## Docker

```bash
docker build --build-arg NEXT_PUBLIC_API_URL=https://api.example.org -t cms-end-user .
docker run -p 3000:3000 cms-end-user
```

The root `docker-compose.yml` builds and runs it with the rest of the stack.
