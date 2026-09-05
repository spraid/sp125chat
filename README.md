# Proximity Chat

Build a complete production-ready "Nearby Chat" web application.

CORE CONCEPT

-------------

This application allows registered users to discover other users who are currently online and physically within a 1 kilometer radius, send a chat request, accept/reject the request, and then have a private real-time conversation.

IMPORTANT:

- This must be a real working application, not a mockup.

- Use real authentication, database, location detection, realtime messaging, and security.

- Do not use fake users or fake chat data in production.

- Make the application responsive for desktop, tablet, and mobile.

- The UI should look modern, clean, professional, and trustworthy.

TECHNOLOGY

----------

Use:

- React

- TypeScript

- Tailwind CSS

- shadcn/ui components where appropriate

- Supabase for:

  - Authentication

  - PostgreSQL database

  - Realtime chat

  - Row Level Security

  - Storage for profile photos

  - Edge Functions where necessary

- Use browser Geolocation API for user location.

- Use PostGIS/geospatial queries if available in Supabase for accurate 1 km radius searching.

Do NOT expose Supabase service-role keys in frontend code.

AUTHENTICATION

--------------

Create complete authentication:

- Sign up

- Login

- Logout

- Forgot password

- Reset password

- Email verification

- Protected routes

- Session persistence

Registration fields:

- Full name

- Email

- Password

- Profile photo (optional)

After registration/login, require the user to grant browser location permission before accessing Nearby Chat.

USER PROFILE

------------

Create a profile page where users can:

- View profile

- Edit full name

- Upload/change profile photo

- Change password

- Logout

- Delete account

Database user profile should contain:

- id

- full_name

- email

- avatar_url

- latitude

- longitude

- location_updated_at

- online

- last_seen

- created_at

- updated_at

LOCATION SYSTEM

---------------

Use the browser Geolocation API.

When the user grants location permission:

- Get current latitude and longitude.

- Store location securely in the database.

- Update the location periodically while the Nearby Chat page is active.

- Update online status while the user is active.

- Update last_seen when the user becomes inactive/offline.

IMPORTANT PRIVACY RULES:

- NEVER display exact latitude or longitude to another user.

- NEVER expose the user's exact coordinates through the frontend.

- Only use coordinates internally for distance calculations.

- Display approximate distance such as:

  - "120 m away"

  - "450 m away"

  - "0.8 km away"

- Do not show an exact map pin for another user's location.

- Do not reveal a user's home/address/location history.

NEARBY USERS

------------

Create a "Nearby People" page.

Show only users who:

1. Are currently online or recently active according to the defined online-status rules.

2. Have location permission enabled.

3. Have a valid recent location.

4. Are within 1 kilometer of the current user.

5. Are not the current user.

6. Have not blocked the current user.

7. Have not been blocked by the current user.

Sort users by distance, nearest first.

Each user card should display:

- Profile photo

- Name

- Online indicator

- Approximate distance

- "Send Chat Request" button

Example:

--------------------------------

[Profile Photo]

Rahul Kumar

● Online

350 m away

[ Send Chat Request ]

--------------------------------

Do not display exact coordinates.

DISTANCE CALCULATION

--------------------

Use accurate geospatial distance calculation.

The maximum radius is:

1000 meters.

Only return users whose actual calculated distance is <= 1000 meters.

Do not rely only on a bounding-box/geohash result.

If PostGIS is available, use PostGIS geography/distance functions for the final distance filtering.

The frontend must never be trusted to enforce the 1 km restriction. The database/server must enforce it.

CHAT REQUEST SYSTEM

-------------------

Implement a complete chat request system.

A user can send a request to another nearby user.

Request states:

- pending

- accepted

- rejected

- cancelled

- blocked

Prevent:

- Duplicate pending requests

- Sending a request to yourself

- Sending requests to blocked users

- Sending requests to users outside the allowed 1 km radius

- Sending unlimited spam requests

When User A sends a request to User B:

User B should receive a realtime notification:

"Rahul Kumar wants to chat with you."

Buttons:

[ Accept ]

[ Reject ]

When accepted:

- Create a private conversation.

- Add both users as conversation members.

- Open the chat screen.

CHAT PAGE

---------

Create a private realtime chat interface.

Layout:

Left/sidebar:

- Conversations

- Profile photo

- Name

- Online status

- Last message

- Unread message count

Main chat:

- Header with profile photo/name

- Online/offline status

- Messages

- Message timestamps

- Message input

- Send button

Messages must update in realtime without page refresh.

