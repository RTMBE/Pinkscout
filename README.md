# 🩷 PinkScout - FRC Scouting Application

A web-based scouting application for FIRST Robotics Competition (FRC) teams. Built with vanilla HTML, CSS, and JavaScript, hosted on Firebase.

## Features

- **Match Scouting**: Record detailed match data with counter buttons
- **Team Search**: Search teams with combined Statbotics + local data
- **Events**: Browse TBA events, view teams, and match predictions
- **Analytics**: Compare teams and view performance charts
- **User Profiles**: Track your scouting contributions

---

## 📁 Project Structure

```
Pinkscout/
├── firebase.json          # Firebase Hosting configuration
├── .firebaserc            # Firebase project alias
├── firestore.rules        # Firestore security rules
├── README.md              # This file
│
└── public/                # All website files (served by Firebase)
    ├── css/
    │   └── style.css      # Main stylesheet
    ├── js/
    │   ├── firebase.js    # Firebase initialization & API keys
    │   ├── app.js         # Shared utilities & API functions
    │   ├── scouting.js    # Scouting form handling
    │   ├── teams.js       # Team search & stats
    │   ├── events.js      # Event browser
    │   ├── analytics.js   # Charts & comparison
    │   ├── scouterProfile.js # User profile
    │   ├── admin.js       # Admin functions
    │   └── user.js        # User profile helpers
    ├── index.html         # Home page
    ├── login.html         # Sign in / Sign up page
    ├── teams.html         # Team search & leaderboard
    ├── events.html        # Event browser
    ├── analytics.html     # Analytics & charts
    ├── scouterProfile.html # User profile
    ├── admin.html         # Admin controls & diagnostics
    └── newscounting.html  # Match scouting form
```

---

## 🚀 Getting Started

### Prerequisites

1. **Node.js** - Download from [nodejs.org](https://nodejs.org/)
2. **Firebase CLI** - Install globally:
   ```bash
   npm install -g firebase-tools
   ```

### Step 1: Firebase Login

Authenticate with your Firebase account:

```bash
firebase login
```

This opens a browser window for Google sign-in.

### Step 2: Create Firebase Project

1. Go to [Firebase Console](https://console.firebase.google.com/)
2. Click **"Create a project"**
3. Name it (e.g., `team254-scouting-2024`)
4. Enable Google Analytics (optional)
5. Wait for project creation

### Step 3: Enable Services

In Firebase Console, enable these services:

#### Authentication:
1. Go to **Authentication** > **Sign-in method**
2. Enable **Email/Password**
3. Click **Save**

#### Firestore Database:
1. Go to **Firestore Database**
2. Click **Create database**
3. Choose **Start in test mode** (for development)
4. Select a location close to you
5. Click **Enable**

### Step 4: Get Firebase Config

1. Go to **Project Settings** (gear icon)
2. Scroll to **"Your apps"**
3. Click **Web** icon (`</>`)
4. Register app (name it anything)
5. Copy the `firebaseConfig` object
6. Paste it in `public/js/firebase.js`

### Step 5: Update Project ID

Edit `.firebaserc` and replace `my-frc-scouting-app` with your project ID:

```json
{
  "projects": {
    "default": "your-actual-project-id"
  }
}
```

### Step 6: Run Locally

Start the local development server:

```bash
firebase serve
```

Open [http://localhost:5000](http://localhost:5000) in your browser.

### Step 7: Deploy to Web

When ready to publish:

```bash
firebase deploy --only hosting
```

Your app will be live at: `https://your-project-id.web.app`

---

## 📄 Page Descriptions

| Page | URL | Description |
|------|-----|-------------|
| Home | `index.html` | Welcome page with links to all sections |
| Login | `login.html` | Sign in or create an account |
| Dashboard | `dashboard.html` | View scouting data and charts |
| Scouting | `newscounting.html` | Enter match scouting data |
| Admin | `admin.html` | Run diagnostics, manage settings |

---

## 🔧 Diagnostics

The Admin page includes a **Diagnostics** button that checks:

1. ✅ Firebase initialized correctly
2. ✅ Firestore can read data
3. ✅ Firestore can write/delete data
4. ✅ Authentication is available

Results appear in both the UI and browser console (F12 > Console).

---

## 🔒 Security Rules

The `firestore.rules` file controls who can read/write data:

- **Authenticated users**: Can read/write to `scouting` collection
- **Unauthenticated users**: No access

Deploy rules with:
```bash
firebase deploy --only firestore:rules
```

---

## 🛠️ Troubleshooting

### "Firebase not initialized"
- Check that `firebase.js` has your config
- Ensure Firestore is enabled in Firebase Console

### "Permission denied"
- User might not be signed in
- Check `firestore.rules` allows the operation

### "Cannot find module"
- Ensure scripts load in order: `firebase.js` → `app.js` → page script

---

## 🔑 API Keys

Update `public/js/firebase.js` with your API keys:

- **Blue Alliance API**: Get from [thebluealliance.com/account](https://www.thebluealliance.com/account)
- **Statbotics API**: No key required (public API)
- **FRC Nexus API**: Get from [frc.nexus](https://frc.nexus)

---

## 📊 EPA Scaling

The app uses Statbotics EPA (Expected Points Added) data. EPA values are scaled for display:

| Percentile | Classification | Display |
|------------|----------------|---------|
| 90%+ | 🌟 Elite | Gold badge |
| 70-89% | 🔥 Top | Orange badge |
| 30-69% | ✅ Normal | Green badge |
| <30% | 📈 Below Avg | Gray badge |

**Scaling Formula**: `displayEPA = percentile * 50` (0-100 percentile → 0-50 EPA)

---

## 🔐 Access Control

- **Signup Code**: New users need code `1551` to create an account
- **Admin Access**: Requires email ending in `@1551.org` or listed in `ADMIN_EMAILS`

---

## 📚 Learn More

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Guide](https://firebase.google.com/docs/firestore)
- [Firebase Auth Guide](https://firebase.google.com/docs/auth)
- [The Blue Alliance API](https://www.thebluealliance.com/apidocs)
- [Statbotics API](https://www.statbotics.io/api)

---

## 👥 For FRC Teams

This app is designed for scouting at FRC competitions. Customize the form in `newscounting.html` to match your scouting needs for the current game.

**Happy Scouting! 🎯 - Built for FRC Team 1551**
