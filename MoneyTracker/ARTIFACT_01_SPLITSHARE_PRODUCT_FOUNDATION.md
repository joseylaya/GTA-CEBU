# ARTIFACT 01 — PRODUCT FOUNDATION, WORKFLOWS & EDGE CASES
## SplitShare / Collaborative Finance Tracker

**Status:** Product source of truth for MVP planning and implementation  
**Purpose:** This document is intended to be fed into Codex or another coding agent before implementation. It defines what the product is, how it must behave, the workflows that must exist, the business rules that must remain consistent, and the edge cases that must be handled.

> **Important:** This artifact intentionally does **not** define the technical stack, frameworks, infrastructure, libraries, database engine, or deployment approach. Those belong to **ARTIFACT 02 — TECHNICAL ARCHITECTURE & STACK**.

---

# 1. PRODUCT IDENTITY

## 1.1 Working Product Name

**SplitShare**

Working category name:

**Collaborative Finance Tracker**

The product may be renamed later, but the product model defined in this document must remain stable unless the requirements are intentionally revised.

---

# 2. SOLE MISSION

> **Make shared expenses clear, fair, and easy to settle by giving groups one trusted place to record spending, understand who owes what, and collaborate without confusion.**

This is the single product mission.

Every MVP feature must support this mission directly.

Features that do not directly improve shared-expense tracking, transparency, settlement, or controlled collaboration should not block the MVP.

---

# 3. SOLE VISION

> **Become the trusted shared-money workspace where people can manage group expenses together with the same clarity, accountability, and control they expect from professional collaboration tools.**

The long-term product may expand beyond casual bill splitting, but the MVP must first solve shared-expense tracking extremely well.

The architecture should leave room for future collaborative-finance features without forcing those features into the first release.

---

# 4. PRODUCT POSITIONING

## 4.1 MVP Positioning

The MVP is primarily:

> **A collaborative expense-sharing application for trips, roommates, couples, families, and small groups.**

It is not initially a full accounting application, bank, wallet, payment processor, budgeting platform, or savings platform.

## 4.2 Long-Term Direction

The long-term product can evolve toward:

> **A collaborative workspace for shared money.**

Possible future extensions may include:

- budgets;
- group savings goals;
- wallet/account tracking;
- recurring expenses;
- receipt scanning;
- reminders;
- analytics;
- exports;
- automated debt simplification;
- richer financial workflows.

These are explicitly **not part of the core MVP unless promoted by a later requirements change**.

---

# 5. MVP PRODUCT PRINCIPLES

The following rules should guide every implementation decision.

## 5.1 Clarity Over Complexity

A user should quickly understand:

- what was paid;
- who paid;
- who participated;
- what their share is;
- whether they owe money;
- whether money is owed to them;
- who they need to settle with;
- why their balance has its current value.

## 5.2 Financial Results Must Be Explainable

No balance may appear as a magical number.

Every balance must be derivable from:

1. expenses;
2. expense splits;
3. settlements.

If a user asks, “Why do I owe this?”, the system must have enough information to explain it.

## 5.3 Collaboration Must Be Controlled

Users may collaborate inside a tracker, but their actions depend on their assigned role.

Permissions must be enforced both visibly in the interface and logically by the system.

## 5.4 Financial History Must Be Preserved

Deleting or editing financial data must not erase accountability.

Important actions must be represented in the activity history.

## 5.5 Mobile-First

The product is designed primarily for mobile interaction.

Common actions must require minimal steps:

- add expense;
- select participants;
- view balance;
- settle;
- check activity.

## 5.6 One Tracker, One Currency

Each tracker has exactly one configured currency.

A transaction inside a tracker uses that tracker currency.

Mixed-currency accounting is outside the MVP.

---

# 6. CANONICAL TERMINOLOGY

This section is mandatory because the prototype currently contains several names for similar concepts.

Codex must use the following terminology consistently in product copy, variables where practical, feature names, routes, documentation, and domain models.

## 6.1 Tracker

A **Tracker** is the main shared workspace.

Examples:

- Trip to Italy;
- Apartment;
- Sunday Dinner;
- Office Outing.

Do not use the following as alternative names for the same core object:

- Group;
- Shared Space;
- Project;
- Pool;
- Workspace;
- Fund.

These terms may exist in future features only if they represent genuinely different domain objects.

## 6.2 Expense

An **Expense** is a financial transaction paid by one tracker member and split among one or more members.

## 6.3 Split

A **Split** represents one member's assigned share of an expense.

## 6.4 Settlement

A **Settlement** records that one member paid another member toward an outstanding debt.

It reduces the outstanding balance.

## 6.5 Activity

**Activity** is the human-readable audit history of important actions.

It is not the same thing as a financial transaction.

## 6.6 Member

A **Member** is a user who belongs to a tracker.

## 6.7 Invitation

An **Invitation** is a pending request for a user or email address to join a tracker.

---

# 7. MVP SCOPE

## 7.1 Included in MVP

The MVP must include:

