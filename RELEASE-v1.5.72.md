# v1.5.72

- Inbox search now behaves as a real filter: search results replace the loaded conversation list until the search is cleared.
- Clearing the search restores the normal inbox list.
- Live conversation refresh no longer injects unrelated chats while a search filter is active.
- CRM side panel now validates stale legacy contact links before trusting them.
- If a conversation has a stale/missing CRM link, the side panel falls back to the same indexed phone resolution used by global CRM search.
- Deal resolution validates legacy explicit deal links against the conversation phone and recovers deals by normalized phone when needed.
- Version bumped to 1.5.72.
