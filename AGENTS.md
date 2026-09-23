# Project instructions

- This is a Telegram food delivery bot using Node.js, Telegraf, and PostgreSQL.
- Keep Telegram handlers, business logic, and database queries in separate modules.
- Keep restaurant-specific data scoped by `RESTAURANT_ID` so more restaurants can be added later.
- Never commit bot tokens, database passwords, or other secrets. Use environment variables.
- Use parameterized PostgreSQL queries and transactions for multi-step writes.
- Explain implementation changes in Russian unless the user asks for another language.
