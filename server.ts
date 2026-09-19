import express from 'express';
import path from 'path';
import dotenv from 'dotenv';
import { FirestoreRestClient } from './src/lib/firestore-rest';
import { 
  User, 
  Transaction, 
  TransactionType, 
  DEFAULT_REWARD_CONFIG, 
  DEFAULT_TASKS,
  Task 
} from './src/types';

// Load environment variables
dotenv.config();

const app = express();
const PORT = 3000;

app.use(express.json());

// Initialize Firestore Client
const firestoreClient = new FirestoreRestClient({
  projectId: process.env.FIREBASE_PROJECT_ID,
  clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
  privateKey: process.env.FIREBASE_PRIVATE_KEY
});

console.log(`Firestore REST Client Initialized. Configured for real Firebase: ${firestoreClient.getIsConfigured()}`);

// Utility: Web Crypto Telegram initData validation (standard HMAC-SHA256)
async function validateTelegramInitData(initData: string, botToken: string): Promise<boolean> {
  if (!botToken || botToken === "YOUR_TELEGRAM_BOT_TOKEN") {
    // Development bypass if no token is configured
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
    console.error("Telegram validation error:", err);
    return false;
  }
}

// Middleware: Authenticate Telegram User from Authorization Header or body parameter
async function telegramAuthMiddleware(req: any, res: any, next: any) {
  const initData = req.headers['x-telegram-init-data'] as string || req.body?.initData as string;
  if (!initData) {
    return res.status(401).json({ success: false, error: "Missing Telegram initData" });
  }

  const isValid = await validateTelegramInitData(initData, process.env.TELEGRAM_BOT_TOKEN || '');
  if (!isValid) {
    return res.status(401).json({ success: false, error: "Invalid Telegram authentication signature" });
  }

  // Parse user information from initData
  try {
    const params = new URLSearchParams(initData);
    const userJson = params.get("user");
    if (!userJson) {
      return res.status(400).json({ success: false, error: "User metadata not found in initData" });
    }

    const tgUser = JSON.parse(userJson);
    req.telegramUser = {
      id: tgUser.id?.toString(),
      username: tgUser.username || `user_${tgUser.id}`,
      firstName: tgUser.first_name || 'Anonymous',
      lastName: tgUser.last_name || '',
      languageCode: tgUser.language_code || 'en',
      isPremium: !!tgUser.is_premium,
      startParam: params.get("start_param") || null
    };

    next();
  } catch (e) {
    return res.status(400).json({ success: false, error: "Failed to parse Telegram user details" });
  }
}

// -----------------------------------------------------------------
// API ENDPOINTS
// -----------------------------------------------------------------

