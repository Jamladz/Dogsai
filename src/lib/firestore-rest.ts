import { User, Transaction } from '../types';

// JWT Web Crypto Helpers
function base64url(source: any): string {
  const binary = typeof source === 'string' ? new TextEncoder().encode(source) : new Uint8Array(source);
  let base64 = btoa(String.fromCharCode(...Array.from(binary)));
  return base64.replace(/=/g, '').replace(/\+/g, '-').replace(/\//g, '_');
}

function base64ToArrayBuffer(base64: string): ArrayBuffer {
  // Replace spacing, newlines, etc.
  const cleaned = base64.replace(/\s/g, '');
  const binaryString = atob(cleaned);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes.buffer;
}

function cleanPrivateKey(pem: string): string {
  return pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
}

export function fromFirestoreFields(fields: any): any {
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
        return fromFirestoreFields(item.mapValue?.fields);
      });
    } else if (val.mapValue !== undefined) {
      result[key] = fromFirestoreFields(val.mapValue.fields);
    } else if (val.nullValue !== undefined) {
      result[key] = null;
    }
  }
  return result;
}

export function toFirestoreFields(obj: any): any {
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
            return { mapValue: { fields: toFirestoreFields(item) } };
          })
        }
      };
    } else if (typeof val === 'object') {
      if (val instanceof Date) {
        fields[key] = { timestampValue: val.toISOString() };
      } else {
        fields[key] = { mapValue: { fields: toFirestoreFields(val) } };
      }
    }
  }
  return fields;
}

// Memory-based local DB simulation for development
class SimulatedDatabase {
  private users: Map<string, User> = new Map();
  private transactions: Map<string, Transaction[]> = new Map();

  constructor() {
    this.load();
  }

  private load() {
    try {
      // In the server runtime, we can try using Node FS. Since this runs in Express,
      // it persists beautifully. In browser/workers, we keep it in memory.
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(process.cwd(), 'dogsai_dev_db.json');
        if (fs.existsSync(dbPath)) {
          const raw = fs.readFileSync(dbPath, 'utf8');
          const parsed = JSON.parse(raw);
          for (const key of Object.keys(parsed.users || {})) {
            this.users.set(key, parsed.users[key]);
          }
          for (const key of Object.keys(parsed.transactions || {})) {
            this.transactions.set(key, parsed.transactions[key]);
          }
        }
      }
    } catch (e) {
      // Fail silently, fallback to memory
    }
  }

  private save() {
    try {
      if (typeof process !== 'undefined' && process.versions && process.versions.node) {
        const fs = require('fs');
        const path = require('path');
        const dbPath = path.join(process.cwd(), 'dogsai_dev_db.json');
        const data = {
          users: Object.fromEntries(this.users),
          transactions: Object.fromEntries(this.transactions)
        };
        fs.writeFileSync(dbPath, JSON.stringify(data, null, 2), 'utf8');
      }
    } catch (e) {
      // Fail silently
    }
  }

  async getUser(telegramId: string): Promise<User | null> {
    return this.users.get(telegramId) || null;
  }

  async saveUser(user: User): Promise<void> {
    this.users.set(user.telegramId, { ...user, updatedAt: new Date().toISOString() });
    this.save();
  }

  async getTransactions(telegramId: string): Promise<Transaction[]> {
    return this.transactions.get(telegramId) || [];
  }

  async addTransaction(telegramId: string, tx: Transaction): Promise<void> {
    const list = this.transactions.get(telegramId) || [];
    list.push(tx);
    this.transactions.set(telegramId, list);
    this.save();
  }
}

const simulatedDb = new SimulatedDatabase();

export interface FirebaseConfigEnv {
  projectId?: string;
  clientEmail?: string;
  privateKey?: string;
}

export class FirestoreRestClient {
  private config: FirebaseConfigEnv;
  private token: { value: string; expiry: number } | null = null;
  private isConfigured: boolean = false;

  constructor(config: FirebaseConfigEnv) {
    this.config = config;
    if (config.projectId && config.clientEmail && config.privateKey) {
      this.isConfigured = true;
    }
  }

  getIsConfigured(): boolean {
    return this.isConfigured;
  }