1. user registration/login;
2. tracker creation;
3. multiple trackers per user;
4. tracker membership;
5. member invitations;
6. role-based permissions;
7. expense creation;
8. expense editing;
9. expense soft deletion;
10. equal expense splitting;
11. automatic balance calculation;
12. per-member balances;
13. pairwise outstanding debts;
14. settlement recording;
15. tracker activity history;
16. transaction detail;
17. tracker member management;
18. profile/basic settings;
19. clear positive, negative, and settled balance states.

## 7.2 Optional MVP 1.1

The following may be implemented after the core MVP is stable:

- comments on expenses;
- reactions/likes;
- simple receipt attachment.

Comments are useful but must not delay the correctness of the expense and settlement engine.

## 7.3 Explicitly Out of Scope for Initial MVP

Do not build these unless a later artifact changes scope:

- savings goals;
- budgets;
- wallets;
- bank integrations;
- in-app money transfer;
- payment processing;
- AI receipt scanning/OCR;
- smart reminders;
- recurring expenses;
- advanced analytics;
- public tracker links;
- percentage split;
- exact custom amount split;
- weighted/share-based split;
- automatic debt simplification across unrelated member pairs;
- multi-currency conversion;
- investment tracking;
- income tracking;
- business accounting;
- tax reporting;
- general-purpose chat.

---

# 8. USER TYPES

## 8.1 Global User

A user exists independently from a tracker.

A user may:

- belong to zero or more trackers;
- own multiple trackers;
- receive invitations;
- have a global profile.

This means users do **not** exist only inside a tracker.

## 8.2 Tracker Member Roles

Each tracker membership has exactly one role:

- Owner;
- Editor;
- Commenter;
- Viewer.

The same person may have different roles in different trackers.

Example:

- Owner in “Apartment”;
- Editor in “Italy Trip”;
- Viewer in “Company Outing”.

---

# 9. ROLE AND PERMISSION RULES

## 9.1 Owner

The Owner has full control of the tracker.

The Owner may:

- view the tracker;
- add expenses;
- edit expenses;
- delete expenses;
- record settlements;
- comment if comments are enabled;
- invite members;
- remove members;
- change member roles;
- edit tracker name/description;
- manage tracker settings;
- transfer ownership;
- delete the tracker.

There must always be exactly one active Owner in the MVP.

## 9.2 Editor

An Editor may:

- view the tracker;
- add expenses;
- edit expenses;
- delete expenses;
- record settlements;
- comment if comments are enabled;
- view members;
- view activity.

An Editor may edit or delete expenses created by another Editor.

This is intentional collaborative behavior.

An Editor may **not**:

- invite members;
- remove members;
- change roles;
- change ownership;
- delete the tracker;
- modify restricted tracker settings.

## 9.3 Commenter

A Commenter may:

- view tracker content;
- view expenses;
- view balances;
- view members;
- view activity;
- add comments if comments are enabled.

A Commenter may not change financial data.

## 9.4 Viewer

A Viewer has read-only access.

A Viewer may:

- view tracker content;
- view expenses;
- view balances;
- view members;
- view activity.

A Viewer may not:

- add or edit expenses;
- delete expenses;
- record settlements;
- comment;
- change tracker settings;
- manage members.

## 9.5 Permission Matrix

| Action | Owner | Editor | Commenter | Viewer |
|---|---:|---:|---:|---:|
| View tracker | Yes | Yes | Yes | Yes |
| View balances | Yes | Yes | Yes | Yes |
| View activity | Yes | Yes | Yes | Yes |
| Add expense | Yes | Yes | No | No |
| Edit expense | Yes | Yes | No | No |
| Delete expense | Yes | Yes | No | No |
| Record settlement | Yes | Yes | No | No |
| Comment | Yes | Yes | Yes | No |
| Invite member | Yes | No | No | No |
| Remove member | Yes | No | No | No |
| Change role | Yes | No | No | No |
| Edit tracker | Yes | No | No | No |
| Transfer ownership | Yes | No | No | No |
| Delete tracker | Yes | No | No | No |

---

# 10. PRIMARY INFORMATION ARCHITECTURE

The global navigation should be intentionally simple.

## 10.1 Recommended Main Navigation

- **Home**
- **Trackers**
- **Activity**
- **Profile**

Do not use competing navigation labels such as:

- Groups;
- Spaces;
- Projects;
- Wallets;
- Goals;
- Friends;
- Budgets.

unless those become real future modules.

---

# 11. PRIMARY SCREEN MAP

The minimum product screen set is:

1. Welcome;
2. Login / Register;
3. Home;
4. Trackers;
5. Create Tracker;
6. Tracker Detail;
7. Add Expense;
8. Split Expense;
9. Expense Detail;
10. Settle Up;
11. Members & Permissions;
12. Invite Member;
13. Activity Feed;
14. Profile / Settings.

Optional post-MVP screens:

15. Comments;
16. Receipt attachment viewer;
17. Notification center;
18. Advanced reports.

---

# 12. BALANCE LANGUAGE RULES

Financial labels must never depend on color alone.

Use these exact conceptual states.

## 12.1 Positive Balance

If the user's tracker balance is positive:

**YOU ARE OWED**

Example:

> YOU ARE OWED  
> ₱450.00

## 12.2 Negative Balance

If the user's tracker balance is negative:

**YOU OWE**

Example:

> YOU OWE  
> ₱450.00

## 12.3 Zero Balance

