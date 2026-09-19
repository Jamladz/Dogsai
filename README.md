# DogsAI 🐶 — Production-Ready Telegram Mini App

DogsAI is an industrial-grade, fully functional Telegram Mini App designed for massive viral engagement. It evaluates a user's Telegram journey (Account Tenure and Premium Status) entirely server-side and rewards them with `DOGSAI` staking tokens.

The application is built using a highly optimized, modern, and secure full-stack architecture that is fully deployable to **Cloudflare Pages** (frontend) and **Cloudflare Workers** (backend API) with **Firebase Firestore** as the global, persistent datastore.

---

## 🚀 Key Architectural Highlights

1. **Telegram WebApp SDK Integration**: Built-in adaptation for Telegram Light/Dark theme parameters, viewport expansion, and full-screen layout.
2. **True Full-Stack Security**: All sensitive actions (auth, welcome rewards, account age calculation, task verification, and referrals) are executed and evaluated strictly server-side on Cloudflare Workers/Express. 
3. **Web Crypto HMAC-SHA256 Validation**: Signatures are verified using standard web browser crypto primitives (`crypto.subtle`), enabling blistering fast verification speed on Cloudflare Edge without importing slow, heavyweight Node dependencies.
4. **Zero-Dependency Firestore REST Client**: Implements OAuth 2.0 JWT exchanges via Web Crypto RSASSA-PKCS1-v1_5, allowing raw, highly performant operations on Google Cloud Firestore natively from Cloudflare Workers.
5. **No Fake Data / Offline Emulation**: If deployed without real credentials or evaluated inside a desktop development sandbox, a comprehensive **Interactive Developer Control Console** is automatically rendered. This console allows emulating any combination of Telegram Premium status, custom username, referral codes, and years of account age, complete with an API Call Log ledger.

---

## 📂 Project Structure

```
.
├── server.ts               # Custom Express server with Vite middleware for local development
├── wrangler.toml           # Cloudflare Workers configuration file
├── package.json            # Scripts for compilation and dependencies
├── metadata.json           # Application manifest for AI Studio permissions
├── worker/
│   └── index.ts            # Production Cloudflare Worker backend entry point
└── src/
    ├── App.tsx             # Interactive, high-fidelity React frontend (onboarding + dashboards)
    ├── main.tsx            # React application mounting point
    ├── index.css           # Global Tailwind CSS configurations
    ├── types.ts            # Shared TypeScript data models, configurations, and enums
    └── lib/
        └── firestore-rest.ts # Web Crypto JWT Firestore REST client + local JSON DB emulator
```

---

## 🔒 Production Environment Variables (`.env`)

To configure production secrets, create a `.env` file in the root directory (never commit actual secrets). These variables must also be registered as Secrets in your Cloudflare Workers Dashboard.

```env
# Telegram Configuration
TELEGRAM_BOT_TOKEN=your_telegram_bot_token_here

# Firebase Firestore Service Account Credentials
FIREBASE_PROJECT_ID=your_firebase_project_id_here
FIREBASE_CLIENT_EMAIL=your_firebase_client_email_here
FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"

# Telegram Account Age Estimator Provider API (Optional)
ACCOUNT_AGE_API_URL=https://api.telegram-age-estimator.com/estimate
ACCOUNT_AGE_API_KEY=your_optional_estimator_secret_key
```

---

## 🛠️ Step-by-Step Installation & Local Run

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Run locally in Development Mode**:
   ```bash
   npm run dev
   ```
   *This starts the Express server with Vite middleware on http://localhost:3000.*

3. **Verify compilation & types**:
   ```bash
   npm run lint
   ```

4. **Build for Production**:
   ```bash
   npm run build
   ```

---

## ☁️ Cloudflare Deployment Instructions

This project is optimized for deployment to the Cloudflare network.

### 1. Deploy the Backend Worker (API)

The Worker script is defined in `worker/index.ts` and managed via `wrangler.toml`.

1. **Log in to Cloudflare wrangler**:
   ```bash
   npx wrangler login
   ```

2. **Set your Secret Environment Variables**:
   ```bash
   npx wrangler secret put TELEGRAM_BOT_TOKEN
   npx wrangler secret put FIREBASE_PROJECT_ID
   npx wrangler secret put FIREBASE_CLIENT_EMAIL
   npx wrangler secret put FIREBASE_PRIVATE_KEY
   npx wrangler secret put ACCOUNT_AGE_API_KEY
   ```

3. **Deploy the Worker**:
   ```bash
   npx wrangler deploy
   ```
   *Take note of the deployed API URL (e.g., `https://dogsai-api.your-subdomain.workers.dev`).*

---

### 2. Deploy the Frontend (Cloudflare Pages)

1. **Build the production build locally**:
   ```bash
   npm run build
   ```
   *This produces static frontend assets in `/dist` and compiles `/dist/server.cjs`.*

2. **Deploy the static folder to Cloudflare Pages**:
   You can drag and drop the `/dist` directory into the Cloudflare Pages UI, or use wrangler:
   ```bash
   npx wrangler pages deploy dist --project-name dogsai
   ```

3. **Link Frontend to Backend API**:
   Modify the API fetching urls or configure a rewrite proxy in your Cloudflare dashboard to route all `/api/*` traffic from your Pages domain to your Workers URL!
