// Parable's tables live in the `parable` schema of the shared Covenant Works
// Supabase project (Ledger's are in `ledger`), so every client is pointed
// at it and .from()/.rpc() calls stay unqualified.
export const DB_SCHEMA = 'parable' as const