If the user's balance is zero:

**YOU'RE SETTLED UP**

Example:

> YOU'RE SETTLED UP  
> ₱0.00

## 12.4 Avoid Ambiguous Labels

Avoid:

- Overall Balance — $450 owed;
- Balance — $450;
- Net — $450;

without explaining direction.

## 12.5 Tracker Total vs User Balance

These are different concepts and must not be confused.

Example:

**Total spent**  
₱15,400.00

**Your balance**  
You're owed ₱450.00

---

# 13. MONEY AND CALCULATION RULES

This is a critical section.

## 13.1 Exact Monetary Arithmetic

Money must never be calculated using imprecise floating-point behavior.

All calculations must preserve exact currency values to the supported smallest unit.

Example for PHP:

- ₱1,250.50 must remain exactly ₱1,250.50.

## 13.2 Expense Model

For MVP:

- one expense belongs to one tracker;
- one expense has one payer;
- one expense has one total amount;
- one expense has one or more participating members;
- each participating member receives one split;
- a member does not need to be included in every expense.

## 13.3 Equal Split

For equal split:

> Total expense amount = Sum of all split amounts

This invariant must always remain true.

Example:

Expense:

> ₱1,200

Participants:

- Joseph;
- Mars;
- Matt.

Split:

- Joseph = ₱400;
- Mars = ₱400;
- Matt = ₱400.

## 13.4 Rounding Rule

Example:

> ₱1,000 / 3

cannot produce three values of ₱333.33 because that totals ₱999.99.

The system must distribute the remainder deterministically.

Valid result:

- Participant 1 = ₱333.34;
- Participant 2 = ₱333.33;
- Participant 3 = ₱333.33.

Total:

> ₱1,000.00

The deterministic remainder rule should remain stable so the same expense always produces the same split.

Recommended conceptual rule:

1. calculate the base smallest-unit share;
2. calculate the remainder;
3. distribute one smallest currency unit to the earliest selected participants until the remainder reaches zero.

## 13.5 Expense Balance Formula

For each user:

> **Expense position = Total amount paid by user - Total assigned expense shares**

Positive means other people funded part of that user's payment obligation and the user is owed money.

Negative means the user benefited from expenses paid by others and owes money.

## 13.6 Settlement-Adjusted Balance

For each user:

> **Current balance = Amount paid for expenses - Assigned shares + Settlements sent - Settlements received**

Interpretation:

- positive = user is owed;
- negative = user owes;
- zero = settled.

### Example

Joseph pays ₱1,500 for Joseph, Mars, and Matt.

Equal share:

- Joseph = ₱500;
- Mars = ₱500;
- Matt = ₱500.

Initial balances:

- Joseph = +₱1,000;
- Mars = -₱500;
- Matt = -₱500.

Mars then pays Joseph ₱500 as a settlement.

After settlement:

- Joseph = +₱500;
- Mars = ₱0;
- Matt = -₱500.

Matt then pays Joseph ₱500.

Final:

- Joseph = ₱0;
- Mars = ₱0;
- Matt = ₱0.

## 13.7 Pairwise Debts

The system must preserve enough information to determine **who owes whom**, not only a global net number.

For the MVP:

- debts may be netted between the same two members;
- debts should not automatically be rerouted through unrelated members.

Example:

- A owes B ₱500;
- B owes C ₱500.

Do **not** automatically transform this into:

- A owes C ₱500.

Automatic multi-party debt simplification is a future feature.

---

# 14. TRACKER WORKFLOW

## 14.1 Create Tracker

### Preconditions

- user is authenticated.

### Flow

1. User opens Trackers.
2. User selects **Create Tracker**.
3. User enters:
   - tracker name;
   - optional description;
   - currency.
4. User confirms.
5. Tracker is created.
6. Creator becomes Owner.
7. User enters Tracker Detail.
8. User may invite members or skip.

### Required Result

The new tracker must:

- have exactly one owner;
- use one currency;
- start with zero financial activity;
- show a zero/settled balance state.

### Edge Cases

- missing name;
- unsupported currency;
- duplicate tracker name owned by same user;
- user taps Create twice;
- temporary request failure;
- user closes screen mid-submit.

Duplicate names may be allowed because tracker identity must not depend on name uniqueness.

Double-submit must not create duplicate trackers.

---

# 15. INVITATION WORKFLOW

## 15.1 Owner Sends Invitation

### Flow

1. Owner opens **Members & Permissions**.
2. Owner selects **Invite Member**.
3. Owner enters:
   - email or supported username;
   - role.
4. Owner sends invitation.
5. Invitation appears under **Pending Invites**.

### Role Defaults

If the Owner does not intentionally choose a role, use a clearly defined default.

Recommended default:

**Viewer**

Do not silently grant Editor access.

## 15.2 Existing User Accepts Invitation

1. User receives invitation.
2. User opens invitation.
3. User sees:
   - tracker name;
   - owner/inviter;
   - assigned role;
   - currency.
4. User selects **Join Tracker**.
5. Membership is created.
6. Invitation becomes accepted.
7. User may open the tracker.

## 15.3 Non-Existing User

If an invitee does not yet have an account:

