# 254 Mobile Arena

Installable mobile-first esports tournament website for eFootball, Free Fire and PUBG Mobile. Includes player registration, tournament listings, SQLite storage, an admin dashboard, results publishing, and **manual M-Pesa Send Money** payment submission and verification.

## Payment flow (no Till or Paybill required for this version)
1. A player registers for an open tournament.
2. The site displays the receiving number configured by `MPESA_RECEIVE_NUMBER` (default: `0143222805`) and the entry fee.
3. The player uses M-Pesa Send Money and submits the transaction code.
4. An administrator checks the payment in the M-Pesa account and approves or rejects it in the admin dashboard.

The transaction code is not automatically verified. Never ask players for their M-Pesa PIN or OTP. The receiving phone number is displayed publicly on the website. Confirm that the line can receive payments and that you are comfortable publishing it before launch.

## Requirements
- Node.js 20+
- A host with persistent disk storage (SQLite database is stored in `data/`)
- Public HTTPS URL for deployment and installable PWA support

## Run locally
1. Install Node.js.
2. Copy `.env.example` to `.env`.
3. Set a strong random `JWT_SECRET`, `ADMIN_EMAIL`, and `ADMIN_PASSWORD`.
4. Run `npm install`.
5. Run `npm start`.
6. Open `http://localhost:3000`.

## Environment settings
- `PORT`: supplied by the host or `3000` locally.
- `JWT_SECRET`: replace with a long random secret.
- `ADMIN_EMAIL` and `ADMIN_PASSWORD`: set your private administrator login. Do not use the sample password.
- `MPESA_RECEIVE_NUMBER`: receiving M-Pesa phone number; currently defaults to `0143222805`.

Daraja STK Push credentials are not needed for this manual Send Money version. The app includes a legacy callback endpoint, but it is not used by the manual payment flow.

## Deployment notes
- Deploy the Node app to a service that supports Node 20 and persistent storage.
- Set the environment variables in the host's secret/environment settings.
- Enable HTTPS and back up `data/arena.sqlite` regularly.
- Do not use an ephemeral filesystem for the SQLite database; registrations and results could be lost when the host restarts or redeploys.
- Before accepting real entry fees, test the complete registration and manual payment verification process with a small test tournament.
- Add rate limiting, CSRF protection, audit logging, and a managed database before handling significant funds.

## Important
- Tournament names, prizes, slot counts and schedules are editable demo defaults. Replace them with confirmed event details before advertising.
- This is a deployable starter application, not a hosted live service. It must be deployed before players can access it online.
