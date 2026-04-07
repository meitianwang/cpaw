---
name: xurl
description: "Interact with X (Twitter) — post, search, read, engage via the xurl CLI."
metadata: { "klaus": { "emoji": "𝕏", "requires": { "bins": ["xurl"] }, "install": [{ "id": "brew", "kind": "brew", "formula": "xdevplatform/tap/xurl", "label": "Install xurl (brew)" }, { "id": "npm", "kind": "npm", "package": "@xdevplatform/xurl", "label": "Install xurl (npm)" }] } }
---

# xurl — X (Twitter) API CLI

Use `xurl` to interact with X (Twitter) API v2. Supports posting, reading, searching, engaging, and managing social interactions.

## When to Use

- User asks to post a tweet or reply
- User wants to search X for specific topics
- User wants to read their timeline or mentions
- User asks to like, repost, bookmark, or follow/unfollow
- User wants to send or read DMs on X

## SECURITY — CRITICAL

- NEVER read, print, or access `~/.xurl` (contains auth tokens)
- NEVER use `--verbose` / `-v` (can leak auth headers)
- NEVER use secret flags: `--bearer-token`, `--consumer-key`, `--consumer-secret`, `--access-token`, `--token-secret`, `--client-id`, `--client-secret`
- Always confirm with user before posting, replying, or sending DMs

## Quick Reference

| Action | Command |
|--------|---------|
| Post | `xurl post "Hello world!"` |
| Reply | `xurl reply POST_ID "Nice!"` |
| Quote | `xurl quote POST_ID "My take"` |
| Delete | `xurl delete POST_ID` |
| Read post | `xurl read POST_ID` |
| Search | `xurl search "query" -n 10` |
| Who am I | `xurl whoami` |
| User info | `xurl user @handle` |
| Timeline | `xurl timeline -n 20` |
| Mentions | `xurl mentions -n 10` |
| Like | `xurl like POST_ID` |
| Unlike | `xurl unlike POST_ID` |
| Repost | `xurl repost POST_ID` |
| Bookmark | `xurl bookmark POST_ID` |
| Bookmarks | `xurl bookmarks -n 10` |
| Follow | `xurl follow @handle` |
| Unfollow | `xurl unfollow @handle` |
| Followers | `xurl followers -n 20` |
| Following | `xurl following -n 20` |
| Block | `xurl block @handle` |
| Mute | `xurl mute @handle` |
| Send DM | `xurl dm @handle "message"` |
| List DMs | `xurl dms -n 10` |
| Upload media | `xurl media upload file.jpg` |
| Media status | `xurl media status MEDIA_ID` |
| Auth status | `xurl auth status` |

## Common Workflows

### Post with image

```bash
# 1. Upload image
xurl media upload /path/to/photo.jpg
# 2. Post with media ID from response
xurl post "Check this out!" --media-id MEDIA_ID
```

### Search and engage

```bash
# Search
xurl search "topic" -n 10
# Like an interesting post
xurl like POST_ID
# Reply
xurl reply POST_ID "Great point!"
```

### Check activity

```bash
xurl whoami
xurl mentions -n 20
xurl timeline -n 20
```

## Notes

- Post IDs and full URLs both work: `xurl read https://x.com/user/status/123`
- Usernames: `@handle` and `handle` both work
- All output is JSON
- Rate limits apply; wait and retry on 429 errors
- OAuth2 tokens auto-refresh when expired
- Always confirm content with user before posting/replying/DMing