1. Invitation remains pending.
2. Invitee creates an account using the invited email.
3. Eligible pending invitation is displayed.
4. Invitee accepts or declines.
5. Membership is created only on acceptance.

## 15.4 Invitation Statuses

A pending invitation must have a clear state such as:

- pending;
- accepted;
- declined;
- revoked;
- expired.

## 15.5 Invitation Edge Cases

Handle:

- user already a member;
- duplicate pending invitation;
- invitation email belongs to Owner;
- invitation revoked before acceptance;
- invitation expires;
- role changed while invite is pending;
- invitation accepted twice;
- account email differs from invite email;
- Owner deletes tracker before invite is accepted;
- Owner removes invitee immediately after acceptance.

No duplicate active memberships for the same user and tracker may exist.

---

# 16. MEMBER MANAGEMENT WORKFLOW

## 16.1 View Members

Members & Permissions must show:

- member name;
- avatar if available;
- role;
- pending invitations separately.

## 16.2 Change Role

Only Owner may change roles.

### Flow

1. Owner opens member.
2. Owner selects new role.
3. System explains capabilities.
4. Owner saves.
5. Role changes.
6. Activity entry is created.

## 16.3 Ownership Transfer

Because the tracker must always have exactly one owner:

1. Owner selects another active member.
2. Owner chooses **Transfer Ownership**.
3. User receives a confirmation warning.
4. On confirmation:
   - selected member becomes Owner;
   - previous Owner becomes a defined fallback role.

Recommended fallback role:

**Editor**

The transfer must be atomic.

There must never be:

- zero owners;
- two owners.

## 16.4 Remove Member

Only Owner may remove a member.

Before removal, the system must evaluate whether the member has:

- expense participation;
- expenses they paid;
- settlements;
- outstanding balance.

Historical financial records must remain valid after removal.

A removed member should no longer access the tracker but historical expense references must not disappear.

## 16.5 Owner Removal

Owner cannot remove themselves.

Owner must first:

- transfer ownership; or
- delete the entire tracker.

---

# 17. ADD EXPENSE WORKFLOW

The flow is intentionally two-step.

## 17.1 Step 1 — Expense Details

Required fields:

- amount;
- description;
- category;
- date;
- paid by.

Optional:

- note.

Receipt attachment is not part of core MVP unless explicitly enabled later.

### Flow

1. Owner or Editor selects **Add Expense**.
2. User enters amount.
3. User enters description.
4. User selects category.
5. User selects date.
6. User selects payer.
7. User continues to Split Expense.

### Payer Rule

For MVP, payer must be an active member of the tracker.

A user may create an expense paid by another member if their role permits editing financial data.

## 17.2 Step 2 — Split Expense

MVP split method:

**Equal only**

### Flow

1. Show expense total.
2. Show tracker members.
3. User selects participants.
4. At least one participant must be selected.
5. System calculates equal shares.
6. System shows each participant's amount.
7. User confirms.
8. Expense is created.
9. Splits are created.
10. Balances update.
11. Activity entry is created.

## 17.3 Payer Participation

The payer may be:

- included in the split; or
- excluded from the split.

Example:

Joseph buys a ₱900 gift for Mars and Matt.

Payer:

- Joseph.

Participants:

- Mars;
- Matt.

Equal split:

- Mars = ₱450;
- Matt = ₱450;
- Joseph = ₱0.

Joseph becomes owed ₱900.

## 17.4 Expense Invariants

An expense may not exist in a financially valid active state unless:

- amount > 0;
- payer is valid;
- tracker exists;
- creator has permission;
- at least one split exists;
- sum(splits) = expense amount.

---

# 18. EXPENSE DETAIL WORKFLOW

Every expense should have a detail screen.

The screen should explain the financial record completely.

Minimum content:

- description;
- total amount;
- payer;
- date;
- category;
- participants;
- individual split amounts;
- user's personal share;
- user's financial effect;
- comments if enabled;
- edit/delete controls based on permissions.

Example:

**Dinner at Lucca's**  
₱1,200.00

Paid by Alex  
Oct 24  
Dining

### Split

- Alex — ₱300;
- You — ₱300;
- Sarah — ₱300;
- Mark — ₱300.

### Your Position

> Alex paid ₱300.00 for your share.

This explanatory text is strongly recommended.

---

# 19. EDIT EXPENSE WORKFLOW

Owner and Editor may edit an expense.

Editable fields may include:

- amount;
- description;
- category;
- date;
- payer;
- participating members.

## 19.1 Recalculation Rule

If an edit changes:

- total amount;
- payer;
- participant list;

then splits and balances must be recalculated.

## 19.2 Existing Settlements

Editing an older expense after settlements already exist may change outstanding balances.

The system must:

- preserve settlements;
- recalculate balances from the full history;
- show the new outstanding result;
- log the edit.

Do not silently rewrite settlement history.

## 19.3 Edit Activity

Important edits must create an activity event.

Example:

> Sarah edited “Hotel” from ₱3,000 to ₱3,200.

The system may store before/after values for important changed fields.

---

# 20. DELETE EXPENSE WORKFLOW

Financial expenses must use soft deletion behavior conceptually.

Deleting an expense means:

