# RunMyPC — Claude Code Orientation

## First: Read the vault
Vault: /c/Users/mjohn/Documents/LaunchBox.Media/ai-brain/
Start every session: read _index.md then _session-handoff.md
Query deeper files only when needed via Graphify

## What this is
RunMyPC (styled after RunDMC) is a LaunchBox.Media product.
User makes selections, agents handle everything.
FlipBookPro generates the ebook via Sales API.
RunMyPC generates content, video, and ads.
Campaign Dashboard delivers all outputs.

## Stack
Next.js 14, Supabase (RunMyPC project — separate from 
FlipBookPro), Vercel Workflows, Apify, Anthropic API,
GPT-Image-2, Higgsfield, Remotion, Stripe

## Supabase
RunMyPC project — NOT the FlipBookPro project
Never query or modify FlipBookPro's Supabase

## Rules
- npx tsc --noEmit after every task
- Never touch /c/Users/mjohn/flipbookpro-v2
- Never use FlipBookPro Supabase project
- Run C:\Users\mjohn\Documents\LaunchBox.Media\session-end.sh before ending any session
- Caveman ultra unless deep debugging
- Read vault before asking questions already answered

## Current state
See ai-brain/_session-handoff.md
