# Vercel Deployment Fix Guide for Supa AI

## Problem Analysis

The error "The Next.js output directory '.next' was not found" occurs because the build fails during the `npm run build` step. The root cause is a **TypeScript compilation error** in the OpenRouter adapter.

### Root Cause
File: `src/services/ai/providers/openrouter-adapter.ts`
Lines: 49-54 and 98-103

The issue: The fetch headers object contains optional environment variables that could be `undefined`:
- `NEXT_PUBLIC_APP_URL` (optional URL)
- `NEXT_PUBLIC_APP_NAME` (optional string)

TypeScript strict mode rejects undefined values in the headers object during build time.

---

## Solution

### Quick Fix (Recommended)

Replace the problematic headers in the OpenRouter adapter to filter out undefined values.

**File: `src/services/ai/providers/openrouter-adapter.ts`**

Replace the fetch calls at lines 47-57 and 96-106 with this pattern:

```typescript
// Build headers with only defined values
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

const response = await fetch(OPENROUTER_URL, {
  method: "POST",
  headers,
  body: JSON.stringify(body),
  signal: request.signal,
});
```

This needs to be applied in TWO places:
1. Line 47 in the `chatCompletion` method
2. Line 96 in the `streamChatCompletion` method

---

## Vercel Environment Variables Setup

Add these to your Vercel project dashboard:

### Required for Build
```env
# Node.js Runtime
VERCEL_ENV=production
```

### Recommended Environment Variables (optional)
```env
# Application metadata (used by OpenRouter)
NEXT_PUBLIC_APP_URL=https://your-app-domain.vercel.app
NEXT_PUBLIC_APP_NAME=Supa AI

# Supabase configuration
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key

# Optional AI Provider Keys (add only if needed)
OPENROUTER_API_KEY=your-key-here
OPENAI_API_KEY=your-key-here
ANTHROPIC_API_KEY=your-key-here
```

### Important Notes
- **All environment variables are optional** for the build to succeed
- API keys are only needed if you use those services
- The build will NOT fail if any variables are missing

---

## Step-by-Step Deployment to Vercel

### 1. Fix TypeScript Errors Locally

Apply the headers fix to `src/services/ai/providers/openrouter-adapter.ts` (see solution above).

Test locally:
```bash
npm run type-check  # Should pass
npm run build       # Should succeed
```

### 2. Push to Git Repository

```bash
git add -A
git commit -m "fix: handle optional environment variables in OpenRouter adapter"
git push origin main
```

### 3. Connect to Vercel

Option A: Using Vercel Dashboard
1. Go to https://vercel.com/dashboard
2. Click "Add New" → "Project"
3. Import your Git repository
4. Vercel automatically detects Next.js
5. Click "Deploy"

Option B: Using Vercel CLI
```bash
npm install -g vercel
vercel login
vercel
```

### 4. Configure Environment Variables (if needed)

In Vercel Dashboard → Project Settings → Environment Variables:
- Add only the variables your app actually uses
- Leave API keys blank initially (add them later if needed)

### 5. Monitor Build

1. Go to Deployments tab
2. Watch the build logs in real time
3. If build fails, check the error output (it will show specific issues)

---

## Verification Checklist

Before pushing to production, verify locally:

```bash
# Install dependencies
npm install

# Type checking (must pass)
npm run type-check

# Build (must succeed)
npm run build

# Lint check
npm run lint

# Unit tests (optional but recommended)
npm run test
```

All commands should complete without errors.

---

## Additional Vercel Configuration

### vercel.json (optional but recommended)

Create `vercel.json` in project root:

```json
{
  "builds": [
    {
      "src": "package.json",
      "use": "@vercel/next"
    }
  ],
  "env": {
    "VERCEL": "1"
  }
}
```

### Next.js Config Note

Your `next.config.ts` correctly detects Vercel environment:
```typescript
const isVercel = process.env.VERCEL === "1";
// Removes 'standalone' output mode on Vercel (recommended)
...(isVercel ? {} : { output: "standalone" as const })
```

This is correct and doesn't need changes.

---

## Troubleshooting

### Build Still Fails After Fix

1. Check the Vercel build logs for specific error
2. Run `npm run type-check` locally to catch TypeScript errors
3. Look for these common issues:
   - Missing `node_modules` (delete `package-lock.json`, run `npm install`)
   - TypeScript errors (run `npm run type-check`)
   - ESLint errors (run `npm run lint`)

### Deployment Succeeds but App Doesn't Work

1. Check environment variables are set in Vercel dashboard
2. Check application logs: Vercel dashboard → Deployments → Function Logs
3. Check browser console for client-side errors

### Revert to Previous Version

In Vercel dashboard, go to Deployments and click the "Promote to Production" button on a previous successful build.

---

## Next Steps

1. Apply the TypeScript fix above
2. Test locally with `npm run type-check && npm run build`
3. Push to your Git repository
4. Deploy to Vercel
5. Monitor the build logs
6. Add environment variables as needed after initial deployment

For questions, consult:
- Vercel docs: https://vercel.com/docs/frameworks/nextjs
- Next.js deployment: https://nextjs.org/docs/deployment/vercel
