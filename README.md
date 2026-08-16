# FTB Tournament Platform

FTB is a self-hosted tournament platform designed for Flunkyball by default. The sport name can be changed during onboarding, so the project can also be used for other simple win/loss team tournaments.

The public website is read-only. Tournament administration happens through a Telegram bot. This keeps the public attack surface small and avoids maintaining a separate website login system.

## Features

### Public tournament website

- Mobile-first public homepage
- Configurable event title, logo and sport name
- Up to three configurable club or event colors
- Automatic contrast checks to protect readability
- Highlighted scrolling announcement banner for important information
- Team overview with optional logos
- Groups and standings
- Match schedule and knockout phase
- Rules section
- Clearly marked disqualified teams
- Tournament winner banner with victory animation
- Reduced-motion support for visitors who disable animations
- Downloadable tournament PDF

### Telegram administration

Administrators are allowed by numeric Telegram user ID. The bot is intended to run only in private chats.

The bot can:

- Run the initial event onboarding
- Configure title, sport, logo and colors
- Maintain the rules
- Publish or disable the scrolling announcement banner
- Create teams with optional logos
- Assign teams to groups manually
- Reassign teams later
- Randomly and evenly distribute teams across groups
- Mark teams as disqualified
- Maintain matches
- Mark a match as running or cancelled
- Record a winner with one tap
- Generate a recommended knockout phase
- Choose between a single final and a best-of-three final series
- Create and delete demo data

### Flunkyball standings

FTB uses a pure win/loss model by default.

Group tables contain:

- Place
- Team
- Matches played
- Wins
- Losses

Ranking is based on the number of wins. If teams are tied, the direct encounter is considered first. Disqualified teams remain visible but are removed from regular qualification calculations.

### Automatic knockout recommendation

FTB calculates a suitable knockout size from the number of active teams. It selects a power-of-two bracket such as 4, 8, 16 or 32 teams while trying to keep the knockout phase meaningful relative to the size of the tournament.

Qualification is distributed as evenly as possible between groups. Remaining wildcard places are assigned to the best next-ranked teams. Pairing also tries to avoid an immediate rematch between teams from the same preliminary group.

Before generating the bracket, the Telegram bot shows the recommendation and asks how the final should be played.

Final modes:

- Single deciding match
- Best of Three, first team to two wins

In Best of Three mode, a third final is created only when necessary.

### Demo mode

Organizers can populate the site with sample teams and sample matches before the real tournament.

Demo records are explicitly marked. The Telegram action `Testdaten löschen` removes only demo teams and demo matches. It does not remove:

- Site title
- Sport name
- Branding colors
- Event logo
- Rules
- Announcement banner
- Real teams
- Real matches

Demo data is excluded from the final tournament PDF.

### Concurrent administrator protection

FTB protects sensitive bot workflows with short-lived database locks. If two administrators try to edit the same area at the same time, the second administrator receives a warning.

Match updates additionally use row versions. A stale Telegram action therefore cannot silently overwrite a newer result.

### PDF export

The public `/turnier.pdf` endpoint creates a current tournament document containing real tournament data, including:

- Event information
- Group tables
- Teams
- Wins and losses
- Match schedule
- Results
- Knockout bracket information
- Tournament winner

## Architecture

Typical self-hosted setup:

```text
Internet
   |
Domain / HTTPS
   |
Reverse proxy or Pangolin
   |
Docker host
   |
   +-- FTB application
   +-- PostgreSQL
   +-- Telegram bot, running inside the application service
```

The PostgreSQL service has no published host port in the provided Compose setup.

## Requirements

For the standard Docker deployment you need:

- A machine capable of running Docker
- Docker Engine and Docker Compose
- A Telegram bot token from BotFather
- The numeric Telegram user IDs of the administrators
- HTTPS access to the application for public use

Dockge is optional. The provided `compose.yaml` can be used directly with Docker Compose or managed as a Dockge stack.

## Self-hosting with Docker and Dockge

### 1. Get the project

Clone the repository:

```bash
git clone https://github.com/BSV2016/ftb.git
cd ftb
```

Alternatively, use the container image from GHCR once the GitHub Actions workflow has built a release.

### 2. Create a Telegram bot

Open a chat with `@BotFather` in Telegram.

Create a bot with `/newbot` and save the token. Treat this token like a password.

### 3. Find the administrator Telegram IDs

FTB authorizes administrators using numeric Telegram user IDs rather than usernames.

Add the permitted IDs to the environment configuration as a comma-separated list.

Example:

```env
TELEGRAM_ADMIN_IDS=123456789,987654321
```

### 4. Create the environment file

Copy the example:

```bash
cp .env.example .env
```

