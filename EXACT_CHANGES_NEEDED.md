# Exact Changes Required to Fix Vercel Build

## File: `src/services/ai/providers/openrouter-adapter.ts`

### Change #1: Fix the `chatCompletion` method (lines 47-57)

#### BEFORE (Current - Causes Error):
```typescript
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": env.NEXT_PUBLIC_APP_URL,
        "X-Title": env.NEXT_PUBLIC_APP_NAME,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
```

#### AFTER (Fixed):
```typescript
    // Build headers object, filtering out undefined values
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    // Add optional headers only if they're defined
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

---

### Change #2: Fix the `streamChatCompletion` method (lines 96-106)

#### BEFORE (Current - Causes Error):
```typescript
    const response = await fetch(OPENROUTER_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
        "HTTP-Referer": env.NEXT_PUBLIC_APP_URL,
        "X-Title": env.NEXT_PUBLIC_APP_NAME,
      },
      body: JSON.stringify(body),
      signal: request.signal,
    });
```

#### AFTER (Fixed):
```typescript
    // Build headers object, filtering out undefined values
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${apiKey}`,
    };

    // Add optional headers only if they're defined
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

---

## Why This Fix Works

### The Problem
TypeScript's strict mode (`strict: true` in tsconfig.json) doesn't allow `undefined` values in object literals. During Vercel's build, these optional environment variables are undefined, causing the type checker to fail.

### The Solution
Instead of trying to pass potentially undefined values directly to the headers object, we:
1. Create an empty headers object with proper typing: `Record<string, string>`
2. Add only the required headers that are always defined
3. Conditionally add optional headers only when they have values
4. This satisfies TypeScript's type checker while maintaining the same functionality

### Build Impact
- Build will now pass TypeScript type checking
- The `.next` output directory will be created successfully
- Application will deploy to Vercel without errors
- Runtime behavior is unchanged (headers are handled the same way)

---

## How to Apply This Fix

### Option 1: Manual Edit (Recommended for understanding)
1. Open `src/services/ai/providers/openrouter-adapter.ts` in your editor
2. Find line 47 (the first fetch call in `chatCompletion`)
3. Replace the 11-line headers object with the new pattern
4. Find line 96 (the second fetch call in `streamChatCompletion`)
5. Replace the same 11-line headers object with the new pattern
6. Save the file

### Option 2: Copy the Fixed File
1. Copy the contents of `openrouter-adapter-FIXED.ts`
2. Paste it into `src/services/ai/providers/openrouter-adapter.ts`
3. Save the file

### Option 3: Use sed (Command Line)
```bash
# This is complex and not recommended unless you're comfortable with sed
# Better to do it manually or use Option 2
```

---

## Verification

After applying the fix, run:

```bash
# Should now pass without errors
npm run type-check

# Should now succeed and create .next directory
npm run build
```

If both commands complete without errors, you're ready to deploy to Vercel.

---

## Summary of Changes

| Aspect | Before | After |
|--------|--------|-------|
| Lines affected | 2 locations (lines 47-57 and 96-106) | Same 2 locations |
| Lines added | 0 | ~14 per location |
| Lines removed | 11 per location | 11 per location |
| TypeScript error | TS2769 (2 occurrences) | 0 errors |
| Build status | FAILS | PASSES |
| Functionality | Same intent but type error | Same functionality, no type error |