Message features:

- Text messages

- Timestamps

- Sent/received message styling

- Unread count

- Mark messages as read

- Auto-scroll to latest message

- Typing indicator if practical

- Enter to send

- Shift + Enter for new line

Do not allow users to access conversations they are not members of.

REALTIME

--------

Use Supabase Realtime for:

- New messages

- New chat requests

- Request acceptance/rejection

- Online status changes

- Unread counts

- Typing indicator if implemented

Do not poll the server unnecessarily.

ONLINE STATUS

-------------

Implement reliable online presence.

Display:

● Online

or:

○ Offline

Use heartbeat/activity tracking.

A user should not remain permanently online after closing the browser.

Store:

- online

- last_seen

Use a reasonable timeout to determine inactivity/offline status.

BLOCK USER

----------

Add a Block User option in the profile/chat menu.

When User A blocks User B:

- B must disappear from A's nearby list.

- A must disappear from B's nearby list.

- B cannot send requests to A.

- A cannot send requests to B.

- Existing conversation should become inaccessible or read-only according to the security design.

- Remove pending requests between the users.

REPORT USER

-----------

Add "Report User".

Report form:

- Spam

- Harassment

- Inappropriate content

- Fake profile

- Other

Allow optional description.

Store reports securely.

Create a basic admin moderation page where administrators can:

- View reports

- View reported user

- View reporter

- Change report status

- Suspend/disable users if necessary

RATE LIMITING / ANTI-SPAM

-------------------------

Implement protection against abuse.

Examples:

- Limit chat requests per user per hour/day.

- Prevent repeated requests to the same person.

- Prevent message flooding.

- Validate message length.

- Sanitize user-generated content.

- Prevent unauthorized database access.

- Use database constraints where appropriate.

DATABASE

--------

Create all required Supabase tables.

Recommended tables:

profiles

- id

- full_name

- avatar_url

- latitude

- longitude

- location_updated_at

- online

- last_seen

- created_at

- updated_at

chat_requests

- id

- sender_id

- receiver_id

- status

- created_at

- updated_at

conversations

- id

- created_at

- updated_at

conversation_members

- conversation_id

- user_id

- joined_at

messages

- id

- conversation_id

- sender_id

- content

- created_at

- read_at

blocks

- id

- blocker_id

- blocked_id

- created_at

reports

- id

- reporter_id

- reported_user_id

- reason

- description

- status

- created_at

- updated_at

notifications

- id

- user_id

- type

- title

- message

- related_id

- read

- created_at

DATABASE SECURITY

-----------------

Implement strict Supabase Row Level Security.

Users must only be able to:

- Read/edit their own profile data where appropriate.

- Update their own location.

- Read nearby users only through a secure server-side/RPC mechanism.

- Create chat requests according to security rules.

- Read requests involving themselves.

- Accept/reject requests sent to them.

- Read conversations where they are members.

- Send messages only to conversations where they are members.

- Read messages only from their conversations.

- Create their own reports.

- Manage their own blocks.

Never allow a user to query all profiles and obtain everybody's latitude/longitude.

Never expose private coordinates to the client.

NEARBY SEARCH API

-----------------

Create a secure database function/RPC such as:

get_nearby_users()

It should:

- Use the authenticated user's current location.

- Search within 1000 meters.

- Exclude the authenticated user.

- Exclude blocked users.

- Return only safe public profile fields.

- Calculate distance server-side.

- Return approximate distance in meters.

- Never return latitude/longitude of other users.

Example response:

[

  {

    "id": "...",

    "full_name": "Rahul Kumar",

    "avatar_url": "...",

    "distance_meters": 350,

    "online": true

  }

]

UI PAGES

--------

Create these pages:

1. Landing Page

2. Login

3. Register

4. Forgot Password

5. Reset Password

6. Location Permission

7. Nearby People

8. Chat Requests

9. Conversations

10. Chat

11. Profile

12. Settings

13. Blocked Users

14. Report User

15. Admin Dashboard

16. Privacy Policy

17. Terms & Conditions

NAVIGATION

----------

Desktop navigation:

- Nearby

- Requests

- Messages

- Profile

Mobile:

Use a bottom navigation bar:

Nearby | Requests | Messages | Profile

NEARBY PAGE UI

--------------

At the top:

"People Near You"

Subtitle:

"Discover people currently within 1 km."

Show:

- Location status

- Refresh button

- Nearby user count

If location permission is denied:

Show:

"Location access is required to find people near you."

Button:

