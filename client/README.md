# Client (VitalVoice Realtime)

This folder contains the Vite + React frontend for the VitalVoice realtime demo. The UI includes the main user experience and an admin dashboard reachable at the `#admin` hash route.

## Quick Start

Install dependencies and run the dev server:

```bash
cd client
npm install
npm run dev
```

The dev server runs on port `5174` by default. Open `http://localhost:5174` in your browser. To view the admin dashboard, open `http://localhost:5174/#admin`.

## Scripts

- `npm run dev` — run Vite dev server
- `npm run build` — build production assets
- `npm run preview` — serve built assets locally
- `npm run lint` — run ESLint

## Notes

- The client connects to the server WebSocket endpoint; ensure the server is running and environment variables are configured before attempting full end-to-end tests.
- UI source lives under `src/`, entrypoint `src/main.jsx`, and the main app is `src/App.jsx` which toggles between the regular `Dashboard` and `AdminDashboard` when the url hash is `#admin`.
