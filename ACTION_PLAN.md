# Supa AI Vercel Deployment - Action Plan

## Status Summary

Your Next.js application has **1 critical TypeScript error** preventing the build from completing on Vercel:

- **Error Location**: `src/services/ai/providers/openrouter-adapter.ts`
- **Error Type**: TS2769 - Header object contains potentially undefined values
- **Impact**: Build fails → `.next` directory is never created → Vercel deployment fails

---

## 3-Step Fix & Deploy Plan

### Step 1: Fix the TypeScript Error (5 minutes)

**File to edit**: `src/services/ai/providers/openrouter-adapter.ts`

**What to do**: Replace two fetch header blocks that currently look like this:
```typescript
headers: {
  "Content-Type": "application/json",
  Authorization: `Bearer ${apiKey}`,
  "HTTP-Referer": env.NEXT_PUBLIC_APP_URL,
  "X-Title": env.NEXT_PUBLIC_APP_NAME,
}
```

With this pattern:
```typescript
const headers: Record<string, string> = {
  "Content-Type": "application/json",
  "Authorization": `Bearer ${apiKey}`,
};
if (env.NEXT_PUBLIC_APP_URL) {
  headers["HTTP-Referer"] = env.NEXT_PUBLIC_APP_URL;
}
if (env.NEXT_PUBLIC_APP_NAME) {
  headers["X-Title"] = env.NEXT_PUBLIC_APP_NAME;
}
```

**Locations**:
1. Line ~47 in the `chatCompletion()` method
2. Line ~96 in the `streamChatCompletion()` method

**Reference file**: See `EXACT_CHANGES_NEEDED.md` for side-by-side comparison or copy from `openrouter-adapter-FIXED.ts`

### Step 2: Verify Locally (3 minutes)

Run these commands in your project directory:

```bash
# Install dependencies (if not already done)
npm install

# Verify TypeScript compiles without errors
npm run type-check

# Build the project (should create .next directory)
npm run build

# Both commands should complete with no errors
```

If both pass, you're ready for deployment.

### Step 3: Deploy to Vercel (2 minutes)

**Option A: Using Git (Recommended)**
```bash
git add src/services/ai/providers/openrouter-adapter.ts
git commit -m "fix: handle optional environment variables in OpenRouter adapter headers"
git push origin main
# Vercel will automatically detect the push and start building
```

**Option B: Using Vercel Dashboard**
1. Go to https://vercel.com/dashboard
2. Select your Supa AI project
3. Go to Deployments tab
4. Click "Redeploy" on your latest commit
5. Watch the build logs for successful completion

**Option C: Using Vercel CLI**
```bash
npm install -g vercel  # if not already installed
vercel deploy --prod
```

---

## What Gets Fixed

After applying Step 1:
- ✓ TypeScript compilation error disappears
- ✓ Build no longer fails
- ✓ `.next` directory is created successfully
- ✓ Vercel deployment succeeds
- ✓ App is live on your Vercel domain

---

## Environment Variables (Optional but Recommended)

After deployment succeeds, you can optionally configure these in Vercel Dashboard (Settings → Environment Variables):

```env
# Application metadata
NEXT_PUBLIC_APP_URL=https://your-deployed-domain.vercel.app
NEXT_PUBLIC_APP_NAME=Supa AI

# Database connection (required for app to function)
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# AI Provider keys (optional - add only what you use)
OPENROUTER_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
```

**Important**: The build will succeed WITHOUT these variables. Add them later if/when you need them.

---

## Troubleshooting

If something goes wrong:

**Build still fails**
1. Check the Vercel build log for the specific error
2. Run `npm run type-check` locally to reproduce the error
3. Ensure Step 1 changes are complete and correct

**Deployment succeeds but app doesn't work**
1. Open browser console (F12) for client-side errors
2. Check Vercel dashboard → Deployments → Function Logs for server errors
3. Verify environment variables are set (if needed)

**Want to revert**
In Vercel dashboard → Deployments → Click "Promote to Production" on a previous build

---

## Documentation References

I've created these files in your project directory for reference:

1. **VERCEL_DEPLOYMENT_FIX.md** - Complete deployment guide
2. **EXACT_CHANGES_NEEDED.md** - Side-by-side code changes
3. **openrouter-adapter-FIXED.ts** - Complete fixed file (for copy/paste if needed)
4. **ACTION_PLAN.md** - This file

---

## Next Steps

1. **Right now**: Open `src/services/ai/providers/openrouter-adapter.ts` and apply the fix from EXACT_CHANGES_NEEDED.md
2. **In 5 minutes**: Run `npm run type-check` and `npm run build` to verify
3. **In 10 minutes**: Push to Git or use Vercel dashboard to deploy
4. **In 15 minutes**: Your app is live on Vercel

---

## Questions?

The core issue is straightforward:
- TypeScript doesn't allow undefined in object literals during strict mode
- The fix conditionally builds the headers object to avoid undefined values
- Same functionality, just TypeScript-compliant

If you need anything clarified, I can walk through the exact changes step-by-step.

