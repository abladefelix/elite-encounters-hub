# Specialist Groups: UX & Admin Controls Mapping

This document outlines the proposed implementation for specialist groups within the Ashnight platform, ensuring that individual bookings remain unaffected.

## 1. Data Model Extensions

### Specialist Group Entity
- `id`: UUID
- `name`: String
- `description`: Text
- `lead_specialist_id`: UUID (References `profiles.id`)
- `room`: Tier (Basic, Premium, Ultimate)
- `hourly_rate`: Number (Total rate for the group)
- `active`: Boolean
- `created_at`: Timestamp
- `updated_at`: Timestamp

### Junction Table: `group_members`
- `group_id`: UUID
- `specialist_id`: UUID
- `role`: `lead` | `member`

### Booking Extensions
- `group_id`: UUID (Optional, null for individual bookings)
- `is_group_booking`: Boolean (Computed or stored)

---

## 2. Admin Controls (Ashnight Control Room)

### New Route: `/ashnight-control/groups`
- **Group Roster**: Table view of all specialist groups.
- **Filters**: By Room, Active status, or Lead specialist.
- **Group Editor**:
    - **Header**: Name and branding for the group.
    - **Team Management**: Interface to add/remove specialists. A group must have exactly one Lead.
    - **Rate Control**: Set a group-specific hourly rate (often higher than individuals but lower than the sum of parts).
    - **Visibility**: Toggle group visibility in the public directory.

### User Management Updates
- **Specialist Profile**: Add a "Groups" section showing which groups the specialist belongs to.

---

## 3. Client UX (Directory & Booking)

### Discovery
- **Specialists Index**: Add a "Groups" tab next to the individual specialist roster.
- **Group Cards**: Display:
    - Group Name & Headline.
    - Lead Specialist avatar + "+N members" badge.
    - Cumulative rating of the group members.
    - Group hourly rate.

### Group Profile Page (`/groups/$groupId`)
- Similar to the Specialist profile but highlights the "Team" aspect.
- List all members with links to their individual profiles.
- Collective portfolio/media.

### Booking Flow
- **Direct Messaging**: "Message Group" button opens a thread with the **Lead Specialist**. The thread is metadata-tagged with the `groupId`.
- **Booking Request**: The client sends a booking request for the group. The `Booking` record is created with the `groupId` populated.
- **Individual Integrity**: If a client chooses to book a group member individually from their personal profile, the `groupId` remains null, preserving the standard 1-on-1 workflow.

---

## 4. Specialist UX & Notifications

### Lead Specialist
- Receives notifications for all group booking requests.
- Responsible for coordination and confirming the job.
- Payout is directed to the Lead (default) or split via platform logic.

### Member Specialist
- Receives a "Group Booking Scheduled" notification once the lead accepts.
- View group schedule in their dashboard.
- **Permission**: Read-only access to group booking details.

---

## 5. Wallet & Escrow

### Flow
1. **Payment**: Client pays the total group rate + platform fee.
2. **Escrow**: Funds are held under the `BookingID`.
3. **Completion**: Lead marks job as complete; client confirms.
4. **Payout**: 
    - *V1 (Simple)*: Total payout to Lead Specialist wallet.
    - *V2 (Future)*: Pro-rata split based on admin-defined percentages.

---

## 6. Statuses & Boundaries

### Group Statuses
- `draft`: Only visible to admins.
- `active`: Visible to clients and specialists.
- `suspended`: Group bookings disabled, existing bookings honored.
- `archived`: Hidden from all non-admin views.

### Permission Boundaries
- **Admin**: Full CRUD on Groups.
- **Specialist**: Read group membership, participate in group bookings.
- **Client**: Browse active groups, book groups.