Then edit `.env` and set at least:

```env
DB_PASSWORD=use-a-long-random-password
TELEGRAM_BOT_TOKEN=your-bot-token
TELEGRAM_ADMIN_IDS=123456789
```

Never commit `.env` to Git.

### 5. Start the stack with Docker Compose

```bash
docker compose pull
docker compose up -d
```

Check the status:

```bash
docker compose ps
```

Check application logs if necessary:

```bash
docker compose logs -f app
```

### 6. Deploy with Dockge instead

In Dockge, create a new stack and use the repository `compose.yaml`.

Set the same environment variables in the stack environment or provide the `.env` file on the Docker host.

Deploy the stack and verify that the application and database containers are healthy.

### 7. Put the site behind HTTPS

Do not expose PostgreSQL publicly.

Expose only the FTB application through a trusted HTTPS reverse proxy.

Possible options include:

- Pangolin and Newt
- Caddy
- Traefik
- Nginx Proxy Manager
- Cloudflare Tunnel

If you already use Pangolin on a VPS and Newt on the Docker host, point a Pangolin resource at the internal FTB web service.

### 8. Start the Telegram onboarding

Open a private chat with your new Telegram bot and send:

```text
/start
```

Configure the event title, sport name, logo and colors. Then add the rules, teams and groups.

### 9. Test before tournament day

Use the bot's demo-data function to populate the site.

Check at minimum:

- Mobile layout
- Branding contrast
- Team logos
- Group tables
- Telegram result entry
- Knockout recommendation
- PDF download
- Winner display

Delete the demo data when testing is complete.

### 10. Back up PostgreSQL

Before tournament day, create a database backup or back up the PostgreSQL Docker volume.

A database dump can be created with `pg_dump` from the database container. Store backups outside the Docker volume itself.

## Updating

If the stack uses GHCR images:

```bash
docker compose pull
docker compose up -d
```

With Dockge, use the stack update or pull-and-redeploy function.

For important events, prefer versioned image tags instead of relying only on `latest`. This makes rollback easier.

## Hosting without your own domain or VPS

A paid domain and a VPS are useful, but they are not mandatory.

### Option 1: Cloudflare Tunnel

A Cloudflare Tunnel can publish the Docker application without opening inbound ports on the home router.

This is a good option when the application runs on a home server but no VPS is available.

A custom domain is normally the cleanest setup, but Cloudflare-managed tunnel hostnames can also help during testing depending on the selected Cloudflare product and configuration.

### Option 2: Tailscale Funnel

For small events or testing, Tailscale Funnel can publish a local service through a Tailscale-managed HTTPS address. This avoids operating your own reverse-proxy VPS.

Check current Tailscale limits and terms before using it for a public tournament with many visitors.

### Option 3: Hosting platforms with Docker support

FTB needs an application service and persistent PostgreSQL storage. Platforms that can run Docker containers plus PostgreSQL can therefore host the project without a personal server.

Examples of platform categories to look for:

- Container hosting services
- Platform-as-a-Service providers with Docker deployments
- Managed PostgreSQL plus container runtime

Verify persistent storage, pricing, sleeping or idle policies and outbound Telegram access before tournament day.

### Option 4: GitHub for source and images, external runtime for the app

GitHub can host the project source and GitHub Container Registry can host the built Docker image.

GitHub Pages alone cannot run FTB because GitHub Pages only serves static websites. FTB requires a running Node.js service, PostgreSQL and the Telegram bot.

A practical low-maintenance setup is therefore:

```text
GitHub repository
   |
GitHub Actions
   |
GHCR Docker image
   |
Container hosting provider
   |
Managed PostgreSQL
```

### Option 5: Temporary local hosting for testing

For development or a private test, run FTB on a laptop or home computer and expose it temporarily with a secure tunnel service.

Do not depend on an untested temporary tunnel for the first time on tournament day. Test reconnect behavior, HTTPS and expected visitor load beforehand.

## Security recommendations

- Never expose the PostgreSQL port to the internet.
- Keep the Telegram bot token out of Git.
- Use only numeric Telegram IDs in the administrator allowlist.
- Keep Docker images and the host operating system updated.
- Use HTTPS for the public site.
- Use strong random database passwords.
- Keep database backups outside the Docker host where possible.
- Restrict access to Dockge and the Docker host itself.
- Do not give the application container privileged mode or unnecessary Linux capabilities.
- Review administrators before every tournament.
- Rotate the Telegram token immediately if it is ever exposed.

## Development status

FTB is currently under active development. Before using it for a real tournament, test the complete workflow with demo data and verify the generated schedule, standings, qualification logic, final mode and PDF output for your tournament format.
