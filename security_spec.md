# Firestore Security Specification: Tactical Trauma & Combat Simulator

## 1. Data Invariants
1. **Ownership & Identity**: An operator record or casualty report cannot be created or modified unless `request.auth != null` and `data.userId == request.auth.uid`.
2. **Immutable Identity**: `userId` and `createdAt` must remain immutable across all updates.
3. **Array Boundaries**: `injuriesSustained` and `woundsSummary` arrays must never exceed 20 elements to protect against Denial of Wallet attacks.
4. **ID Hardening**: All document path keys must conform to `isValidId()` (regex `^[a-zA-Z0-9_\-]+$`, length <= 128).
5. **Secure Queries**: List operations enforce query boundaries by matching `resource.data.userId == request.auth.uid`.

## 2. The Dirty Dozen Attack Payloads
1. **Ghost Field Injection**: Adding `isAdmin: true` into `OperatorProfile`. (Rejected via strict field validation).
2. **Identity Spoofing**: Attempting to create an operator with `userId: "foreign_user_id"`. (Rejected via `request.auth.uid == incoming().userId`).
3. **Giant Payload Exhaustion**: Setting `name` to a 5MB string. (Rejected via `name.size() <= 100`).
4. **Path Traversal / Malicious ID**: Writing to `/operators/..%2F..%2Fadmin`. (Rejected via `isValidId()`).
5. **Unauthenticated Write**: Submitting casualty report with `request.auth == null`. (Rejected via `isSignedIn()`).
6. **Cross-Tenant Scrape**: Listing all casualty reports without filtering `userId == request.auth.uid`. (Rejected via `allow list: if resource.data.userId == request.auth.uid`).
7. **Immutable Field Tampering**: Updating `userId` or `createdAt` on an existing operator. (Rejected via immutability checks).
8. **Invalid Enum**: Setting `status: "super_soldier"` instead of allowed enum. (Rejected via enum allowlist).
9. **Negative Stats**: Setting `deployments: -5` or `finalBloodVolume: -500`. (Rejected via non-negative integer check).
10. **Array Flooding**: Injecting an array of 5,000 strings into `injuriesSustained`. (Rejected via `.size() <= 20`).
11. **Client Timestamp Spoof**: Modifying timestamps arbitrarily. (Enforced via timestamp strings).
12. **Unauthorized Deletion**: User attempting to delete another player's casualty report. (Rejected via `resource.data.userId == request.auth.uid`).