- it is excluded from active balance calculations;
- it disappears from the normal active transaction list;
- its historical record remains available for audit;
- an activity event records the deletion.

Example:

> Mars deleted “Taxi — ₱650”.

The deleted expense must not continue affecting balances.

## 20.1 Restore

Restore may be added later.

If restore is implemented, restoring the expense must recalculate balances and create a new activity entry.

---

# 21. BALANCE WORKFLOW

## 21.1 Tracker Detail

Tracker Detail should prioritize:

1. user's balance;
2. settle-up action;
3. transactions;
4. member balances.

Recommended tabs:

- Transactions;
- Balances.

## 21.2 Transactions Tab

Shows:

- expense description;
- payer;
- date;
- user's financial effect.

Examples:

> Dinner at Lucca's  
> Paid by Alex  
> +₱12.50

> Weekly Groceries  
> Paid by You  
> -₱45.20

The sign alone must not be the only clue. Detail views must explain the meaning.

## 21.3 Balances Tab

Shows member relationships.

Example:

> Alex owes you ₱215.00  
> Sarah owes you ₱235.00

If the user owes:

> You owe Mark ₱120.00

If there are multiple relations, display them clearly.

## 21.4 Zero State

If no outstanding debt exists:

> Everyone is settled up.

---

# 22. SETTLEMENT WORKFLOW

Settlements are a core MVP requirement.

## 22.1 Start Settlement

User taps **Settle Up**.

The system shows current pairwise obligations involving the current user.

Example:

> You are owed ₱450.00

- Alex owes you ₱215;
- Sarah owes you ₱235.

Or:

> You owe ₱300.00

- You owe Alex ₱300.

## 22.2 Record Settlement

For a selected pair:

Fields:

- payer;
- receiver;
- outstanding amount;
- payment amount;
- date;
- optional payment method label;
- optional note.

The system is recording a payment that happened outside the application.

The MVP does not transfer money.

## 22.3 Full Settlement

If outstanding debt is ₱500 and settlement is ₱500:

- remaining pairwise debt becomes zero.

## 22.4 Partial Settlement

If outstanding debt is ₱500 and settlement is ₱200:

- remaining debt becomes ₱300.

Partial settlement should be allowed.

## 22.5 Overpayment

Recommended MVP behavior:

Do not allow settlement amount to exceed the current direct outstanding obligation between the selected payer and receiver.

Example:

Outstanding:

> Mars owes Joseph ₱500.

Attempt:

> Record ₱700.

Reject with a clear explanation.

This avoids unintentionally creating reverse credit through a settlement entry.

Future versions may explicitly support advances or overpayments.

## 22.6 Settlement Activity

Every successful settlement must generate activity.

Example:

> Chloe paid you ₱24.50.

or:

> You recorded a ₱500 settlement to Joseph.

## 22.7 Settlement Deletion/Edit

Because settlement changes are financially sensitive:

- Owner and Editor may correct a settlement;
- corrections must update balances;
- corrections must generate activity;
- destructive changes should require confirmation.

---

# 23. ACTIVITY FEED WORKFLOW

Activity is the collaborative audit trail.

## 23.1 Global Activity

The global Activity screen may show activity across trackers the user belongs to.

## 23.2 Tracker Activity

A tracker may also show tracker-specific history.

## 23.3 Activity Event Examples

- Sarah added Grocery Shopping — ₱45;
- Mark edited Dinner;
- Alex joined Trip to Italy;
- Owner changed David from Viewer to Commenter;
- Chloe settled ₱24.50;
- Mars deleted Taxi — ₱650;
- Sarah commented on Dinner.

## 23.4 Activity vs Transaction

Do not treat the activity feed as the source of financial truth.

Financial truth belongs to the financial records.

Activity describes what happened.

## 23.5 Activity Immutability

Activity records should not casually disappear when the referenced financial record is edited or deleted.

The audit history should still indicate that the action occurred.

---

# 24. COMMENT WORKFLOW — OPTIONAL MVP 1.1

Comments attach to one expense.

## 24.1 Allowed Roles

- Owner;
- Editor;
- Commenter.

Viewer cannot comment.

## 24.2 Purpose

Comments support context such as:

- “This includes parking.”
- “I already transferred my share.”
- “Can you check this amount?”

Comments do not alter financial balances.

## 24.3 Do Not Turn MVP Into a Chat App

Comments are secondary to the financial record.

The primary tracker interface should remain finance-first, not messaging-first.

---

# 25. HOME SCREEN WORKFLOW

Home is the user's cross-tracker summary.

Recommended information:

- total amount owed to user across trackers;
- total amount user owes across trackers;
- net balance;
- recent trackers;
- recent important activity.

Do not show unrelated future features such as:

- savings goals;
- budgets;
- wallet balance;

during MVP.

---

# 26. TRACKERS LIST WORKFLOW

The Trackers screen lists all trackers the user may access.

Each card should show:

- tracker name;
- lightweight context/description;
- user's current balance state;
- member count or member avatars;
- tracker currency.

Examples:

> Apartment  
> You're owed ₱400

> Sunday Dinner  
> You owe ₱42.50

> Italy Trip  
> Settled up

The list should prioritize personal financial meaning, not only total tracker spending.

---

# 27. PROFILE AND SETTINGS

