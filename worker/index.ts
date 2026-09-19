import { 
  User, 
  Transaction, 
  TransactionType, 
  DEFAULT_REWARD_CONFIG, 
  DEFAULT_TASKS 
} from '../src/types';

export interface Env {
  TELEGRAM_BOT_TOKEN: string;
  FIREBASE_PROJECT_ID: string;
  FIREBASE_CLIENT_EMAIL: string;
  FIREBASE_PRIVATE_KEY: string;
  ACCOUNT_AGE_API_URL: string;
  ACCOUNT_AGE_API_KEY: string;
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, HEAD, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Telegram-Init-Data",
  "Access-Control-Max-Age": "86400",
};

// --- Web Crypto JWT JWT/OAuth REST Client ---
class WorkerFirestoreClient {
  private env: Env;
  private token: { value: string; expiry: number } | null = null;

  constructor(env: Env) {
    this.env = env;
  }

  private async getAccessToken(): Promise<string> {
    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.expiry > now + 60) {
      return this.token.value;
    }

    const clientEmail = this.env.FIREBASE_CLIENT_EMAIL;
    const privateKeyRaw = this.env.FIREBASE_PRIVATE_KEY;
    if (!clientEmail || !privateKeyRaw) {
      throw new Error("Firebase Service Account credentials are not configured in environment variables.");
    }

    const formattedKey = privateKeyRaw.replace(/\\n/g, '\n');
    const base64Key = formattedKey
      .replace(/-----BEGIN PRIVATE KEY-----/, '')
      .replace(/-----END PRIVATE KEY-----/, '')
      .replace(/\s+/g, '');

