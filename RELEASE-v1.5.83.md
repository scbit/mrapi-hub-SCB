# v1.5.83 — Owner sync across inbox aliases

- Fix: when a CRM deal owner changes, the Inbox now updates the linked conversation and its known duplicate/related conversation documents.
- This fixes Recovery deals that were reassigned (for example to Charo) but did not appear when filtering the Inbox by the new owner because the active alias still had the previous owner.
- Stage changes use the same safe alias sync so badges remain consistent across merged/legacy conversation rows.
- Sync remains merge-only: messages, referral/Meta Ads data, unread state, line data and other conversation fields are preserved.
- Read impact is bounded: owner/stage change adds at most one direct conversation read to discover aliases; normal Inbox loading is unchanged.
