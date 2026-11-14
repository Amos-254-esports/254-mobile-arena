# 254 Mobile Arena

Installable mobile-first tournament website for eFootball, Free Fire and PUBG Mobile. Includes player registration, SQLite persistence, admin dashboard, results publishing, and Safaricom Daraja STK Push integration.

## Requirements
- Node.js 20+
- A host with persistent disk storage (SQLite database is stored in `data/`)
- Public HTTPS URL for production M-Pesa callbacks and PWA installation

## Run locally
1. Install Node.js.
2. Copy `.env.example` to `.env`.
3. Set a strong `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

M-Pesa is intentionally not active until Daraja credentials and a reachable HTTPS callback URL are configured. Use Safaricom Daraja sandbox credentials for testing first.

## M-Pesa setup
Create/configure a Daraja app with the appropriate Lipa na M-Pesa Online (STK Push) product. Set:
- `MPESA_ENV=sandbox` for testing, then `production` only after approval
- `MPESA_CONSUMER_KEY`
- `MPESA_CONSUMER_SECRET`
- `MPESA_SHORTCODE`
- `MPESA_PASSKEY`
- `MPESA_CALLBACK_URL=https://YOUR-DOMAIN/api/mpesa/callback`

The callback endpoint must be publicly reachable over HTTPS. Do not expose credentials in browser JavaScript or share them in chat. The app marks a registration paid only after a successful Daraja callback.

## Admin
Use the email/password configured in `.env` on the Admin tab. Change the example password before deployment. The admin cookie is HTTP-only and expires after 8 hours.

## Deployment notes
- Deploy the Node app to a service that supports Node 20 and persistent storage.
- Add all `.env` variables in the host's secret/environment settings.
- Set `BASE_URL` and the exact public `MPESA_CALLBACK_URL`.
- Enable HTTPS.
- Back up `data/arena.sqlite`.
- Keep `MPESA_ENV=sandbox` until end-to-end test payments succeed.
- For production, add rate limiting, CSRF protection, audit logging, stronger callback reconciliation, and a managed database before handling significant funds.

## Important
- Tournament names, prizes, slot counts and schedules are editable demo defaults. Replace them with confirmed event details before advertising.
- No real room IDs, passwords, paybill or till number are prefilled.
- This is a deployable starter application, not a hosted live service. M-Pesa cannot transact until the owner supplies valid Daraja credentials and deploys the callback endpoint.