MVP profile/settings may include:

- name;
- avatar;
- email;
- basic account options;
- logout;
- default display preferences if required.

Do not place tracker-specific member permissions in global settings.

Tracker permissions belong inside each tracker.

---

# 28. TRACKER SETTINGS

Owner-only settings may include:

- tracker name;
- tracker description;
- currency display;
- ownership transfer;
- delete tracker.

## 28.1 Currency Change

Recommended MVP rule:

Once the tracker contains financial records, changing currency should be restricted or require a strong warning.

Changing `PHP` to `USD` must **not** reinterpret ₱1,000 as $1,000.

Recommended behavior:

- allow currency change freely before first financial record;
- after financial activity exists, block currency change in MVP.

Multi-currency migration is out of scope.

---

# 29. TRACKER DELETION

Only Owner may delete tracker.

Deletion must require explicit confirmation.

The confirmation should make clear that the tracker will no longer be available to members.

If permanent backend deletion is not immediate, the product may use a soft-deleted/archived state internally.

Financial history should not become partially visible to members after deletion.

---

# 30. LEAVING A TRACKER

For non-owners, “Leave Tracker” may be supported.

Before leaving:

- user must be warned that they will lose access;
- historical financial references to them must remain;
- leaving must not delete their expense splits;
- balances must remain mathematically valid.

If the member has an outstanding balance, recommended MVP behavior:

- warn the member;
- allow leaving only if product policy intentionally supports it.

Preferred MVP policy:

> Block voluntary leaving while the member has a non-zero outstanding balance.

The Owner may still remove the member when necessary, but must see an outstanding-balance warning.

---

# 31. FINANCIAL EDGE CASES

The following must be considered during implementation.

## 31.1 Zero Amount

Do not allow zero-value expenses.

## 31.2 Negative Amount

Do not allow negative expense amounts in MVP.

Refunds require a future explicit transaction type.

## 31.3 No Participants

An expense cannot be saved with zero participants.

## 31.4 Payer Excluded

Allowed.

The payer may pay entirely for other people.

## 31.5 Single Participant

Allowed.

Example:

Joseph pays ₱500 only for Mars.

- Joseph paid = ₱500;
- Mars share = ₱500;
- Joseph becomes owed ₱500.

## 31.6 Payer Is Only Participant

Allowed.

Example:

Joseph pays ₱500 and only Joseph participates.

Balance effect:

- Joseph paid ₱500;
- Joseph share ₱500;
- net = ₱0.

This expense is valid but creates no debt.

## 31.7 Member Removed After Expense

Historical expense and split remain.

Do not erase the removed member from history.

## 31.8 Expense Edited After Member Removal

If editing requires selecting participants, historical removed members included in the existing expense must be treated carefully.

Recommended MVP rule:

- allow viewing historical removed participants;
- editing participant membership involving inactive users requires Owner/Editor confirmation;
- do not silently replace or delete them.

## 31.9 Duplicate Expense Submission

Rapid double-tap or request retry must not accidentally create duplicate financial records.

## 31.10 Duplicate Settlement Submission

The same protection must apply to settlements.

## 31.11 Concurrent Edit

If two Editors edit the same expense near-simultaneously:

- do not silently overwrite without conflict awareness;
- the final implementation must use a defined conflict strategy.

The technical method belongs in Artifact 2.

Product expectation:

> The user should not unknowingly overwrite a newer edit.

## 31.12 Deleted Expense Open in Another Session

If an expense is deleted while another member still has its edit screen open:

- the second user must not be able to restore/overwrite it accidentally by saving stale data;
- show that the record changed or is no longer active.

## 31.13 Settlement Against Changed Balance

If a user opens Settle Up showing ₱500 due, then another member changes an expense before the settlement is submitted:

- revalidate the outstanding amount on submission;
- do not rely only on the old screen value.

## 31.14 Fractional Splits

Rounding must always result in:

> Sum of split values = total expense.

## 31.15 Extremely Large Amounts

The UI and financial model must define a reasonable supported monetary range.

If the amount exceeds supported range, reject safely instead of overflowing or truncating.

---

# 32. MEMBER AND PERMISSION EDGE CASES

## 32.1 Last Owner

Cannot be removed or downgraded without ownership transfer.

## 32.2 Owner Changes Own Role

Not allowed unless ownership is being transferred.

## 32.3 Editor Attempts Member Management

Reject even if the UI somehow exposes the action.

## 32.4 Permission Changed Mid-Session

If an Editor is downgraded to Viewer while an Add Expense screen is open:

- submission must be reauthorized;
- it must fail cleanly if permission is no longer valid.

## 32.5 Removed Member With Open Session

After removal, future tracker requests must be rejected.

## 32.6 Duplicate Membership

One user must not have multiple active membership rows/records for the same tracker.

## 32.7 Invite Existing Member

Return a clear message instead of creating a duplicate invitation.

---

# 33. DATE AND TIME EDGE CASES

## 33.1 Expense Date vs Created Time

Expense date and system creation time are different concepts.

Example:

- dinner happened Oct 20;
- user recorded it Oct 24.

Both may be needed internally.

## 33.2 Activity Time

Activity uses actual event time, not expense date.

