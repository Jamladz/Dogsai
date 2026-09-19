export interface User {
  telegramId: string;
  username: string;
  firstName: string;
  lastName: string;
  languageCode: string;
  isPremium: boolean;
  balance: number;
  accountAgeYears: number;
  accountAgeMonths: number;
  accountAgeDays: number;
  accountAgeEstimate: boolean;
  accountAgeSource: string;
  accountAgeCheckedAt: string | null;
  welcomeRewardClaimed: boolean;
  ageRewardClaimed: boolean;
  premiumRewardClaimed: boolean;
  onboardingCompleted: boolean;
  referralCode: string;
  referredBy: string | null;
  referralsCount: number;
  referralEarnings: number;
  tasksCompleted: string[];
  totalEarned: number;
  createdAt: string;
  updatedAt: string;
}

export enum TransactionType {
  WELCOME_REWARD = 'WELCOME_REWARD',
  ACCOUNT_AGE_REWARD = 'ACCOUNT_AGE_REWARD',
  PREMIUM_REWARD = 'PREMIUM_REWARD',
  TASK_REWARD = 'TASK_REWARD',
  REFERRAL_REWARD = 'REFERRAL_REWARD'
}

export interface Transaction {
  transactionId: string;
  type: TransactionType;
  amount: number;
  description: string;
  source: string;
  createdAt: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  reward: number;
  actionUrl: string;
  iconName: string;
  type: 'daily' | 'one-time' | 'social';
  completed?: boolean;
}

export interface AuthResponse {
  success: boolean;
  user: User;
  isNew: boolean;
}

export interface RewardConfig {
  welcomeReward: number;
  premiumReward: number;
  ageRanges: {
    minMonths: number;
    maxMonths: number;
    reward: number;
  }[];
}

export const DEFAULT_REWARD_CONFIG: RewardConfig = {
  welcomeReward: 799,
  premiumReward: 500,
  ageRanges: [
    { minMonths: 0, maxMonths: 6, reward: 100 },
    { minMonths: 6, maxMonths: 12, reward: 200 },
    { minMonths: 12, maxMonths: 24, reward: 300 }, // 1-2 years
    { minMonths: 24, maxMonths: 36, reward: 400 }, // 2-3 years
    { minMonths: 36, maxMonths: 48, reward: 500 }, // 3-4 years
    { minMonths: 48, maxMonths: 60, reward: 600 }, // 4-5 years
    { minMonths: 60, maxMonths: 999, reward: 799 } // 5+ years
  ]
};

export const DEFAULT_TASKS: Task[] = [
  {
    id: 'daily_checkin',
    title: 'Daily Check-in',
    description: 'Check in daily to claim your loyal DOGSAI bonus.',
    reward: 50,
    actionUrl: '#daily',
    iconName: 'CalendarCheck',
    type: 'daily'
  },
  {
    id: 'watch_earn',
    title: 'Watch & Earn',
    description: 'Watch the DogsAI announcement video to see what we are cooking.',
    reward: 100,
    actionUrl: 'https://youtube.com',
    iconName: 'Tv',
    type: 'one-time'
  },
  {
    id: 'join_community',
    title: 'Join Community',
    description: 'Join the official Telegram community channel.',
    reward: 100,
    actionUrl: 'https://t.me/telegram',
    iconName: 'Users',
    type: 'social'
  },
  {
    id: 'daily_mission',
    title: 'Daily Mission',
    description: 'Perform an AI analysis on a dog photo to unlock additional rewards.',
    reward: 150,
    actionUrl: '#ai-analyse',
    iconName: 'Cpu',
    type: 'daily'
  }
];