  // Exchanges Service Account JWT for an OAuth 2.0 access token using Web Crypto API
  private async getAccessToken(): Promise<string> {
    if (!this.isConfigured) {
      throw new Error("Firestore rest client is not configured.");
    }

    const now = Math.floor(Date.now() / 1000);
    if (this.token && this.token.expiry > now + 60) {
      return this.token.value;
    }

    const clientEmail = this.config.clientEmail!;
    const privateKeyRaw = this.config.privateKey!;
    
    // Normalize private key formatting to prevent parse failures
    const formattedKey = privateKeyRaw.replace(/\\n/g, '\n');
    const base64Key = cleanPrivateKey(formattedKey);
    const binaryKey = base64ToArrayBuffer(base64Key);

    const cryptoKey = await crypto.subtle.importKey(
      "pkcs8",
      binaryKey,
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

    const headerStr = base64url(JSON.stringify(header));
    const payloadStr = base64url(JSON.stringify(payload));
    const stringToSign = `${headerStr}.${payloadStr}`;

    const signatureBuffer = await crypto.subtle.sign(
      "RSASSA-PKCS1-v1_5",
      cryptoKey,
      new TextEncoder().encode(stringToSign)
    );

    const jwt = `${stringToSign}.${base64url(signatureBuffer)}`;

    // Exchange JWT for access token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: `grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer&assertion=${jwt}`
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Failed to obtain Google access token: ${errorText}`);
    }

    const tokenData = await tokenResponse.json() as any;
    this.token = {
      value: tokenData.access_token,
      expiry: now + (tokenData.expires_in || 3600)
    };

    return this.token!.value;
  }

  // GET User document
  async getUser(telegramId: string): Promise<User | null> {
    if (!this.isConfigured) {
      return simulatedDb.getUser(telegramId);
    }

    try {
      const token = await this.getAccessToken();
      const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/users/${telegramId}`;
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.status === 404) {
        return null;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Firestore REST getUser failed: ${errText}`);
      }

      const doc = await response.json() as any;
      return fromFirestoreFields(doc.fields) as User;
    } catch (error) {
      console.error("Firestore Client error, falling back to simulation:", error);
      return simulatedDb.getUser(telegramId);
    }
  }

  // SAVE User document (inserts or updates)
  async saveUser(user: User): Promise<void> {
    if (!this.isConfigured) {
      return simulatedDb.saveUser(user);
    }

    try {
      const token = await this.getAccessToken();
      const fields = toFirestoreFields(user);
      const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/users/${user.telegramId}`;
      
      const response = await fetch(url, {
        method: "PATCH",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Firestore REST saveUser failed: ${errText}`);
      }
    } catch (error) {
      console.error("Firestore Client error, falling back to simulation:", error);
      return simulatedDb.saveUser(user);
    }
  }

  // GET Transactions subcollection for a specific user
  async getTransactions(telegramId: string): Promise<Transaction[]> {
    if (!this.isConfigured) {
      return simulatedDb.getTransactions(telegramId);
    }

    try {
      const token = await this.getAccessToken();
      // Firestore REST API list documents in users/{telegramId}/transactions subcollection
      const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/users/${telegramId}/transactions`;
      const response = await fetch(url, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });

      if (response.status === 404) {
        return [];
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Firestore REST list transactions failed: ${errText}`);
      }

      const data = await response.json() as any;
      const documents = data.documents || [];
      return documents.map((doc: any) => fromFirestoreFields(doc.fields)) as Transaction[];
    } catch (error) {
      console.error("Firestore Client error, falling back to simulation:", error);
      return simulatedDb.getTransactions(telegramId);
    }
  }

  // ADD a transaction (idempotent, using transactionId as documentId)
  async addTransaction(telegramId: string, transaction: Transaction): Promise<void> {
    if (!this.isConfigured) {
      return simulatedDb.addTransaction(telegramId, transaction);
    }

    try {
      const token = await this.getAccessToken();
      const fields = toFirestoreFields(transaction);
      // Create document in subcollection, using transaction.transactionId as document ID
      const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents/users/${telegramId}/transactions?documentId=${transaction.transactionId}`;
      
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ fields })
      });

      if (response.status === 409) {
        // Document already exists, idempotent success!
        return;
      }

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Firestore REST addTransaction failed: ${errText}`);
      }
    } catch (error) {
      console.error("Firestore Client error, falling back to simulation:", error);
      return simulatedDb.addTransaction(telegramId, transaction);
    }
  }

  // Get user by referral code (for referral validation)
  async getUserByReferralCode(referralCode: string): Promise<User | null> {
    if (!this.isConfigured) {
      // Search local db
      const allUsers = Array.from((simulatedDb as any).users.values()) as User[];
      return allUsers.find(u => u.referralCode === referralCode) || null;
    }

    try {
      const token = await this.getAccessToken();
      const url = `https://firestore.googleapis.com/v1/projects/${this.config.projectId}/databases/(default)/documents:runQuery`;
      
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

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Firestore REST runQuery failed: ${errText}`);
      }

      const results = await response.json() as any;
      if (results && results.length > 0 && results[0].document) {
        const doc = results[0].document;
        return fromFirestoreFields(doc.fields) as User;
      }

      return null;
    } catch (error) {
      console.error("Firestore Client runQuery error, falling back to simulation:", error);
      const allUsers = Array.from((simulatedDb as any).users.values()) as User[];
      return allUsers.find(u => u.referralCode === referralCode) || null;
    }
  }
}
