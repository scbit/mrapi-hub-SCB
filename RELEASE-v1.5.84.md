# v1.5.84 — CRM note editable from Inbox

- The CRM side panel in Inbox now shows the deal note as an editable textarea.
- “Guardar nota” writes to the exact same `deals.notes` field used by CRM; there is no duplicate note store.
- The existing safe CRM→Inbox sync also updates `crmNotes` metadata on linked conversation aliases without replacing conversation documents.
- Cross-tab note changes are reflected between CRM and Inbox through a lightweight browser storage event; this creates no Firestore reads by itself.
- Saving a note uses the existing CRM deal update route, so read/write accounting stays bounded and consistent with other deal edits.
