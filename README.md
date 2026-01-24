# 🩷 PinkScout - FRC Scouting Application

A web-based scouting application for FIRST Robotics Competition (FRC) teams. Built with React 18 + Vite, powered by Supabase, and deployed on Vercel.

## Features

- **Match Scouting**: Record detailed match data with counter buttons
- **Team Search**: Search teams with combined Statbotics + local data
- **Events**: Browse TBA events, view teams, and match predictions
- **Analytics**: Compare teams and view performance charts
- **User Profiles**: Track your scouting contributions
- **Team Lead/Member System**: Invite codes for team organization
- **Role-Based Access Control**: Scout, Scout Lead, and Master Admin tiers

---

## 📁 Project Structure

```
Pinkscout/
├── README.md                    # This file
│
└── pinkscout-react/             # React application
    ├── src/
    │   ├── components/          # Reusable UI components
    │   ├── contexts/            # React contexts (Auth, etc.)
    │   ├── pages/               # Page components
    │   ├── services/            # API and backend services
    │   │   ├── supabase.js      # Supabase client configuration
    │   │   ├── scoutingService.js
    │   │   ├── roleService.js
    │   │   └── ...
    │   ├── utils/               # Utility functions
    │   ├── App.jsx              # Main app component
    │   └── main.jsx             # Entry point
    ├── .env.local               # Environment variables (not committed)
    ├── vercel.json              # Vercel deployment configuration
    ├── supabase-schema.sql      # Database schema for Supabase
    ├── package.json             # Dependencies
    └── vite.config.js           # Vite configuration
```

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js 18+** - Download from [nodejs.org](https://nodejs.org/)
2. **Supabase Account** - Create at [supabase.com](https://supabase.com/)
3. **Vercel Account** (optional) - For deployment at [vercel.com](https://vercel.com/)

### Step 1: Clone and Install

```bash
cd pinkscout-react
npm install
```

### Step 2: Create Supabase Project

1. Go to [Supabase Dashboard](https://supabase.com/dashboard)
2. Click **"New Project"**
3. Name it (e.g., `pinkscout`)
4. Set a secure database password
5. Select a region close to your users
6. Wait for project creation

### Step 3: Setup Database Schema

1. In Supabase Dashboard, go to **SQL Editor**
2. Copy the contents of `supabase-schema.sql`
3. Paste and run to create all tables and RLS policies

### Step 4: Get Supabase Credentials

1. Go to **Settings** → **API**
2. Copy the **Project URL** and **anon public key**

### Step 5: Configure Environment

Create `.env.local` in the `pinkscout-react` folder:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_ANON_KEY=your-anon-key

VITE_TBA_API_KEY=your-tba-api-key
VITE_NEXUS_API_KEY=your-nexus-api-key
VITE_PRIMARY_ADMIN_EMAIL=your-admin@email.com
```

### Step 6: Run Locally

```bash
npm run dev
```

Open [http://localhost:5173](http://localhost:5173) in your browser.

### Step 7: Deploy to Vercel

Option A - Via Vercel CLI:
```bash
npx vercel --prod
```

Option B - Via GitHub:
1. Push your code to GitHub
2. Import the repository in [Vercel Dashboard](https://vercel.com/dashboard)
3. Set environment variables in Vercel project settings
4. Deploy automatically on push

---

## 📄 Page Descriptions

| Page | Route | Description |
|------|-------|-------------|
| Home | `/` | Welcome page with navigation |
| Login | `/login` | Sign in or create an account |
| Dashboard | `/dashboard` | View scouting data overview |
| Scouting | `/scouting` | Enter match scouting data |
| Events | `/events` | Browse TBA events and matches |
| Teams | `/teams` | Team search and leaderboard |
| Analytics | `/analytics` | Charts and team comparison |
| Profile | `/profile` | User profile and settings |
| Admin | `/admin` | Admin controls (admin only) |

---

## 🔒 Security (Row Level Security)

Supabase RLS policies control data access:

- **Authenticated users**: Can read/write their own scouting data
- **Team members**: Can view team data based on team codes
- **Admins**: Full access to all data
- **Unauthenticated users**: No access

RLS policies are defined in `supabase-schema.sql`.

---

## 🔑 API Keys

Configure in `.env.local`:

- **Blue Alliance API**: Get from [thebluealliance.com/account](https://www.thebluealliance.com/account)
- **Statbotics API**: No key required (public API)
- **FRC Nexus API**: Get from [frc.nexus](https://frc.nexus)

---

## 📊 EPA Scaling

The app uses Statbotics EPA (Expected Points Added) data with weighted adjustments:

| Percentile | Classification | Display |
|------------|----------------|---------|
| 90%+ | 🌟 Elite | Gold badge |
| 70-89% | 🔥 Top | Orange badge |
| 30-69% | ✅ Normal | Green badge |
| <30% | 📈 Below Avg | Gray badge |

---

## 🔐 Access Control

- **Signup Code**: New users need team code `1551` to create an account
- **Master Admin**: Email configured in `VITE_PRIMARY_ADMIN_EMAIL`
- **Team Leads**: Can generate invite codes for their team
- **Team Members**: Join via invite codes from Team Leads

---

## 📚 Learn More

- [Supabase Documentation](https://supabase.com/docs)
- [React Documentation](https://react.dev/)
- [Vite Documentation](https://vitejs.dev/)
- [Vercel Documentation](https://vercel.com/docs)
- [The Blue Alliance API](https://www.thebluealliance.com/apidocs)
- [Statbotics API](https://www.statbotics.io/api)

---

## 👥 For FRC Teams

This app is designed for scouting at FRC competitions. Customize the scouting form questions in the Admin panel to match your needs for the current game.

**Happy Scouting! 🎯 - Built for FRC Team 1551**