    const binaryKey = atob(base64Key);
    const len = binaryKey.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) {
      bytes[i] = binaryKey.charCodeAt(i);
    }

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      bytes.buffer,
      {
        name: "RSASSA-PKCS1-v1_5",
        hash: { name: "SHA-256" }
      },
      false,
      ["sign"]
    );

    const header = { alg: "RS256", typ: "JWT" };
    const payload = {
      iss: clientEmail,
      scope: "https://www.googleapis.com/auth/datastore",
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now
    };

    const base64url = (source: any) => {
      const bin = typeof source === 'string' ? new TextEncoder().encode(source) : new Uint8Array(source);
      let b64 = btoa(String.fromCharCode(...Array.from(bin)));
      return b64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
    };

    const headerStr = base64url(JSON.stringify(header));
    const payloadStr = base64url(JSON.stringify(payload));
    const stringToSign = `${headerStr}.${payloadStr}`;

    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(stringToSign)
    );

    const jwt = `${stringToSign}.${base64url(signatureBuffer)}`;

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    if (!tokenResponse.ok) {
      const errText = await tokenResponse.text();
      throw new Error(`Failed to get Google Token: ${errText}`);
    }

    const tokenData = await tokenResponse.json() as any;
    this.token = {
      value: tokenData.access_token,
      expiry: now + (tokenData.expires_in || 3600)
    };

    return this.token.value;
  }

  // Convert JS object to Firestore Fields
  private toFields(obj: any): any {
    const fields: any = {};
    for (const key of Object.keys(obj)) {
      const val = obj[key];
      if (val === null || val === undefined) {
        fields[key] = { nullValue: null };
      } else if (typeof val === 'string') {
        fields[key] = { stringValue: val };
      } else if (typeof val === 'boolean') {
        fields[key] = { booleanValue: val };
      } else if (typeof val === 'number') {
        if (Number.isInteger(val)) {
          fields[key] = { integerValue: val.toString() };
        } else {
          fields[key] = { doubleValue: val };
        }
      } else if (Array.isArray(val)) {
        fields[key] = {
          arrayValue: {
            values: val.map(item => {
              if (typeof item === 'string') return { stringValue: item };
              if (typeof item === 'boolean') return { booleanValue: item };
              if (typeof item === 'number') {
                if (Number.isInteger(item)) return { integerValue: item.toString() };
                return { doubleValue: item };
              }
              return { mapValue: { fields: this.toFields(item) } };
            })
          }
        };
      } else if (typeof val === 'object') {
        fields[key] = { mapValue: { fields: this.toFields(val) } };
      }
    }
    return fields;
  }

  // Convert Firestore Fields to JS Object
  private fromFields(fields: any): any {
    if (!fields) return {};
    const result: any = {};
    for (const key of Object.keys(fields)) {
      const val = fields[key];
      if (val.stringValue !== undefined) {
        result[key] = val.stringValue;
      } else if (val.integerValue !== undefined) {
        result[key] = parseInt(val.integerValue, 10);
      } else if (val.doubleValue !== undefined) {
        result[key] = parseFloat(val.doubleValue);
      } else if (val.booleanValue !== undefined) {
        result[key] = val.booleanValue;
      } else if (val.timestampValue !== undefined) {
        result[key] = val.timestampValue;
      } else if (val.arrayValue !== undefined) {
        const values = val.arrayValue.values || [];
        result[key] = values.map((item: any) => {
          if (item.stringValue !== undefined) return item.stringValue;
          if (item.integerValue !== undefined) return parseInt(item.integerValue, 10);
          if (item.booleanValue !== undefined) return item.booleanValue;
          return this.fromFields(item.mapValue?.fields);
        });
      } else if (val.mapValue !== undefined) {
        result[key] = this.fromFields(val.mapValue.fields);
      } else if (val.nullValue !== undefined) {
        result[key] = null;
      }
    }
    return result;
  }

  async getUser(telegramId: string): Promise<User | null> {
    const token = await this.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${telegramId}`;
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (response.status === 404) return null;
    if (!response.ok) throw new Error(await response.text());

    const doc = await response.json() as any;
    return this.fromFields(doc.fields) as User;
  }

  async saveUser(user: User): Promise<void> {
    const token = await this.getAccessToken();
    const fields = this.toFields(user);
    const url = `https://firestore.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${user.telegramId}`;
    const response = await fetch(url, {
      method: "PATCH",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });

    if (!response.ok) throw new Error(await response.text());
  }

  async getTransactions(telegramId: string): Promise<Transaction[]> {
    const token = await this.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${telegramId}/transactions`;
    const response = await fetch(url, {
      headers: { "Authorization": `Bearer ${token}` }
    });

    if (response.status === 404) return [];
    if (!response.ok) throw new Error(await response.text());

    const data = await response.json() as any;
    const documents = data.documents || [];
    return documents.map((doc: any) => this.fromFields(doc.fields)) as Transaction[];
  }

  async addTransaction(telegramId: string, transaction: Transaction): Promise<void> {
    const token = await this.getAccessToken();
    const fields = this.toFields(transaction);
    const url = `https://firestore.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/databases/(default)/documents/users/${telegramId}/transactions?documentId=${transaction.transactionId}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ fields })
    });

    if (response.status === 409) return; // Idempotent success
    if (!response.ok) throw new Error(await response.text());
  }

  async getUserByReferralCode(referralCode: string): Promise<User | null> {
    const token = await this.getAccessToken();
    const url = `https://firestore.googleapis.com/v1/projects/${this.env.FIREBASE_PROJECT_ID}/databases/(default)/documents:runQuery`;
    
    const queryBody = {
      structuredQuery: {
        from: [{ collectionId: 'users' }],
        where: {
          fieldFilter: {
            field: { fieldPath: 'referralCode' },
            op: 'EQUAL',
            value: { stringValue: referralCode }
          }
        },
        limit: 1
      }
    };

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Authorization": `Bearer ${token}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify(queryBody)
    });

    if (!response.ok) throw new Error(await response.text());

    const results = await response.json() as any;
    if (results && results.length > 0 && results[0].document) {
      return this.fromFields(results[0].document.fields) as User;
    }
    return null;
  }
}

