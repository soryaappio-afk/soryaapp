# Database Operations (Prisma + MySQL)

This guide lists the common commands to wipe, recreate, migrate, and inspect the database for this project.

## 1. Prerequisites
1. Ensure `.env` has a valid `DATABASE_URL`, e.g.
   ```bash
   DATABASE_URL="mysql://user:password@localhost:3306/sorya"
   ```
2. Install dependencies (first time):
   ```bash
   npm install
   ```
3. (Optional) Start local MySQL with Docker (adapt credentials to your `.env`):
   ```bash
   docker run --name sorya-mysql -e MYSQL_ROOT_PASSWORD=root -e MYSQL_DATABASE=sorya -p 3306:3306 -d mysql:8
   ```

## 2. Generate Prisma Client (after schema changes)
```bash
npx prisma generate
```

## 3. Create & Apply a Migration (normal dev workflow)
After editing `prisma/schema.prisma`:
```bash
npx prisma migrate dev --name <meaningful_migration_name>
```
This:
- Validates schema
- Creates `prisma/migrations/<timestamp>_<name>`
- Applies migration to the dev database
- Regenerates Prisma Client

## 4. Destructive Reset (WIPE + Recreate Schema)
Use when the dev schema diverged or you want a clean slate. This DROPS all data.
```bash
npx prisma migrate reset
```
Non‑interactive (auto-confirm):
```bash
npx prisma migrate reset --force
```
This runs (in order):
1. Drop all tables
2. Recreate schema from migrations
3. (Optional) Seed script if configured
4. Regenerate client

## 5. Apply Schema Without Creating a Migration (NOT preferred)
Useful for quick prototyping only. Does NOT create migration files.
```bash
npx prisma db push
```
Then regenerate client if needed:
```bash
npx prisma generate
```

## 6. Open Prisma Studio (DB Browser)
```bash
npx prisma studio
```

## 7. Verify Migrations Status
```bash
npx prisma migrate status
```

## 8. Typical Dev Loop Example
```bash
# 1. Edit prisma/schema.prisma
# 2. Create migration
npx prisma migrate dev --name add_credit_ledger_and_related
# 3. Run the app
npm run dev
```
If something broke badly and you just want a clean database:
```bash
npx prisma migrate reset --force
npm run dev
```

## 9. Adding a New Model Checklist
1. Edit `prisma/schema.prisma` (add model + relations + back-relations).
2. Run: `npx prisma format` (optional but keeps style consistent).
3. Run: `npx prisma migrate dev --name add_<model_name>`
4. Update application code to use the model.
5. (Optional) Seed initial rows via a seed script.

## 10. Seeding (If Implemented Later)
If a `prisma/seed.ts` is added and configured in `package.json`:
```bash
npx prisma db seed
```
`migrate reset` will call it automatically.

## 11. Troubleshooting
| Problem | Cause | Fix |
|---------|-------|-----|
| `Relation field ... missing opposite relation` | Missing back-relation property | Add the array/back pointer on the referenced model |
| `Foreign key constraint failed on the field: userId` | Inserting child row for non-existent user (DB reset) | Recreate user (login/register) before ledger insert |
| `Cannot read properties of undefined (reading 'findFirst')` | Prisma client not regenerated after schema change | Run `npx prisma generate` or a migration command |
| Hanging migrate dev after schema edits | Edits not represented by a new migration | Use `migrate reset` or create a new migration |

## 12. Production Notes (Future)
- Use `prisma migrate deploy` during CI/CD (applies pending migrations without creating new ones):
  ```bash
  npx prisma migrate deploy
  ```
- Never run `migrate reset` in production.
- Back up the database before major schema refactors.

---
Happy building! Keep schema changes incremental and always create proper migrations for team reproducibility.
