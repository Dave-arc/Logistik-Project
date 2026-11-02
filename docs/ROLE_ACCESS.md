# Role Hierarchy & Access Policy

This document records the intended role hierarchy and access boundaries for the Logistik Project.

## Role hierarchy

Highest to lowest:

1. **Admin**
   - Project/app owner.
   - Full ownership and administrative access, including Firebase and Netlify.
   - No other role may modify, promote, demote, or delete the Admin role.

2. **PPBK**
   - Full access within the application.
   - No access to Firebase or Netlify administration.
   - Cannot modify the Admin role.

3. **Capten**
   - Operational leadership role with role-management capabilities as defined by the application.
   - Cannot modify the Admin or PPBK roles.

4. **Asisten Capten**
   - Same in-app operational access as Capten.
   - Appointments and role changes require approval from Capten outside the app; the app does not record that approval.
   - Cannot modify the Admin or PPBK roles.

5. **Logistik**
   - Operational logistics staff; regular users of logistics workflows.

6. **Relawan lainnya**
   - Users outside the logistics team.
   - Read-only access.

## Security invariants

- Enforce authorization on the server side / Firebase Security Rules, not only by hiding UI controls.
- Users must not be able to grant themselves a higher role or alter protected roles.
- Admin and PPBK role records must be protected from changes by lower roles.
- Validate every privileged operation against the authenticated user's trusted role.
- Do not rely on client-provided role values as proof of authorization.

## Audit notes

- Review role assignment, role changes, and privilege-escalation paths across Firestore rules and application code.
- Keep stock/transaction integrity review as a separate deferred audit item.
- This document describes intended policy; implementation must be verified against the actual rules and code.