// HMAC Validation
async function validateTelegramInitData(initData: string, botToken: string): Promise<boolean> {
  const cleanToken = (botToken || '').replace(/['"]/g, '').trim();
  if (!cleanToken || 
      cleanToken === "" || 
      cleanToken.toUpperCase() === "YOUR_TELEGRAM_BOT_TOKEN" || 
      cleanToken.toUpperCase().startsWith("YOUR_")) {
    // Development bypass if no token is configured or left as default template
    return true;
  }

  try {
    const params = new URLSearchParams(initData);
    const hash = params.get("hash");
    if (!hash) return false;

    const keys = Array.from(params.keys()).filter(key => key !== "hash").sort();
    const dataCheckString = keys.map(key => `${key}=${params.get(key)}`).join("\n");

    const encoder = new TextEncoder();
    const webAppDataKey = await crypto.subtle.importKey(
      "raw",
      encoder.encode("WebAppData"),
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const secretKeyBuffer = await crypto.subtle.sign(
      "HMAC",
      webAppDataKey,
      encoder.encode(botToken)
    );

    const secretKey = await crypto.subtle.importKey(
      "raw",
      secretKeyBuffer,
      { name: "HMAC", hash: "SHA-256" },
      false,
      ["sign"]
    );

    const signatureBuffer = await crypto.subtle.sign(
      "HMAC",
      secretKey,
      encoder.encode(dataCheckString)
    );

    const hexSignature = Array.from(new Uint8Array(signatureBuffer))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");

    return hexSignature === hash;
  } catch (err) {
    return false;
  }
}

// Main fetch handler
export default {
  async fetch(request: Request, env: Env, ctx: any): Promise<Response> {
    // Handle CORS preflight options
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);
    const path = url.pathname;

    // Standard JSON output helper
    const jsonRes = (data: any, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json"
        }
      });
    };

    // Authenticate Telegram user
    const initData = request.headers.get("X-Telegram-Init-Data") || url.searchParams.get("initData");
    if (!initData) {
      return jsonRes({ success: false, error: "Missing Telegram initData" }, 401);
    }

    const isValid = await validateTelegramInitData(initData, env.TELEGRAM_BOT_TOKEN);
    if (!isValid) {
      return jsonRes({ success: false, error: "Invalid Telegram signature" }, 401);
    }

    let tgUser: any = null;
    let startParam: string | null = null;
    try {
      const params = new URLSearchParams(initData);
      const userJson = params.get("user");
      if (!userJson) {
        return jsonRes({ success: false, error: "Missing user field in initData" }, 400);
      }
      tgUser = JSON.parse(userJson);
      startParam = params.get("start_param");
    } catch (e) {
      return jsonRes({ success: false, error: "Failed to parse user details" }, 400);
    }

    const tg = {
      id: tgUser.id?.toString(),
      username: tgUser.username || `user_${tgUser.id}`,
      firstName: tgUser.first_name || 'Anonymous',
      lastName: tgUser.last_name || '',
      languageCode: tgUser.language_code || 'en',
      isPremium: !!tgUser.is_premium,
      startParam
    };

    const firestore = new WorkerFirestoreClient(env);

    try {
      // POST /api/auth
      if (path === "/api/auth" && request.method === "POST") {
        let user = await firestore.getUser(tg.id);
        let isNew = false;

        if (!user) {
          isNew = true;
          const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
          let referredBy: string | null = null;

          if (tg.startParam && tg.startParam.startsWith('ref_')) {
            const code = tg.startParam.substring(4);
            const referrer = await firestore.getUserByReferralCode(code);
            if (referrer && referrer.telegramId !== tg.id) {
              referredBy = referrer.telegramId;
            }
          }

          user = {
            telegramId: tg.id,
            username: tg.username,
            firstName: tg.firstName,
            lastName: tg.lastName,
            languageCode: tg.languageCode,
            isPremium: tg.isPremium,
            balance: 0,
            accountAgeYears: 0,
            accountAgeMonths: 0,
            accountAgeDays: 0,
            accountAgeEstimate: false,
            accountAgeSource: 'not-checked',
            accountAgeCheckedAt: null,
            welcomeRewardClaimed: false,
            ageRewardClaimed: false,
            premiumRewardClaimed: false,
            onboardingCompleted: false,
            referralCode,
            referredBy,
            referralsCount: 0,
            referralEarnings: 0,
            tasksCompleted: [],
            totalEarned: 0,
            createdAt: new Date().toISOString(),
            updatedAt: new Date().toISOString()
          };

          await firestore.saveUser(user);
        } else {
          let changed = false;
          if (user.username !== tg.username) { user.username = tg.username; changed = true; }
          if (user.firstName !== tg.firstName) { user.firstName = tg.firstName; changed = true; }
          if (user.lastName !== tg.lastName) { user.lastName = tg.lastName; changed = true; }
          if (user.isPremium !== tg.isPremium) { user.isPremium = tg.isPremium; changed = true; }

          if (changed) {
            await firestore.saveUser(user);
          }
        }

        return jsonRes({ success: true, user, isNew });
      }

      // GET /api/user
      if (path === "/api/user" && request.method === "GET") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);
        return jsonRes({ success: true, user });
      }

      // GET /api/profile
      if (path === "/api/profile" && request.method === "GET") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);
        return jsonRes({ success: true, profile: user });
      }

      // POST /api/onboarding/welcome
      if (path === "/api/onboarding/welcome" && request.method === "POST") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);

        if (user.welcomeRewardClaimed) {
          const txs = await firestore.getTransactions(tg.id);
          const existingTx = txs.find(t => t.type === TransactionType.WELCOME_REWARD);
          return jsonRes({ success: true, user, transaction: existingTx });
        }

        const reward = DEFAULT_REWARD_CONFIG.welcomeReward;
        user.welcomeRewardClaimed = true;
        user.balance += reward;
        user.totalEarned += reward;

        const tx: Transaction = {
          transactionId: `welcome_${tg.id}`,
          type: TransactionType.WELCOME_REWARD,
          amount: reward,
          description: "DogsAI Welcome Reward",
          source: "welcome",
          createdAt: new Date().toISOString()
        };

        await firestore.addTransaction(tg.id, tx);
        await firestore.saveUser(user);

        if (user.referredBy) {
          const referrer = await firestore.getUser(user.referredBy);
          if (referrer) {
            const refReward = 250;
            referrer.referralsCount += 1;
            referrer.referralEarnings += refReward;
            referrer.balance += refReward;
            referrer.totalEarned += refReward;

            const refTx: Transaction = {
              transactionId: `ref_reward_${user.referredBy}_${tg.id}`,
              type: TransactionType.REFERRAL_REWARD,
              amount: refReward,
              description: `Referral bonus for inviting @${user.username || tg.id}`,
              source: tg.id,
              createdAt: new Date().toISOString()
            };

            await firestore.addTransaction(user.referredBy, refTx);
            await firestore.saveUser(referrer);
          }
        }

        return jsonRes({ success: true, user, transaction: tx });
      }

      // POST /api/account-age
      if (path === "/api/account-age" && request.method === "POST") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);

        if (user.accountAgeCheckedAt) {
          return jsonRes({ success: true, user });
        }

        if (env.ACCOUNT_AGE_API_URL && env.ACCOUNT_AGE_API_KEY) {
          try {
            const resAge = await fetch(`${env.ACCOUNT_AGE_API_URL}?id=${tg.id}`, {
              headers: { "Authorization": `Bearer ${env.ACCOUNT_AGE_API_KEY}` }
            });

            if (resAge.ok) {
              const ageData = await resAge.json() as any;
              user.accountAgeYears = ageData.years || 0;
              user.accountAgeMonths = ageData.months || 0;
              user.accountAgeDays = ageData.days || 0;
              user.accountAgeSource = ageData.source || "external-estimation-api";
              user.accountAgeEstimate = true;
              user.accountAgeCheckedAt = new Date().toISOString();
              await firestore.saveUser(user);
              return jsonRes({ success: true, user });
            }
          } catch (e) {
            // Service error triggers graceful fallback
          }
        }

        return jsonRes({ 
          success: false, 
          error: "Account age estimation provider is currently offline or unconfigured." 
        }, 503);
      }

      // POST /api/reward/account-age
      if (path === "/api/reward/account-age" && request.method === "POST") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);

        if (user.ageRewardClaimed) {
          const txs = await firestore.getTransactions(tg.id);
          const existingTx = txs.find(t => t.type === TransactionType.ACCOUNT_AGE_REWARD);
          return jsonRes({ success: true, user, transaction: existingTx });
        }

        const totalMonths = (user.accountAgeYears * 12) + user.accountAgeMonths;
        if (totalMonths === 0 && !user.accountAgeCheckedAt) {
          return jsonRes({ success: false, error: "Please estimate account age first" }, 400);
        }

        let reward = 0;
        for (const range of DEFAULT_REWARD_CONFIG.ageRanges) {
          if (totalMonths >= range.minMonths && totalMonths < range.maxMonths) {
            reward = range.reward;
            break;
          }
        }
        if (reward === 0) reward = 100;

        user.ageRewardClaimed = true;
        user.balance += reward;
        user.totalEarned += reward;

        const tx: Transaction = {
          transactionId: `age_${tg.id}`,
          type: TransactionType.ACCOUNT_AGE_REWARD,
          amount: reward,
          description: `Account Age Reward (${user.accountAgeYears}y, ${user.accountAgeMonths}m)`,
          source: "account-age",
          createdAt: new Date().toISOString()
        };

        await firestore.addTransaction(tg.id, tx);
        await firestore.saveUser(user);

        return jsonRes({ success: true, user, transaction: tx });
      }

      // POST /api/reward/premium
      if (path === "/api/reward/premium" && request.method === "POST") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);

        if (user.premiumRewardClaimed) {
          user.onboardingCompleted = true;
          await firestore.saveUser(user);
          const txs = await firestore.getTransactions(tg.id);
          const existingTx = txs.find(t => t.type === TransactionType.PREMIUM_REWARD);
          return jsonRes({ success: true, user, transaction: existingTx });
        }

        let tx: Transaction | null = null;
        if (user.isPremium) {
          const reward = DEFAULT_REWARD_CONFIG.premiumReward;
          user.balance += reward;
          user.totalEarned += reward;

          tx = {
            transactionId: `premium_${tg.id}`,
            type: TransactionType.PREMIUM_REWARD,
            amount: reward,
            description: "Telegram Premium Reward",
            source: "premium",
            createdAt: new Date().toISOString()
          };
          await firestore.addTransaction(tg.id, tx);
        }

        user.premiumRewardClaimed = true;
        user.onboardingCompleted = true;
        await firestore.saveUser(user);

        return jsonRes({ success: true, user, transaction: tx });
      }

      // GET /api/tasks
      if (path === "/api/tasks" && request.method === "GET") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);

        const tasks = DEFAULT_TASKS.map(task => ({
          ...task,
          completed: user.tasksCompleted.includes(task.id)
        }));

        return jsonRes({ success: true, tasks });
      }

      // POST /api/tasks/complete
      if (path === "/api/tasks/complete" && request.method === "POST") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);

        const body = await request.json() as any;
        const taskId = body.taskId;

        const task = DEFAULT_TASKS.find(t => t.id === taskId);
        if (!task) return jsonRes({ success: false, error: "Task not found" }, 404);

        if (user.tasksCompleted.includes(taskId)) {
          return jsonRes({ success: true, user, message: "Already completed" });
        }

        user.tasksCompleted.push(taskId);
        user.balance += task.reward;
        user.totalEarned += task.reward;

        const tx: Transaction = {
          transactionId: `task_${taskId}_${tg.id}`,
          type: TransactionType.TASK_REWARD,
          amount: task.reward,
          description: `Task completed: ${task.title}`,
          source: "task",
          createdAt: new Date().toISOString()
        };

        await firestore.addTransaction(tg.id, tx);
        await firestore.saveUser(user);

        return jsonRes({ success: true, user, transaction: tx });
      }

      // GET /api/referrals
      if (path === "/api/referrals" && request.method === "GET") {
        const user = await firestore.getUser(tg.id);
        if (!user) return jsonRes({ success: false, error: "User not found" }, 404);

        const allTxs = await firestore.getTransactions(tg.id);
        const referralTxs = allTxs.filter(t => t.type === TransactionType.REFERRAL_REWARD);

        const friends = referralTxs.map(tx => ({
          telegramId: tx.source,
          username: tx.description.split('@')[1] || tx.source,
          earnedAmount: tx.amount,
          createdAt: tx.createdAt
        }));

        return jsonRes({
          success: true,
          referralsCount: user.referralsCount,
          referralEarnings: user.referralEarnings,
          referralCode: user.referralCode,
          friends
        });
      }

      // GET /api/transactions
      if (path === "/api/transactions" && request.method === "GET") {
        const txs = await firestore.getTransactions(tg.id);
        const sortedTxs = txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
        return jsonRes({ success: true, transactions: sortedTxs });
      }

      return jsonRes({ success: false, error: "Endpoint not found" }, 404);
    } catch (e: any) {
      return jsonRes({ success: false, error: e.message || "Internal server error" }, 500);
    }
  }
};
