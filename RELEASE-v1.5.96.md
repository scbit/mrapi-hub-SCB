# v1.5.96 — Inbox phone suffix search

- Restores Inbox phone search when users enter a local/suffix number such as `1130962554` while stored conversations use full international forms like `5491130962554` or `whatsapp:+5491130962554`.
- Keeps the fast direct exact-field lookup first.
- Adds CRM indexed phone resolution as a bounded fallback, then resolves matching conversations by contactId, hubConversationId and the full normalized phone.
- Name search behavior is unchanged.
- No changes to unread/owner filters, CRM updates, HUMAN/BOT, Recovery or Gateway.