// POST /api/auth
// Authenticate & register a Telegram user, checks and initializes referral linkages
app.post('/api/auth', telegramAuthMiddleware, async (req: any, res: any) => {
  const tg = req.telegramUser;
  
  try {
    let user = await firestoreClient.getUser(tg.id);
    let isNew = false;

    if (!user) {
      isNew = true;
      // Generate a clean referral code (base-36 timestamp/random string)
      const referralCode = Math.random().toString(36).substring(2, 8).toUpperCase();
      
      let referredBy: string | null = null;
      if (tg.startParam && tg.startParam.startsWith('ref_')) {
        const code = tg.startParam.substring(4);
        const referrer = await firestoreClient.getUserByReferralCode(code);
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

      await firestoreClient.saveUser(user);
    } else {
      // Update basic fields if changed
      let changed = false;
      if (user.username !== tg.username) { user.username = tg.username; changed = true; }
      if (user.firstName !== tg.firstName) { user.firstName = tg.firstName; changed = true; }
      if (user.lastName !== tg.lastName) { user.lastName = tg.lastName; changed = true; }
      if (user.isPremium !== tg.isPremium) { user.isPremium = tg.isPremium; changed = true; }

      if (changed) {
        await firestoreClient.saveUser(user);
      }
    }

    res.json({
      success: true,
      user,
      isNew
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/user
app.get('/api/user', telegramAuthMiddleware, async (req: any, res: any) => {
  try {
    const user = await firestoreClient.getUser(req.telegramUser.id);
    if (!user) {
      return res.status(404).json({ success: false, error: "User not found" });
    }
    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/profile (alias for user detail stats)
app.get('/api/profile', telegramAuthMiddleware, async (req: any, res: any) => {
  try {
    const user = await firestoreClient.getUser(req.telegramUser.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });
    res.json({ success: true, profile: user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/onboarding/welcome
// Claims the unique +799 DOGSAI welcome reward
app.post('/api/onboarding/welcome', telegramAuthMiddleware, async (req: any, res: any) => {
  const telegramId = req.telegramUser.id;

  try {
    const user = await firestoreClient.getUser(telegramId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    // Idempotency check
    if (user.welcomeRewardClaimed) {
      const txs = await firestoreClient.getTransactions(telegramId);
      const existingTx = txs.find(t => t.type === TransactionType.WELCOME_REWARD);
      return res.json({ success: true, user, transaction: existingTx });
    }

    const reward = DEFAULT_REWARD_CONFIG.welcomeReward;
    
    // Atomically claim the welcome reward
    user.welcomeRewardClaimed = true;
    user.balance += reward;
    user.totalEarned += reward;

    const txId = `welcome_${telegramId}`;
    const tx: Transaction = {
      transactionId: txId,
      type: TransactionType.WELCOME_REWARD,
      amount: reward,
      description: "DogsAI Welcome Reward",
      source: "welcome",
      createdAt: new Date().toISOString()
    };

    // Save transaction and user
    await firestoreClient.addTransaction(telegramId, tx);
    await firestoreClient.saveUser(user);

    // If referred, credit the referrer!
    if (user.referredBy) {
      const referrer = await firestoreClient.getUser(user.referredBy);
      if (referrer) {
        const refReward = 250; // Bonus to referrer for inviting
        referrer.referralsCount += 1;
        referrer.referralEarnings += refReward;
        referrer.balance += refReward;
        referrer.totalEarned += refReward;

        const refTx: Transaction = {
          transactionId: `ref_reward_${user.referredBy}_${telegramId}`,
          type: TransactionType.REFERRAL_REWARD,
          amount: refReward,
          description: `Referral bonus for inviting @${user.username || telegramId}`,
          source: telegramId,
          createdAt: new Date().toISOString()
        };

        await firestoreClient.addTransaction(user.referredBy, refTx);
        await firestoreClient.saveUser(referrer);
      }
    }

    res.json({ success: true, user, transaction: tx });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/account-age
// Resolves the estimated account age based on Telegram ID (calls external service if set)
app.post('/api/account-age', telegramAuthMiddleware, async (req: any, res: any) => {
  const telegramId = req.telegramUser.id;

  try {
    const user = await firestoreClient.getUser(telegramId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    // Cache policy: only retrieve once
    if (user.accountAgeCheckedAt) {
      return res.json({ success: true, user });
    }

    const apiUrl = process.env.ACCOUNT_AGE_API_URL;
    const apiKey = process.env.ACCOUNT_AGE_API_KEY;

    let years = 0;
    let months = 0;
    let days = 0;
    let isEstimate = true;
    let source = "not-checked";

    if (apiUrl && apiKey) {
      try {
        const resAge = await fetch(`${apiUrl}?id=${telegramId}`, {
          headers: {
            "Authorization": `Bearer ${apiKey}`
          }
        });

        if (resAge.ok) {
          const ageData = await resAge.json() as any;
          years = ageData.years || 0;
          months = ageData.months || 0;
          days = ageData.days || 0;
          source = ageData.source || "external-estimation-api";
          isEstimate = true;
        } else {
          throw new Error("External account age provider error");
        }
      } catch (err) {
        console.error("External account age query failed, fallback triggered:", err);
        // Fallback: If external API fails, we do NOT invent an age or reward, displaying graceful fallback
        return res.status(503).json({ 
          success: false, 
          error: "Account age estimation provider is currently offline or unconfigured." 
        });
      }
    } else {
      // Return unconfigured status, do not invent age
      return res.json({ 
        success: false, 
        error: "Account age provider is unconfigured in development environment." 
      });
    }

    // Update user age fields
    user.accountAgeYears = years;
    user.accountAgeMonths = months;
    user.accountAgeDays = days;
    user.accountAgeEstimate = isEstimate;
    user.accountAgeSource = source;
    user.accountAgeCheckedAt = new Date().toISOString();

    await firestoreClient.saveUser(user);

    res.json({ success: true, user });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/reward/account-age
// Secure server-side calculation and claim of the account age reward
app.post('/api/reward/account-age', telegramAuthMiddleware, async (req: any, res: any) => {
  const telegramId = req.telegramUser.id;

  try {
    const user = await firestoreClient.getUser(telegramId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    if (user.ageRewardClaimed) {
      const txs = await firestoreClient.getTransactions(telegramId);
      const existingTx = txs.find(t => t.type === TransactionType.ACCOUNT_AGE_REWARD);
      return res.json({ success: true, user, transaction: existingTx });
    }

    // Total months calculated server-side
    const totalMonths = (user.accountAgeYears * 12) + user.accountAgeMonths;
    if (totalMonths === 0 && !user.accountAgeCheckedAt) {
      return res.status(400).json({ success: false, error: "Please estimate account age first" });
    }

    // Calculate reward server-side from configuration object
    let reward = 0;
    for (const range of DEFAULT_REWARD_CONFIG.ageRanges) {
      if (totalMonths >= range.minMonths && totalMonths < range.maxMonths) {
        reward = range.reward;
        break;
      }
    }

    if (reward === 0) {
      reward = 100; // minimum fallback
    }

    user.ageRewardClaimed = true;
    user.balance += reward;
    user.totalEarned += reward;

    const txId = `age_${telegramId}`;
    const tx: Transaction = {
      transactionId: txId,
      type: TransactionType.ACCOUNT_AGE_REWARD,
      amount: reward,
      description: `Account Age Reward (${user.accountAgeYears} years, ${user.accountAgeMonths} months)`,
      source: "account-age",
      createdAt: new Date().toISOString()
    };

    await firestoreClient.addTransaction(telegramId, tx);
    await firestoreClient.saveUser(user);

    res.json({ success: true, user, transaction: tx });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/reward/premium
// Secure server-side claim of Telegram Premium reward (+500 DOGSAI)
app.post('/api/reward/premium', telegramAuthMiddleware, async (req: any, res: any) => {
  const telegramId = req.telegramUser.id;

  try {
    const user = await firestoreClient.getUser(telegramId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    if (user.premiumRewardClaimed) {
      user.onboardingCompleted = true; // ensure marked complete
      await firestoreClient.saveUser(user);
      const txs = await firestoreClient.getTransactions(telegramId);
      const existingTx = txs.find(t => t.type === TransactionType.PREMIUM_REWARD);
      return res.json({ success: true, user, transaction: existingTx });
    }

    let reward = 0;
    let tx: Transaction | null = null;

    if (user.isPremium) {
      reward = DEFAULT_REWARD_CONFIG.premiumReward;
      user.balance += reward;
      user.totalEarned += reward;

      tx = {
        transactionId: `premium_${telegramId}`,
        type: TransactionType.PREMIUM_REWARD,
        amount: reward,
        description: "Telegram Premium Reward",
        source: "premium",
        createdAt: new Date().toISOString()
      };
      await firestoreClient.addTransaction(telegramId, tx);
    }

    user.premiumRewardClaimed = true;
    user.onboardingCompleted = true; // Complete onboarding

    await firestoreClient.saveUser(user);

    res.json({ success: true, user, transaction: tx });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/tasks
app.get('/api/tasks', telegramAuthMiddleware, async (req: any, res: any) => {
  try {
    const user = await firestoreClient.getUser(req.telegramUser.id);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    // Format tasks listing, appending completed status
    const tasks = DEFAULT_TASKS.map(task => ({
      ...task,
      completed: user.tasksCompleted.includes(task.id)
    }));

    res.json({ success: true, tasks });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// POST /api/tasks/complete
app.post('/api/tasks/complete', telegramAuthMiddleware, async (req: any, res: any) => {
  const telegramId = req.telegramUser.id;
  const { taskId } = req.body;

  try {
    const user = await firestoreClient.getUser(telegramId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    const task = DEFAULT_TASKS.find(t => t.id === taskId);
    if (!task) {
      return res.status(404).json({ success: false, error: "Task definition not found" });
    }

    if (user.tasksCompleted.includes(taskId)) {
      return res.json({ success: true, user, message: "Task already completed" });
    }

    // Record completed state
    user.tasksCompleted.push(taskId);
    user.balance += task.reward;
    user.totalEarned += task.reward;

    const txId = `task_${taskId}_${telegramId}`;
    const tx: Transaction = {
      transactionId: txId,
      type: TransactionType.TASK_REWARD,
      amount: task.reward,
      description: `Task completed: ${task.title}`,
      source: "task",
      createdAt: new Date().toISOString()
    };

    await firestoreClient.addTransaction(telegramId, tx);
    await firestoreClient.saveUser(user);

    res.json({ success: true, user, transaction: tx });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/referrals
// Returns the current user's referral stats and list of invited friends
app.get('/api/referrals', telegramAuthMiddleware, async (req: any, res: any) => {
  const telegramId = req.telegramUser.id;

  try {
    const user = await firestoreClient.getUser(telegramId);
    if (!user) return res.status(404).json({ success: false, error: "User not found" });

    // Read all transactions to find referred users
    const allTxs = await firestoreClient.getTransactions(telegramId);
    const referralTxs = allTxs.filter(t => t.type === TransactionType.REFERRAL_REWARD);

    const friends = referralTxs.map(tx => ({
      telegramId: tx.source,
      username: tx.description.split('@')[1] || tx.source,
      earnedAmount: tx.amount,
      createdAt: tx.createdAt
    }));

    res.json({
      success: true,
      referralsCount: user.referralsCount,
      referralEarnings: user.referralEarnings,
      referralCode: user.referralCode,
      friends
    });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// GET /api/transactions
app.get('/api/transactions', telegramAuthMiddleware, async (req: any, res: any) => {
  try {
    const txs = await firestoreClient.getTransactions(req.telegramUser.id);
    const sortedTxs = txs.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    res.json({ success: true, transactions: sortedTxs });
  } catch (error: any) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// Serve frontend in production mode or mount Vite dev server in development
const distPath = path.join(process.cwd(), 'dist');

async function setupVite() {
  if (process.env.NODE_ENV !== 'production') {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa'
    });
    app.use(vite.middlewares);
    console.log("Vite Development Server middleware mounted.");
  } else {
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
    console.log("Serving static production assets from /dist.");
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`DogsAI Server running on port ${PORT}`);
  });
}

setupVite();
