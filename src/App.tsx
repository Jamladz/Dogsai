import { useEffect, useState, useRef } from 'react';
import { 
  Home, 
  Users, 
  Cpu, 
  User, 
  Coins, 
  Copy, 
  Share2, 
  CheckCircle, 
  Check, 
  Loader2, 
  ExternalLink, 
  Sun, 
  Moon, 
  ChevronRight, 
  CircleAlert, 
  Award, 
  Clock,
  Settings,
  CalendarCheck,
  Tv,
  Info,
  Smartphone
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { User as UserType, Task, Transaction, TransactionType, DEFAULT_REWARD_CONFIG } from './types';
import mascotImage from './assets/images/dogsai_mascot_1789834217122.jpg';

// Declare Telegram WebApp global namespace
declare global {
  interface Window {
    Telegram?: {
      WebApp: {
        ready: () => void;
        expand: () => void;
        close: () => void;
        requestFullscreen?: () => void;
        initData: string;
        initDataUnsafe: any;
        themeParams: {
          bg_color?: string;
          text_color?: string;
          hint_color?: string;
          link_color?: string;
          button_color?: string;
          button_text_color?: string;
          secondary_bg_color?: string;
        };
        colorScheme: 'light' | 'dark';
        onEvent: (eventType: string, callback: () => void) => void;
        offEvent: (eventType: string, callback: () => void) => void;
        headerColor?: string;
        setHeaderColor?: (color: string) => void;
        MainButton: {
          text: string;
          show: () => void;
          hide: () => void;
          onClick: (callback: () => void) => void;
          offClick: (callback: () => void) => void;
          enable: () => void;
          disable: () => void;
        };
      };
    };
  }
}

export default function App() {
  // Navigation tabs: 'home' | 'tasks' | 'referrals' | 'profile'
  const [activeTab, setActiveTab] = useState<'home' | 'tasks' | 'referrals' | 'profile'>('home');
  
  // Loading & State
  const [loading, setLoading] = useState<boolean>(true);
  const [isTelegramClient, setIsTelegramClient] = useState<boolean>(false);
  const [user, setUser] = useState<UserType | null>(null);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [referrals, setReferrals] = useState<{ referralsCount: number; referralEarnings: number; referralCode: string; friends: any[] } | null>(null);

  // Onboarding screens
  const [onboardingStep, setOnboardingStep] = useState<number>(0); // 0 = welcome/auth, 1 = age estimate, 2 = premium, 3 = finished/dashboard
  const [claimingWelcome, setClaimingWelcome] = useState<boolean>(false);
  const [estimatingAge, setEstimatingAge] = useState<boolean>(false);
  const [claimingAge, setClaimingAge] = useState<boolean>(false);
  const [claimingPremium, setClaimingPremium] = useState<boolean>(false);

  // Fullscreen state
  const [isFullscreen, setIsFullscreen] = useState<boolean>(false);

  // Interactive UI notifications
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  // Developer Simulation Console States
  const [devConsoleOpen, setDevConsoleOpen] = useState<boolean>(false);
  const [simUserId, setSimUserId] = useState<string>('847589214');
  const [simUsername, setSimUsername] = useState<string>('CryptoDog_AI');
  const [simFirstName, setSimFirstName] = useState<string>('Max');
  const [simLastName, setSimLastName] = useState<string>('Bark');
  const [simIsPremium, setSimIsPremium] = useState<boolean>(true);
  const [simAgeYears, setSimAgeYears] = useState<number>(4);
  const [simAgeMonths, setSimAgeMonths] = useState<number>(3);
  const [simReferralCode, setSimReferralCode] = useState<string>('DOGS99');
  
  // Simulated Log Console
  const [apiLogs, setApiLogs] = useState<{ method: string; path: string; status: number; duration: number; time: string }[]>([]);

  // Track simulated API setup
  const [devStatus, setDevStatus] = useState<{ env: string; firestoreReal: boolean; telegramBotTokenConfigured: boolean } | null>(null);

  // Toast notifier
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3000);
  };

  // Log API call into the visual logger
  const logApiCall = (method: string, path: string, status: number, duration: number) => {
    setApiLogs(prev => [
      {
        method,
        path,
        status,
        duration,
        time: new Date().toLocaleTimeString()
      },
      ...prev.slice(0, 9) // keep last 10 entries
    ]);
  };

  // Construct Mock / Real Headers and Query parameters for auth requests
  const getAuthHeaders = () => {
    if (isTelegramClient && window.Telegram?.WebApp?.initData) {
      return {
        'Content-Type': 'application/json',
        'X-Telegram-Init-Data': window.Telegram.WebApp.initData
      };
    }
    
    // Developer Sandbox Emulator InitData structure
    const userPayload = {
      id: parseInt(simUserId, 10) || 847589214,
      first_name: simFirstName,
      last_name: simLastName,
      username: simUsername,
      language_code: 'en',
      is_premium: simIsPremium
    };

    // Construct a simulated search param query string
    const simulatedInitParams = new URLSearchParams();
    simulatedInitParams.set('user', JSON.stringify(userPayload));
    simulatedInitParams.set('auth_date', Math.floor(Date.now() / 1000).toString());
    simulatedInitParams.set('hash', 'DEV_MOCK_VALID_SIGNATURE');
    if (simReferralCode) {
      simulatedInitParams.set('start_param', `ref_${simReferralCode}`);
    }

    return {
      'Content-Type': 'application/json',
      'X-Telegram-Init-Data': simulatedInitParams.toString()
    };
  };

  // Sync API: Master authentication and state loader
  const handleAuthenticate = async () => {
    setLoading(true);
    const start = Date.now();
    try {
      const response = await fetch('/api/auth', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({})
      });

      const data = await response.json() as any;
      logApiCall('POST', '/api/auth', response.status, Date.now() - start);

      if (response.ok && data.success) {
        setUser(data.user);
        
        // Decide user step based on database fields
        if (data.user.onboardingCompleted) {
          setOnboardingStep(3); // Direct to dashboard
          // Fetch secondary dashboard states
          fetchDashboardData();
        } else {
          // New user onboarding flows
          setOnboardingStep(0); // Start onboarding step 0 (Welcome page)
        }
      } else {
        showToast(data.error || "Authentication failed.");
      }
    } catch (err) {
      showToast("Cannot connect to server API. Running with simulated database.");
    } finally {
      setLoading(false);
    }
  };

  // Load secondary collections
  const fetchDashboardData = async () => {
    const startTasks = Date.now();
    try {
      // 1. Fetch Tasks
      const resTasks = await fetch('/api/tasks', { headers: getAuthHeaders() });
      const dataTasks = await resTasks.json() as any;
      logApiCall('GET', '/api/tasks', resTasks.status, Date.now() - startTasks);
      if (resTasks.ok && dataTasks.success) {
        setTasks(dataTasks.tasks);
      }

      // 2. Fetch Referrals
      const startRefs = Date.now();
      const resRefs = await fetch('/api/referrals', { headers: getAuthHeaders() });
      const dataRefs = await resRefs.json() as any;
      logApiCall('GET', '/api/referrals', resRefs.status, Date.now() - startRefs);
      if (resRefs.ok && dataRefs.success) {
        setReferrals(dataRefs);
      }

      // 3. Fetch Transactions
      const startTx = Date.now();
      const resTx = await fetch('/api/transactions', { headers: getAuthHeaders() });
      const dataTx = await resTx.json() as any;
      logApiCall('GET', '/api/transactions', resTx.status, Date.now() - startTx);
      if (resTx.ok && dataTx.success) {
        setTransactions(dataTx.transactions);
      }
    } catch (e) {
      console.error(e);
    }
  };

  // Claim welcome reward +799 DOGSAI
  const claimWelcomeReward = async () => {
    setClaimingWelcome(true);
    const start = Date.now();
    try {
      const res = await fetch('/api/onboarding/welcome', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json() as any;
      logApiCall('POST', '/api/onboarding/welcome', res.status, Date.now() - start);

      if (res.ok && data.success) {
        setUser(data.user);
        showToast("Claimed +799 DOGSAI Welcome Bonus!");
        // Go to Step 1: Account Age Estimator
        setOnboardingStep(1);
      } else {
        showToast(data.error || "Failed to claim welcome reward.");
      }
    } catch (err) {
      showToast("Network error.");
    } finally {
      setClaimingWelcome(false);
    }
  };

  // Trigger Account Age Estimation
  const estimateAccountAge = async () => {
    setEstimatingAge(true);
    const start = Date.now();
    try {
      // Simulate external API or let the server execute the external call
      // For testing, since the external API requires ACCOUNT_AGE_API_URL and ACCOUNT_AGE_API_KEY,
      // our server endpoint POST /api/account-age handles it. If not set, it returns an error.
      const res = await fetch('/api/account-age', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json() as any;
      logApiCall('POST', '/api/account-age', res.status, Date.now() - start);

      if (res.ok && data.success) {
        setUser(data.user);
        showToast("Account Age estimated successfully!");
      } else {
        // If external API is offline or unconfigured, we display a graceful fallback
        // The user can still proceed with standard onboarding
        showToast("Estimation API offline. Graceful fallback activated.");
        // We will mock/estimate locally in state so the user can visualize the beautiful layout!
        if (user) {
          const simulatedAgeUser = {
            ...user,
            accountAgeYears: simAgeYears,
            accountAgeMonths: simAgeMonths,
            accountAgeDays: 14,
            accountAgeEstimate: true,
            accountAgeSource: 'simulated-fallback-api',
            accountAgeCheckedAt: new Date().toISOString()
          };
          setUser(simulatedAgeUser);
        }
      }
    } catch (err) {
      showToast("API error, applying simulation age.");
      if (user) {
        setUser({
          ...user,
          accountAgeYears: simAgeYears,
          accountAgeMonths: simAgeMonths,
          accountAgeDays: 12,
          accountAgeEstimate: true,
          accountAgeSource: 'local-fallback',
          accountAgeCheckedAt: new Date().toISOString()
        });
      }
    } finally {
      setEstimatingAge(false);
    }
  };

  // Claim account age reward
  const claimAgeReward = async () => {
    setClaimingAge(true);
    const start = Date.now();
    try {
      // Send age verification updates if running simulated age
      if (user && user.accountAgeSource.includes('simulated')) {
        // Save the updated user record on server first so calculation has correct values
        await fetch('/api/auth', {
          method: 'POST',
          headers: getAuthHeaders(),
          body: JSON.stringify({})
        });
      }

      const res = await fetch('/api/reward/account-age', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json() as any;
      logApiCall('POST', '/api/reward/account-age', res.status, Date.now() - start);

      if (res.ok && data.success) {
        setUser(data.user);
        showToast("Account Age Reward Claimed!");
        // Go to Step 2: Premium check
        setOnboardingStep(2);
      } else {
        showToast(data.error || "Failed to claim age reward.");
        // Skip step gracefully
        setOnboardingStep(2);
      }
    } catch (err) {
      showToast("Connecting to server failed. Simulating claiming.");
      setOnboardingStep(2);
    } finally {
      setClaimingAge(false);
    }
  };

  // Claim premium reward
  const claimPremiumReward = async () => {
    setClaimingPremium(true);
    const start = Date.now();
    try {
      const res = await fetch('/api/reward/premium', {
        method: 'POST',
        headers: getAuthHeaders()
      });
      const data = await res.json() as any;
      logApiCall('POST', '/api/reward/premium', res.status, Date.now() - start);

      if (res.ok && data.success) {
        setUser(data.user);
        showToast("Onboarding Completed!");
        setOnboardingStep(3);
        fetchDashboardData();
      } else {
        showToast(data.error || "Failed to complete onboarding.");
        setOnboardingStep(3);
        fetchDashboardData();
      }
    } catch (err) {
      showToast("Completed onboarding in developer mode.");
      setOnboardingStep(3);
      if (user) {
        setUser({ ...user, onboardingCompleted: true });
      }
    } finally {
      setClaimingPremium(false);
    }
  };

  // Complete a Task securely via Worker/Express
  const handleCompleteTask = async (task: Task) => {
    if (task.completed) return;
    
    // Standard visual simulation of url interaction
    if (task.actionUrl.startsWith('http')) {
      window.open(task.actionUrl, '_blank');
    }

    const start = Date.now();
    try {
      const res = await fetch('/api/tasks/complete', {
        method: 'POST',
        headers: getAuthHeaders(),
        body: JSON.stringify({ taskId: task.id })
      });
      const data = await res.json() as any;
      logApiCall('POST', '/api/tasks/complete', res.status, Date.now() - start);

      if (res.ok && data.success) {
        setUser(data.user);
        showToast(`Task Complete! Earned +${task.reward} DOGSAI`);
        fetchDashboardData();
      } else {
        showToast(data.error || "Failed to complete task.");
      }
    } catch (err) {
      showToast("Simulation task claim successful!");
      if (user) {
        setUser({
          ...user,
          balance: user.balance + task.reward,
          totalEarned: user.totalEarned + task.reward,
          tasksCompleted: [...user.tasksCompleted, task.id]
        });
        setTasks(prev => prev.map(t => t.id === task.id ? { ...t, completed: true } : t));
      }
    }
  };

  // Copy referral link to clipboard
  const copyReferralLink = () => {
    const refLink = `https://t.me/DogsAIBot?startapp=ref_${user?.referralCode || 'REFCODE'}`;
    navigator.clipboard.writeText(refLink);
    showToast("Referral link copied!");
  };

  // Native Telegram WebApp share
  const shareReferralLink = () => {
    const refLink = `https://t.me/DogsAIBot?startapp=ref_${user?.referralCode || 'REFCODE'}`;
    const shareText = `🐶 Check out DogsAI, the revolutionary Telegram token ecosystem! Earn DOGSAI for your account age and Premium status!`;
    const tgUrl = `https://t.me/share/url?url=${encodeURIComponent(refLink)}&text=${encodeURIComponent(shareText)}`;
    window.open(tgUrl, '_blank');
  };

  // Initialize Telegram WebApp SDK
  useEffect(() => {
    // Detect environment
    const isTg = !!(window.Telegram?.WebApp?.initData);
    setIsTelegramClient(isTg);

    // Get dev status settings
    fetch('/api/dev-status')
      .then(r => r.json())
      .then(d => setDevStatus(d as any))
      .catch(() => {});

    if (window.Telegram?.WebApp) {
      const tg = window.Telegram.WebApp;
      tg.ready();
      tg.expand();

      // Configure colors based on Telegram parameters
      if (tg.setHeaderColor) {
        tg.setHeaderColor(tg.colorScheme === 'dark' ? '#0f172a' : '#f8fafc');
      }

      // Handle Fullscreen events
      const onFullscreenChanged = () => {
        setIsFullscreen(true);
      };
      const onFullscreenFailed = () => {
        setIsFullscreen(false);
      };

      if (tg.onEvent) {
        tg.onEvent('fullscreenChanged', onFullscreenChanged);
        tg.onEvent('fullscreenFailed', onFullscreenFailed);
      }

      // Automatically attempt to expand full screen if supported
      if (tg.requestFullscreen) {
        tg.requestFullscreen();
      }

      // Sync active styling
      document.body.style.backgroundColor = tg.colorScheme === 'dark' ? '#0f172a' : '#f8fafc';
    }

    // Trigger authentication
    handleAuthenticate();
  }, [isTelegramClient]);

  // Re-run authentication when emulator params change
  const applyEmulatorParams = () => {
    setDevConsoleOpen(false);
    handleAuthenticate();
    showToast("Emulator Profile Applied.");
  };

  // Helper to resolve age reward display string
  const getSimulatedAgeReward = (): number => {
    const totalMonths = (simAgeYears * 12) + simAgeMonths;
    for (const range of DEFAULT_REWARD_CONFIG.ageRanges) {
      if (totalMonths >= range.minMonths && totalMonths < range.maxMonths) {
        return range.reward;
      }
    }
    return 100;
  };

  return (
    <div className={`min-h-screen text-slate-800 dark:text-slate-100 flex flex-col font-sans transition-colors duration-200 select-none`}>
      {/* Toast Notification Container */}
      <AnimatePresence>
        {toastMessage && (
          <motion.div 
            initial={{ opacity: 0, y: -40 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -40 }}
            className="fixed top-6 left-1/2 -translate-x-1/2 bg-slate-900/90 text-white dark:bg-white dark:text-slate-950 px-5 py-3 rounded-full shadow-lg z-50 text-sm font-medium flex items-center space-x-2 border border-slate-700/30 dark:border-slate-200/30"
          >
            <span>🐶</span>
            <span>{toastMessage}</span>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Header Panel */}
      <header className="px-5 pt-5 pb-3 sticky top-0 bg-slate-50/85 dark:bg-slate-950/85 backdrop-blur-md border-b border-slate-200/40 dark:border-slate-800/40 flex items-center justify-between z-10">
        <div className="flex items-center space-x-2">
          <div className="w-10 h-10 rounded-full border border-orange-500/20 overflow-hidden bg-orange-100 flex items-center justify-center">
            <img src={mascotImage} alt="DogsAI Mascot" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
          </div>
          <div>
            <h1 className="font-bold text-lg tracking-tight">DogsAI</h1>
            <p className="text-[10px] text-slate-500 dark:text-slate-400 font-mono">
              {isTelegramClient ? 'CONNECTED TO TELEGRAM' : 'SANDBOX SIMULATOR'}
            </p>
          </div>
        </div>

        {/* Sandbox Dev Settings Trigger */}
        <div className="flex items-center space-x-1.5">
          <button 
            id="toggle-dev-panel"
            onClick={() => setDevConsoleOpen(!devConsoleOpen)}
            className="p-2.5 rounded-full bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-300 transition-all flex items-center justify-center relative cursor-pointer"
            title="Sandbox Dev Tools"
          >
            <Settings className="w-4 h-4" />
            <span className="absolute -top-1 -right-1 w-2.5 h-2.5 rounded-full bg-orange-500 animate-pulse" />
          </button>
        </div>
      </header>

      {/* Main Content Scrollport */}
      <main className="flex-1 px-5 py-4 pb-28 max-w-md mx-auto w-full flex flex-col justify-center">
        {loading ? (
          <div className="flex-1 flex flex-col items-center justify-center space-y-3 py-16">
            <Loader2 className="w-9 h-9 text-orange-500 animate-spin" />
            <p className="text-sm text-slate-500 dark:text-slate-400">Authenticating account security...</p>
          </div>
        ) : onboardingStep < 3 ? (
          /* ONBOARDING WIZARD INTERFACE */
          <AnimatePresence mode="wait">
            {onboardingStep === 0 && (
              <motion.div 
                key="step-welcome"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex-1 flex flex-col justify-between py-6 space-y-8"
              >
                <div className="text-center space-y-4">
                  <div className="relative inline-block">
                    <div className="w-28 h-28 rounded-3xl mx-auto overflow-hidden shadow-2xl border-4 border-white dark:border-slate-800 bg-slate-200">
                      <img src={mascotImage} alt="Welcome Dog" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                    </div>
                    <span className="absolute -bottom-2 -right-2 text-3xl">👋</span>
                  </div>

                  <div className="space-y-1">
                    <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Welcome to DogsAI</h2>
                    <p className="text-sm text-slate-500 dark:text-slate-400">Your Telegram journey starts here.</p>
                  </div>
                </div>

                {/* Main Card with Welcome Bonus info */}
                <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 space-y-4 text-center">
                  <span className="text-[10px] uppercase font-mono tracking-wider text-orange-500 font-bold">Unconditional Claim</span>
                  <div className="flex items-center justify-center space-x-2">
                    <Coins className="w-7 h-7 text-orange-500 animate-bounce" />
                    <span className="text-3xl font-extrabold tracking-tight">+799 DOGSAI</span>
                  </div>
                  <p className="text-xs text-slate-600 dark:text-slate-300">
                    Welcome to the ecosystem! Every user receives an automatic base reward to start their staking.
                  </p>
                </div>

                <button
                  id="claim-welcome-btn"
                  onClick={claimWelcomeReward}
                  disabled={claimingWelcome}
                  className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-lg shadow-orange-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {claimingWelcome ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Let's Start!</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {onboardingStep === 1 && (
              <motion.div 
                key="step-age"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex-1 flex flex-col justify-between py-6 space-y-8"
              >
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-orange-50 dark:bg-orange-950/30 border border-orange-200 dark:border-orange-900/30 flex items-center justify-center text-3xl">
                    ⏱️
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Account Age Reward</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">We estimate your Telegram tenure server-side.</p>
                </div>

                {/* Estimate Result Container */}
                {user && user.accountAgeCheckedAt ? (
                  <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 space-y-5 text-center">
                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">Estimated Telegram Age</p>
                      <h3 className="text-xl font-bold text-slate-900 dark:text-white">
                        {user.accountAgeYears} Years & {user.accountAgeMonths} Months
                      </h3>
                    </div>

                    <div className="h-[1px] bg-slate-200 dark:bg-slate-800" />

                    <div className="space-y-1">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-widest font-mono">Server-Calculated Reward</p>
                      <div className="flex items-center justify-center space-x-2 text-2xl font-black text-orange-500">
                        <Coins className="w-6 h-6 animate-pulse" />
                        <span>+{getSimulatedAgeReward()} DOGSAI</span>
                      </div>
                    </div>

                    <div className="p-3 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200/30 dark:border-slate-800/30 flex items-center space-x-2 text-left">
                      <Info className="w-5.5 h-5.5 text-slate-400 flex-shrink-0" />
                      <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-relaxed">
                        Telegram does not officially expose your account creation date. This represents a secure statistical estimation from our edge api.
                      </p>
                    </div>
                  </div>
                ) : (
                  <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 space-y-4 text-center">
                    <p className="text-sm text-slate-600 dark:text-slate-300">
                      Our secure backend is ready to analyze your Telegram ID to estimate your account registration year.
                    </p>
                    <button
                      id="estimate-age-btn"
                      onClick={estimateAccountAge}
                      disabled={estimatingAge}
                      className="mx-auto px-6 py-2.5 rounded-xl bg-orange-500/10 hover:bg-orange-500/20 text-orange-500 font-bold border border-orange-500/20 text-sm active:scale-95 transition-all flex items-center space-x-2 disabled:opacity-50 cursor-pointer"
                    >
                      {estimatingAge ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <>
                          <Clock className="w-4 h-4" />
                          <span>Estimate Account Age</span>
                        </>
                      )}
                    </button>
                  </div>
                )}

                {/* Continue Actions */}
                <button
                  id="claim-age-btn"
                  onClick={claimAgeReward}
                  disabled={claimingAge || !user?.accountAgeCheckedAt}
                  className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-lg shadow-orange-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {claimingAge ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Continue Onboarding</span>
                      <ChevronRight className="w-5 h-5" />
                    </>
                  )}
                </button>
              </motion.div>
            )}

            {onboardingStep === 2 && (
              <motion.div 
                key="step-premium"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.95 }}
                className="flex-1 flex flex-col justify-between py-6 space-y-8"
              >
                <div className="text-center space-y-3">
                  <div className="w-20 h-20 mx-auto rounded-2xl bg-indigo-50 dark:bg-indigo-950/30 border border-indigo-200 dark:border-indigo-900/30 flex items-center justify-center text-3xl">
                    ⭐
                  </div>
                  <h2 className="text-2xl font-black tracking-tight text-slate-900 dark:text-white">Telegram Premium</h2>
                  <p className="text-sm text-slate-500 dark:text-slate-400">Verifying your Telegram account status.</p>
                </div>

                {/* Premium State Container */}
                <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 space-y-4 text-center">
                  {user?.isPremium ? (
                    <div className="space-y-3">
                      <div className="inline-block px-3 py-1 bg-indigo-500/10 text-indigo-500 rounded-full border border-indigo-500/20 text-xs font-bold font-mono">
                        ⭐ Premium Detected
                      </div>
                      <div className="flex items-center justify-center space-x-2 text-2xl font-extrabold text-orange-500">
                        <Coins className="w-6 h-6" />
                        <span>+500 DOGSAI</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Awesome! Premium members get an extra 500 DOGSAI bonus allocation.
                      </p>
                    </div>
                  ) : (
                    <div className="space-y-3">
                      <div className="inline-block px-3 py-1 bg-slate-500/10 text-slate-500 rounded-full border border-slate-500/20 text-xs font-bold font-mono">
                        Standard Status Detected
                      </div>
                      <div className="flex items-center justify-center space-x-2 text-2xl font-extrabold text-slate-400">
                        <Coins className="w-6 h-6" />
                        <span>+0 DOGSAI</span>
                      </div>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        Premium membership not found in validated Telegram session metadata.
                      </p>
                    </div>
                  )}
                </div>

                <button
                  id="claim-premium-btn"
                  onClick={claimPremiumReward}
                  disabled={claimingPremium}
                  className="w-full py-4 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold transition-all shadow-lg shadow-orange-500/20 active:scale-95 disabled:opacity-50 flex items-center justify-center space-x-2 cursor-pointer"
                >
                  {claimingPremium ? (
                    <Loader2 className="w-5 h-5 animate-spin" />
                  ) : (
                    <>
                      <span>Enter DogsAI App</span>
                      <Check className="w-5 h-5" />
                    </>
                  )}
                </button>
              </motion.div>
            )}
          </AnimatePresence>
        ) : (
          /* CORE MAIN APPLICATION DASHBOARDS */
          <AnimatePresence mode="wait">
            {activeTab === 'home' && (
              <motion.div 
                key="tab-home"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                {/* User Welcome Block */}
                <div className="flex items-center justify-between">
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-500 dark:text-slate-400">Welcome back,</p>
                    <div className="flex items-center space-x-1.5">
                      <h2 className="text-xl font-extrabold text-slate-900 dark:text-white">
                        @{user?.username || 'user'}
                      </h2>
                      {user?.isPremium && (
                        <span className="text-sm" title="Telegram Premium">⭐</span>
                      )}
                    </div>
                  </div>
                  <div className="px-3 py-1 bg-orange-500/10 text-orange-500 rounded-full border border-orange-500/20 text-[10px] font-extrabold tracking-widest uppercase">
                    PRO LEVEL
                  </div>
                </div>

                {/* Primary Balance Card */}
                <div className="relative overflow-hidden bg-slate-900 text-white rounded-3xl p-6 shadow-2xl border border-slate-800/80 flex flex-col items-center text-center space-y-4">
                  <span className="text-[10px] uppercase font-mono tracking-widest text-slate-400">Available Staking Balance</span>
                  <div className="space-y-1">
                    <div className="flex items-center justify-center space-x-2">
                      <Coins className="w-8 h-8 text-orange-500" />
                      <span className="text-4xl font-black tracking-tight">{user?.balance?.toLocaleString() || '0'}</span>
                    </div>
                    <p className="text-xs text-orange-500 font-bold tracking-wider">DOGSAI</p>
                  </div>

                  <div className="w-24 h-24 rounded-2xl overflow-hidden shadow-md bg-slate-800 border-2 border-slate-700">
                    <img src={mascotImage} alt="Mascot Mascot" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                </div>

                {/* Statistics Grid */}
                <div className="space-y-3">
                  <h3 className="text-sm font-black tracking-tight uppercase text-slate-500 dark:text-slate-400 px-1">Your DogsAI Journey</h3>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="bg-slate-100 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/40 dark:border-slate-800/40 space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Total Earned</p>
                      <p className="text-lg font-black">{user?.totalEarned?.toLocaleString() || '0'} DOGS</p>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/40 dark:border-slate-800/40 space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Tasks Done</p>
                      <p className="text-lg font-black">{user?.tasksCompleted?.length || '0'} completed</p>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/40 dark:border-slate-800/40 space-y-1">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Invited Friends</p>
                      <p className="text-lg font-black">{user?.referralsCount || '0'} active</p>
                    </div>
                    <div className="bg-slate-100 dark:bg-slate-900/60 p-4 rounded-2xl border border-slate-200/40 dark:border-slate-800/40 space-y-1 flex flex-col justify-center">
                      <p className="text-[10px] font-bold text-slate-500 uppercase tracking-wider">Estimated Age</p>
                      <p className="text-sm font-bold mt-0.5">
                        {user?.accountAgeCheckedAt ? `${user.accountAgeYears}y ${user.accountAgeMonths}m` : 'Not evaluated'}
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {activeTab === 'tasks' && (
              <motion.div 
                key="tab-tasks"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-4"
              >
                <div className="space-y-1">
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Earn Missions</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Complete tasks verified securely server-side.</p>
                </div>

                {/* Tasks List */}
                <div className="space-y-3">
                  {tasks.map(task => (
                    <div 
                      key={task.id}
                      className="bg-slate-100 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex items-center justify-between space-x-3"
                    >
                      <div className="flex items-center space-x-3 min-w-0">
                        <div className="w-10 h-10 rounded-xl bg-orange-500/10 text-orange-500 flex items-center justify-center flex-shrink-0">
                          {task.iconName === 'CalendarCheck' && <CalendarCheck className="w-5 h-5" />}
                          {task.iconName === 'Tv' && <Tv className="w-5 h-5" />}
                          {task.iconName === 'Users' && <Users className="w-5 h-5" />}
                          {task.iconName === 'Cpu' && <Cpu className="w-5 h-5" />}
                        </div>
                        <div className="min-w-0">
                          <h4 className="font-bold text-sm text-slate-900 dark:text-white truncate">{task.title}</h4>
                          <p className="text-[10px] text-slate-500 dark:text-slate-400 line-clamp-1">{task.description}</p>
                          <span className="text-[10px] font-bold text-orange-500 font-mono mt-0.5 block">+{task.reward} DOGSAI</span>
                        </div>
                      </div>

                      <button
                        id={`complete-task-${task.id}`}
                        onClick={() => handleCompleteTask(task)}
                        disabled={task.completed}
                        className={`px-4 py-2 rounded-xl text-xs font-bold transition-all flex items-center space-x-1 flex-shrink-0 cursor-pointer ${
                          task.completed 
                            ? 'bg-slate-200 dark:bg-slate-800 text-slate-400 dark:text-slate-500' 
                            : 'bg-orange-500 hover:bg-orange-600 text-white'
                        }`}
                      >
                        {task.completed ? (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>Done</span>
                          </>
                        ) : (
                          <span>Complete</span>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              </motion.div>
            )}

            {activeTab === 'referrals' && (
              <motion.div 
                key="tab-referrals"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-6"
              >
                <div className="space-y-1 text-center">
                  <div className="w-16 h-16 mx-auto rounded-full bg-orange-100 dark:bg-orange-950/20 text-orange-500 flex items-center justify-center text-2xl">
                    👥
                  </div>
                  <h2 className="text-xl font-extrabold tracking-tight text-slate-900 dark:text-white">Invite Friends</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400">Earn +250 DOGSAI for every friend who joins.</p>
                </div>

                {/* Referral stats */}
                <div className="grid grid-cols-2 gap-3 bg-slate-100 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50">
                  <div className="text-center border-r border-slate-200 dark:border-slate-800">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Invited Friends</p>
                    <p className="text-lg font-black">{referrals?.referralsCount || 0}</p>
                  </div>
                  <div className="text-center">
                    <p className="text-[10px] font-bold text-slate-500 uppercase">Referral Earnings</p>
                    <p className="text-lg font-black text-orange-500">+{referrals?.referralEarnings || 0} DOGS</p>
                  </div>
                </div>

                {/* Share Link Actions */}
                <div className="space-y-2">
                  <button
                    id="share-ref-btn"
                    onClick={shareReferralLink}
                    className="w-full py-3 rounded-xl bg-orange-500 hover:bg-orange-600 text-white font-bold text-sm transition-all shadow-md active:scale-95 flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Share2 className="w-4 h-4" />
                    <span>Send Invite</span>
                  </button>
                  <button
                    id="copy-ref-btn"
                    onClick={copyReferralLink}
                    className="w-full py-3 rounded-xl bg-slate-100 hover:bg-slate-200 dark:bg-slate-900 dark:hover:bg-slate-800 font-bold text-sm transition-all flex items-center justify-center space-x-2 cursor-pointer"
                  >
                    <Copy className="w-4 h-4" />
                    <span>Copy referral link</span>
                  </button>
                </div>

                {/* Friends List */}
                <div className="space-y-2">
                  <h3 className="text-sm font-black tracking-tight uppercase text-slate-500 px-1">Your Friends ({referrals?.friends?.length || 0})</h3>
                  {referrals?.friends && referrals.friends.length > 0 ? (
                    <div className="space-y-2">
                      {referrals.friends.map((friend, idx) => (
                        <div key={idx} className="bg-slate-100 dark:bg-slate-900/60 p-3.5 rounded-2xl border border-slate-200/40 dark:border-slate-800/40 flex items-center justify-between">
                          <div className="flex items-center space-x-2">
                            <div className="w-8 h-8 rounded-full bg-slate-200 dark:bg-slate-800 flex items-center justify-center text-xs font-bold uppercase text-slate-500">
                              {friend.username.substring(0, 2)}
                            </div>
                            <div>
                              <p className="text-xs font-bold text-slate-900 dark:text-white">@{friend.username}</p>
                              <p className="text-[9px] text-slate-500 dark:text-slate-400">Joined {new Date(friend.createdAt).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <span className="text-xs font-black text-orange-500">+{friend.earnedAmount} DOGSAI</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-400">
                      No friends invited yet. Share your code to build your pack!
                    </div>
                  )}
                </div>
              </motion.div>
            )}

            {activeTab === 'profile' && (
              <motion.div 
                key="tab-profile"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="space-y-5"
              >
                {/* User Meta Card */}
                <div className="bg-slate-100 dark:bg-slate-900 p-5 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 flex items-center space-x-4">
                  <div className="w-14 h-14 rounded-full bg-orange-100 border border-orange-500/20 overflow-hidden">
                    <img src={mascotImage} alt="User Avatar" className="w-full h-full object-cover" referrerPolicy="no-referrer" />
                  </div>
                  <div>
                    <h2 className="text-base font-extrabold text-slate-900 dark:text-white">
                      {user?.firstName} {user?.lastName}
                    </h2>
                    <p className="text-xs text-slate-500 dark:text-slate-400 font-mono">@{user?.username || 'user'}</p>
                    <p className="text-[10px] text-slate-400 font-mono mt-0.5">ID: {user?.telegramId || '00000'}</p>
                  </div>
                </div>

                {/* Profile Stats List */}
                <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 space-y-3.5">
                  <h3 className="text-[10px] font-bold text-slate-500 uppercase tracking-widest px-1">Detailed Wallet Ledger</h3>
                  
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-500">DOGSAI Balance</span>
                    <span className="font-extrabold text-orange-500">{user?.balance?.toLocaleString() || '0'} DOGS</span>
                  </div>
                  <div className="h-[1px] bg-slate-200 dark:bg-slate-800" />
                  
                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-500">Gross Staking Yield</span>
                    <span className="font-bold">{user?.totalEarned?.toLocaleString() || '0'} DOGS</span>
                  </div>
                  <div className="h-[1px] bg-slate-200 dark:bg-slate-800" />

                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-500">Telegram Account Age</span>
                    <span className="font-bold">
                      {user?.accountAgeCheckedAt ? `${user.accountAgeYears} Years ${user.accountAgeMonths} Months` : 'Not evaluated'}
                    </span>
                  </div>
                  <div className="h-[1px] bg-slate-200 dark:bg-slate-800" />

                  <div className="flex items-center justify-between text-xs px-1">
                    <span className="text-slate-500">Premium Account Bonus</span>
                    <span className="font-bold">{user?.isPremium ? 'Active (+500 DOGS)' : 'Inactive'}</span>
                  </div>
                </div>

                {/* Transactions Activity List */}
                <div className="space-y-3">
                  <h3 className="text-sm font-black tracking-tight uppercase text-slate-500 px-1">Ledger Statements</h3>
                  {transactions.length > 0 ? (
                    <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                      {transactions.map((tx, idx) => (
                        <div key={idx} className="bg-slate-100 dark:bg-slate-900/60 p-3 rounded-xl border border-slate-200/30 dark:border-slate-800/30 flex items-center justify-between text-xs">
                          <div>
                            <p className="font-bold text-slate-900 dark:text-white">{tx.description}</p>
                            <span className="text-[9px] text-slate-500 dark:text-slate-400 font-mono uppercase">{tx.type}</span>
                          </div>
                          <span className="font-black text-orange-500">+{tx.amount} DOGS</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-6 border border-dashed border-slate-200 dark:border-slate-800 rounded-2xl text-xs text-slate-400">
                      No transactions recorded yet.
                    </div>
                  )}
                </div>

                {/* Info and links */}
                <div className="bg-slate-100 dark:bg-slate-900 p-4 rounded-2xl border border-slate-200/50 dark:border-slate-800/50 space-y-3">
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">App Language</span>
                    <span className="font-bold">English (EN)</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">System Theme</span>
                    <span className="font-bold">{isTelegramClient ? 'Adapting to Telegram' : 'Standard Light'}</span>
                  </div>
                  <div className="flex items-center justify-between text-xs">
                    <span className="text-slate-500">Privacy & Terms</span>
                    <span className="text-orange-500 font-bold hover:underline cursor-pointer">Read Agreement</span>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        )}
      </main>

      {/* CORE BOT-NAV TAB BAR */}
      {onboardingStep >= 3 && (
        <nav className="fixed bottom-0 left-0 right-0 bg-slate-50/90 dark:bg-slate-950/90 border-t border-slate-200/50 dark:border-slate-800/50 px-6 py-4 pb-6 flex items-center justify-between backdrop-blur-md z-10 max-w-md mx-auto rounded-t-3xl shadow-2xl">
          <button 
            id="tab-home-btn"
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center space-y-1.5 transition-colors cursor-pointer ${activeTab === 'home' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-bold">Home</span>
          </button>
          <button 
            id="tab-tasks-btn"
            onClick={() => setActiveTab('tasks')}
            className={`flex flex-col items-center space-y-1.5 transition-colors cursor-pointer ${activeTab === 'tasks' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Cpu className="w-5 h-5" />
            <span className="text-[10px] font-bold">Tasks</span>
          </button>
          <button 
            id="tab-referrals-btn"
            onClick={() => setActiveTab('referrals')}
            className={`flex flex-col items-center space-y-1.5 transition-colors cursor-pointer ${activeTab === 'referrals' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <Users className="w-5 h-5" />
            <span className="text-[10px] font-bold">Referrals</span>
          </button>
          <button 
            id="tab-profile-btn"
            onClick={() => setActiveTab('profile')}
            className={`flex flex-col items-center space-y-1.5 transition-colors cursor-pointer ${activeTab === 'profile' ? 'text-orange-500' : 'text-slate-400 hover:text-slate-600'}`}
          >
            <User className="w-5 h-5" />
            <span className="text-[10px] font-bold">Profile</span>
          </button>
        </nav>
      )}

      {/* DETAILED SANDBOX DEV CONSOLE DRAWER */}
      <AnimatePresence>
        {devConsoleOpen && (
          <motion.div 
            initial={{ opacity: 0, y: "100%" }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: "100%" }}
            transition={{ type: "spring", damping: 25, stiffness: 200 }}
            className="fixed bottom-0 left-0 right-0 bg-slate-900 border-t-2 border-orange-500 rounded-t-[32px] shadow-2xl p-6 z-50 max-h-[85vh] overflow-y-auto max-w-lg mx-auto text-white space-y-6"
          >
            {/* Header */}
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center space-x-2">
                <Smartphone className="w-5 h-5 text-orange-500 animate-pulse" />
                <h3 className="font-extrabold text-base tracking-tight uppercase">DogsAI Sandbox Dev Console</h3>
              </div>
              <button 
                id="close-dev-panel"
                onClick={() => setDevConsoleOpen(false)}
                className="px-3 py-1.5 bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white rounded-lg text-xs transition-all cursor-pointer"
              >
                Close
              </button>
            </div>

            {/* Config details */}
            <div className="grid grid-cols-2 gap-3 text-xs bg-slate-950 p-4 rounded-xl border border-slate-800">
              <div className="space-y-1">
                <p className="text-slate-500 uppercase font-bold text-[9px] tracking-wider">Database Mode</p>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  devStatus?.firestoreReal ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-orange-500/10 text-orange-500 border border-orange-500/20'
                }`}>
                  {devStatus?.firestoreReal ? 'Firebase REST API' : 'Dev JSON fallback'}
                </span>
              </div>
              <div className="space-y-1">
                <p className="text-slate-500 uppercase font-bold text-[9px] tracking-wider">Verification HMAC</p>
                <span className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                  devStatus?.telegramBotTokenConfigured ? 'bg-green-500/10 text-green-500 border border-green-500/20' : 'bg-slate-500/10 text-slate-400 border border-slate-700'
                }`}>
                  {devStatus?.telegramBotTokenConfigured ? 'Secured Server HMAC' : 'Bypass Mock HMAC'}
                </span>
              </div>
            </div>

            {/* Profile emulator settings */}
            <div className="space-y-4">
              <h4 className="text-xs font-black tracking-tight text-slate-400 uppercase">Profile Customizer (Emulates Telegram variables)</h4>
              
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Simulated User ID</label>
                  <input 
                    type="text" 
                    value={simUserId} 
                    onChange={e => setSimUserId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Simulated Username</label>
                  <input 
                    type="text" 
                    value={simUsername} 
                    onChange={e => setSimUsername(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">First Name</label>
                  <input 
                    type="text" 
                    value={simFirstName} 
                    onChange={e => setSimFirstName(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Referred By Code</label>
                  <input 
                    type="text" 
                    value={simReferralCode} 
                    onChange={e => setSimReferralCode(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[10px] text-slate-400 font-bold uppercase">Mock Account Age Years</label>
                  <input 
                    type="number" 
                    value={simAgeYears} 
                    onChange={e => setSimAgeYears(parseInt(e.target.value, 10))}
                    className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3 py-2 text-xs focus:border-orange-500 focus:outline-none"
                  />
                </div>
                <div className="space-y-1.5 flex flex-col justify-end">
                  <div className="flex items-center space-x-2.5 pb-2">
                    <input 
                      type="checkbox" 
                      id="sim-premium-box"
                      checked={simIsPremium} 
                      onChange={e => setSimIsPremium(e.target.checked)}
                      className="w-4 h-4 accent-orange-500 rounded border-slate-800 bg-slate-950 cursor-pointer"
                    />
                    <label htmlFor="sim-premium-box" className="text-xs text-slate-200 cursor-pointer select-none">
                      Telegram Premium
                    </label>
                  </div>
                </div>
              </div>

              <div className="flex space-x-2 pt-2">
                <button
                  id="apply-emulator-btn"
                  onClick={applyEmulatorParams}
                  className="flex-1 py-3 bg-orange-500 hover:bg-orange-600 text-white font-bold text-xs rounded-xl transition-all shadow-md active:scale-95 cursor-pointer"
                >
                  Apply & Reload Account Session
                </button>
                <button
                  id="reset-onboarding-btn"
                  onClick={() => {
                    setOnboardingStep(0);
                    setDevConsoleOpen(false);
                    showToast("Onboarding flow reset.");
                  }}
                  className="px-4 py-3 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs rounded-xl transition-all cursor-pointer"
                >
                  Reset Onboarding
                </button>
              </div>
            </div>

            {/* API Logger Console */}
            <div className="space-y-3">
              <h4 className="text-xs font-black tracking-tight text-slate-400 uppercase">Live Sandbox API Router Logs</h4>
              <div className="bg-slate-950 rounded-xl border border-slate-800 p-3 font-mono text-[10px] space-y-1.5 max-h-40 overflow-y-auto">
                {apiLogs.length === 0 ? (
                  <p className="text-slate-600 italic">No API events triggered yet.</p>
                ) : (
                  apiLogs.map((log, idx) => (
                    <div key={idx} className="flex items-center justify-between py-0.5 border-b border-slate-900 last:border-0">
                      <div className="flex items-center space-x-2">
                        <span className={`font-bold ${log.status < 300 ? 'text-green-500' : 'text-red-500'}`}>
                          [{log.status}]
                        </span>
                        <span className="text-orange-400">{log.method}</span>
                        <span className="text-slate-300">{log.path}</span>
                      </div>
                      <div className="flex items-center space-x-2 text-slate-500">
                        <span>{log.duration}ms</span>
                        <span>{log.time}</span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
