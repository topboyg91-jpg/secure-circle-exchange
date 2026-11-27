# Telegram escrow alerts

## What will change

- Add a Telegram destination setting to the existing admin Settings area, plus a test-alert action.
- Send alerts for trade creation, seller responses, admin-confirmed funding, delivery, release, withdrawal requests, and disputes.
- Keep the Telegram credential on the server and route messages through the already linked Telegram connection.
- Validate alert requests against the current trade state and deduplicate events so retries do not spam the admin.

## What will stay the same

- The existing trade pages, escrow actions, database business rules, and hosting setup remain unchanged.
- The shared `Seamless Entry` project will not be modified; its source is an event-ticketing app, not the bot.

## Technical approach

- Add a server-side Cloud function for Telegram sends and call it from the existing trade/admin actions.
- Store the destination in the existing admin-managed settings table; add only the minimal event-deduplication support needed.
- Keep all bot credentials out of browser code and never automate custody, deposit confirmation, or payouts.
- Validate the changed flows, function response, and current preview logs.