## 33.3 User Time Zones

Users may be in different time zones.

The product should present human-friendly local dates/times without changing the actual historical event moment.

The implementation strategy belongs in Artifact 2.

---

# 34. CURRENCY EDGE CASES

## 34.1 Currency Code

Currency should be represented conceptually by a standard currency identity such as:

- PHP;
- USD;
- JPY;
- EUR.

The UI may render the appropriate symbol.

## 34.2 No Cross-Currency Tracker Math

A PHP tracker must not accept a USD expense in MVP.

## 34.3 Currency Precision

Do not assume every currency necessarily behaves identically.

The implementation should support the tracker currency's valid minor-unit precision.

---

# 35. UI AND UX EDGE CASES

## 35.1 Empty Tracker

Show a useful empty state:

> No expenses yet. Add the first expense.

## 35.2 No Outstanding Balance

Show:

> Everyone is settled up.

Do not show a disabled confusing Settle Up flow.

## 35.3 Long Descriptions

Expense names must truncate or wrap cleanly.

## 35.4 Large Member Count

Member and split screens must remain usable when the tracker contains many members.

## 35.5 Offline/Network Failure

Do not show an expense as successfully saved if persistence failed.

The specific offline strategy belongs in Artifact 2.

## 35.6 Loading States

Balance screens must not temporarily show incorrect zero values while data is still loading.

Prefer a loading state over a misleading balance.

## 35.7 Error Copy

Financial errors should explain what the user can do next.

Avoid generic:

> Something went wrong.

Prefer:

> This balance changed before your settlement was saved. Review the updated amount and try again.

---

# 36. ACTIVITY/AUDIT EDGE CASES

Important actions that should create activity include:

- tracker created;
- tracker renamed;
- member invited;
- invitation accepted;
- member removed;
- role changed;
- ownership transferred;
- expense created;
- expense edited;
- expense deleted;
- settlement created;
- settlement corrected/deleted;
- comment created if comments are enabled.

Activity must identify the acting user when available.

Automated system actions should be distinguishable from human actions.

---

# 37. FINANCIAL CONSISTENCY INVARIANTS

The following conditions must always hold.

## 37.1 Expense Invariant

For every active expense:

> Sum of active split amounts = expense amount.

## 37.2 Tracker Membership Invariant

Every active tracker has exactly one Owner.

## 37.3 Currency Invariant

All financial values within one tracker use the same tracker currency.

## 37.4 Settlement Invariant

A settlement records value transferred from one member to another and must adjust their outstanding relationship consistently.

## 37.5 Balance Reconstructability

The current balance must be reconstructable from financial history.

A manually edited balance field must never be the source of truth.

## 37.6 Audit Invariant

Financial edits and deletions must be attributable in activity history.

---

# 38. RECOMMENDED BALANCE COMPUTATION EXAMPLE

Tracker members:

- Joseph;
- Mars;
- Matt.

## Expense 1

Joseph pays:

> ₱1,500

Participants:

- Joseph;
- Mars;
- Matt.

Shares:

- Joseph = ₱500;
- Mars = ₱500;
- Matt = ₱500.

Balances:

- Joseph = +₱1,000;
- Mars = -₱500;
- Matt = -₱500.

## Expense 2

Mars pays:

> ₱600

Participants:

- Mars;
- Matt.

Shares:

- Mars = ₱300;
- Matt = ₱300.

Additional effect:

- Mars = +₱300;
- Matt = -₱300.

Combined balances:

- Joseph = +₱1,000;
- Mars = -₱200;
- Matt = -₱800.

Check:

> +₱1,000 - ₱200 - ₱800 = ₱0.

A tracker's member balances should net to zero before considering external accounting concepts.

## Settlement

Matt pays Joseph:

> ₱500.

Updated:

- Joseph = +₱500;
- Mars = -₱200;
- Matt = -₱300.

Check:

> +₱500 - ₱200 - ₱300 = ₱0.

This zero-sum relationship is a useful consistency check for the shared-expense model.

---

# 39. PRODUCT COPY STANDARD

Use consistent wording.

Preferred:

- Tracker;
- Expense;
- Add Expense;
- Split Expense;
- Paid by;
- Your share;
- You are owed;
- You owe;
- Settled up;
- Settle Up;
- Members & Permissions;
- Invite Member;
- Activity;
- Pending Invites.

Avoid mixing:

- Project;
- Group;
- Space;
- Pool;
- Wallet;
- Feed;

for core tracker concepts.

---

# 40. DESIGN DIRECTION FROM THE PROTOTYPE

The chosen direction should preserve:

- mobile-first layout;
- clean white/light backgrounds;
- green as primary action/positive emphasis;
- card-based layout;
- clear amount typography;
- strong balance summaries;
- visible member roles;
- simple transaction rows;
- clear settlement CTA.

The preferred Tracker Detail direction is finance-first:

1. tracker identity;
2. user balance;
3. Settle Up;
4. Transactions / Balances;
5. transaction list.

Avoid making the primary tracker experience look like a general chat application.

Social interaction may exist inside expense details or the activity feed.

---

# 41. MVP END-TO-END USER JOURNEY

A successful first-time user journey should be:

