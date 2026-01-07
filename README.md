# 🤖 Pinkscout - FRC Scouting App

A web-based scouting application for FIRST Robotics Competition (FRC) teams. Built with vanilla HTML, CSS, and JavaScript, hosted on Firebase.

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
    │   ├── firebase.js    # Firebase initialization
    │   ├── app.js         # Shared CRUD functions & diagnostics
    │   ├── dashboard.js   # Dashboard-specific logic
    │   └── scouting.js    # Scouting form handling
    ├── index.html         # Home page
    ├── login.html         # Sign in / Sign up page
    ├── dashboard.html     # Data visualization & charts
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

## 📚 Learn More

- [Firebase Documentation](https://firebase.google.com/docs)
- [Firestore Guide](https://firebase.google.com/docs/firestore)
- [Firebase Auth Guide](https://firebase.google.com/docs/auth)

---

## 👥 For FRC Teams

This app is designed for scouting at FRC competitions. Customize the form in `newscounting.html` to match your scouting needs for the current game.

**Happy Scouting! 🎯**