[ Enable Location ]

If there are no users:

"No people nearby right now."

If location is outdated:

"Updating your location..."

CHAT REQUEST UI

---------------

Create a clean request list:

Incoming:

- Profile

- Name

- Distance if appropriate

- Time

- Accept

- Reject

Outgoing:

- Profile

- Name

- Pending status

- Cancel Request

NOTIFICATIONS

-------------

Create realtime in-app notifications for:

- New chat request

- Request accepted

- Request rejected

- New message

- User blocked if appropriate

Show notification badge counts.

RESPONSIVE DESIGN

-----------------

The entire application must work well on:

- Desktop

- Laptop

- Tablet

- Android

- iPhone

The chat interface must be especially optimized for mobile.

Use accessible buttons, readable typography, proper spacing and keyboard navigation.

LOADING / ERROR STATES

----------------------

Implement proper:

- Loading skeletons

- Empty states

- Error messages

- Network error handling

- Location permission errors

- Authentication errors

- Database errors

- Realtime connection errors

Never show raw database errors to normal users.

SECURITY

--------

Follow secure coding practices.

Important:

- Never expose service-role credentials.

- Never trust client-side distance calculations.

- Never expose exact user coordinates.

- Validate all inputs.

- Enforce authorization through Supabase RLS.

- Prevent IDOR/access-control vulnerabilities.

- Prevent unauthorized conversation access.

- Prevent users from reading other users' private data.

- Sanitize message content.

- Add reasonable rate limits.

PROFILE PRIVACY

---------------

Only show public information to nearby users:

- Name

- Profile photo

- Online status

- Approximate distance

Do not show:

- Email

- Phone number

- Exact location

- Location history

- IP address

- Private account information

ADMIN

-----

Create an admin role.

Admin dashboard should show:

- Total users

- Online users

- Active chat requests

- Active conversations

- Reports

- Blocked users

Admin can:

- View users

- Suspend users

- Unsuspend users

- Review reports

Normal users must never access admin pages.

DESIGN

------

Use a modern social/chat application design.

Style:

- Clean

- Minimal

- Professional

- Friendly

- Mobile-first

- Rounded cards

- Clear online indicators

- Smooth transitions

- Good empty states

- Good loading states

Use a consistent design system throughout the application.

Do not make the design look like a generic admin dashboard.

IMPORTANT IMPLEMENTATION REQUIREMENT

------------------------------------

Build the actual functionality, not just UI screens.

Before considering the project complete, verify:

1. User can register.

2. User can login.

3. User can grant location permission.

4. User location is stored securely.

5. Nearby users within 1 km are returned.

6. Users outside 1 km are not returned.

7. Exact coordinates are never exposed.

8. User can send a chat request.

9. Receiver gets the request in realtime.

10. Receiver can accept/reject.

11. Accepted request creates a private conversation.

12. Both users can send realtime messages.

13. Messages persist after refresh.

14. Unread messages work.

15. Online/offline status works.

16. Blocking works.

17. Reporting works.

18. RLS prevents unauthorized access.

19. Mobile UI works.

20. Refreshing the browser does not break authentication or chat state.

SUPABASE SETUP

--------------

Create the SQL migrations required for:

- All tables

- Indexes

- Foreign keys

- Constraints

- RLS policies

- Functions/RPC

- Realtime configuration where required

Use UUID primary keys.

Use server-side timestamps.

Create appropriate indexes for geospatial and relational queries.

ENVIRONMENT VARIABLES

---------------------

Use environment variables for Supabase configuration.

Never hard-code secret keys.

Use:

VITE_SUPABASE_URL

VITE_SUPABASE_ANON_KEY

Do not put the Supabase service-role key in frontend code.

FINAL REQUIREMENT

-----------------

After implementing the application:

- Check all routes.

- Check authentication.

- Check database security.

- Check RLS policies.

- Check realtime subscriptions.

- Check location permissions.

- Check 1 km filtering.

- Check mobile responsiveness.

- Fix TypeScript errors.

- Fix console errors.

- Fix broken imports.

- Remove all mock/demo data.

- Make sure the project can be deployed.

Provide clear instructions for:

1. Creating the Supabase project.

2. Running the SQL migrations.

3. Setting environment variables.

4. Configuring authentication.

5. Configuring storage.

6. Deploying the application.

7. Testing two users on two different devices.

Do not stop at the UI. Implement the complete working Nearby Chat application.

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://sp125chat.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/f7aabbb4-ba70-40c0-8a8c-10d10487fccf).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