1. User opens SplitShare.
2. User creates account or logs in.
3. User creates “Trip to Italy”.
4. User chooses PHP.
5. User invites Sarah and Alex.
6. Sarah joins as Editor.
7. Alex joins as Viewer.
8. User adds Dinner — ₱1,500.
9. User selects:
   - user;
   - Sarah;
   - Alex.
10. System splits equally.
11. Tracker balances update immediately.
12. Sarah adds Taxi — ₱600.
13. User opens Balances.
14. User sees exactly who owes whom.
15. One member pays another outside the app.
16. Authorized user records settlement.
17. Balances recalculate.
18. Activity shows:
   - expenses created;
   - members joined;
   - settlement recorded.
19. Once all obligations are settled, tracker shows:
   - **Everyone is settled up.**

If this journey is reliable and easy, the MVP is doing its core job.

---

# 42. MVP DEFINITION OF DONE

The MVP should not be considered complete merely because screens exist.

It is complete only when the following are true:

## Product

- terminology is consistent;
- one tracker currency is enforced;
- roles behave according to the permission matrix;
- tracker ownership is safe;
- invitations work end-to-end;
- expense creation works;
- equal split math is exact;
- edits recalculate correctly;
- deletes stop affecting balances;
- per-user balances are correct;
- pairwise debt can be explained;
- settlements work;
- partial settlements work;
- activity reflects important actions;
- zero/positive/negative balance states are clear.

## Reliability

- duplicate submissions do not create accidental duplicate financial records;
- stale financial actions are revalidated;
- unauthorized actions fail;
- financial totals remain internally consistent;
- historical members remain represented in old financial records;
- no valid expense has split totals different from its amount.

## UX

A new user should be able to complete:

> Create Tracker → Invite Member → Add Expense → Split → View Balance → Settle

without needing external instructions.

---

# 43. CODEX IMPLEMENTATION DIRECTIVES

When this artifact is supplied to Codex, treat the following as non-negotiable unless a later artifact explicitly overrides them.

1. **Use “Tracker” as the canonical shared-space domain term.**
2. **Do not introduce Goals, Budgets, Wallets, or Savings into the MVP.**
3. **Do not treat balances as manually editable source-of-truth values.**
4. **Balance must be derived from expenses, splits, and settlements.**
5. **Do not use floating-point money calculations.**
6. **Equal split must preserve exact totals after rounding.**
7. **An expense must support a payer who is not included in the split.**
8. **Not all tracker members must participate in every expense.**
9. **Settlement is a core feature, not a future add-on.**
10. **Settlement records external payment; the application does not move money in MVP.**
11. **Do not auto-simplify debts across unrelated member pairs in MVP.**
12. **Owner, Editor, Commenter, Viewer permissions must be enforced by the system, not only hidden in UI.**
13. **A tracker must always have exactly one Owner.**
14. **Important financial mutations must create activity/audit history.**
15. **Financial deletion must preserve historical accountability.**
16. **Use explicit balance copy: “You are owed”, “You owe”, “Settled up”.**
17. **Keep the primary product finance-first rather than chat-first.**
18. **Do not promise receipt AI, smart reminders, percentage split, or other future functionality in MVP UI.**
19. **Do not silently overwrite newer financial edits.**
20. **Do not create implementation-specific architectural assumptions from this artifact; those belong to Artifact 02.**

---

# 44. FUTURE FEATURE BOUNDARY

The product may later expand through separately designed modules.

Potential future modules:

## Advanced Splits

- exact amount;
- percentage;
- weighted shares.

## Debt Simplification

- reduce the number of payments across a group.

## Receipts

- upload image;
- OCR;
- merchant/amount extraction.

## Recurring Expenses

- rent;
- subscriptions;
- utilities.

## Notifications

- invitation;
- new expense;
- changed expense;
- due settlement;
- reminder.

## Reports

- spending by category;
- member contribution;
- period summaries;
- exports.

## Savings / Goals

Savings goals must be modeled separately from expense debt.

They must not be disguised as ordinary trackers without explicit financial semantics.

## Budgets

Budgets require their own:
- period;
- limit;
- category scope;
- spent calculation;
- remaining calculation.

## Wallets / Accounts

Wallet/account tracking requires separate ownership and accounting concepts.

Do not prematurely combine those models with the MVP expense tracker.

---

# 45. FINAL PRODUCT CONTRACT

The MVP exists to answer five questions correctly at all times:

1. **What was spent?**
2. **Who paid?**
3. **Who shared the expense?**
4. **Who currently owes whom, and how much?**
5. **What happened to produce that result?**

If the application cannot answer all five clearly and mathematically correctly, the product is not complete.

---

# END OF ARTIFACT 01

**Next planned document:**  
**ARTIFACT 02 — TECHNICAL ARCHITECTURE & STACK**

Artifact 02 should define, after user confirmation:

- client technology;
- backend technology;
- database;
- authentication;
- API style;
- real-time strategy;
- storage;
- background jobs;
- deployment;
- environments;
- testing;
- observability;
- security implementation;
- project structure;
- coding conventions;
- migration strategy;
- CI/CD;
- Codex development workflow.

Artifact 02 must use Artifact 01 as the immutable product/business source of truth unless a product requirement is explicitly revised.
