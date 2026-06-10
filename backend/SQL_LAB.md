# SQL Lab — read-only SQL over MongoDB (DuckDB)

SQL Lab lets users run read-only `SELECT` queries against the target MongoDB
collections. Relevant collections are streamed into an in-memory DuckDB and the
SQL runs there, giving full SQL support (JOINs, CASE, UNION, window functions)
on top of MongoDB.

## How it works

1. `POST /api/query/sql` parses the SQL with `node-sql-parser` and **rejects
   anything that isn't a single `SELECT`** (writes, DDL, `;`-stacked
   statements). This is an AST check, not a regex.
2. The WHERE clause and referenced columns are extracted and **pushed down into
   MongoDB** as a `$match` + `$project`, so for large collections we only pull
   the rows/columns the query needs. The pushed `$match` is always a *superset*
   of the SQL filter (DuckDB re-applies the full WHERE), so results are exact.
3. The (pre-filtered) collection is **streamed** — never buffered — into a
   newline-delimited JSON temp file and loaded into DuckDB with the native
   `read_json_auto` reader. Node memory stays flat even at millions of rows.
4. DuckDB runs the original SQL. The interactive endpoint returns one **page**
   of rows (`page`/`pageSize`) plus the total `rowCount`.

Every Mongo read goes through the existing `mongoService`, so SQL Lab inherits
the same **tenant / row-level-security `$match`**, type coercion, and
hidden-field rules as the rest of the app.

### CSV export (`POST /api/query/export`)
Full-result exports run as **async jobs** (`SqlExport` collection). DuckDB writes
the entire result to a CSV under `backend/exports/` via `COPY … TO`, with no row
cap. The UI polls `GET /api/query/exports` and downloads via
`GET /api/query/exports/:id/download`.

## Security: create a dedicated read-only MongoDB user

The SELECT-only parser stops writes at the app layer; a read-only DB user makes
writes **physically impossible** as defense-in-depth. Note this does *not*
replace the tenant/RLS filter — that is what prevents cross-tenant reads.

Create a user with only the `read` role on the target data database:

```js
// mongosh, connected to the target cluster as an admin
use admin
db.createUser({
  user: "fyntrac_sql_ro",
  pwd: passwordPrompt(),          // or a strong generated secret
  roles: [
    { role: "read", db: "<TARGET_DATA_DB>" }   // read-only, single database
  ]
})
```

Then point the target connection at this user. The SQL engine reads through the
same `TARGET_MONGODB_URI` the rest of the data layer uses, so set it to the
read-only user's credentials:

```
TARGET_MONGODB_URI=mongodb+srv://fyntrac_sql_ro:<password>@<host>/<TARGET_DATA_DB>
```

> If other features need write access to the target DB, give SQL Lab its own
> connection string instead and read it in `duckdb.service.js` /
> `mongo.service.js`. As shipped, the target connection is already documented as
> read-only.

## Environment variables

| Variable | Default | Purpose |
| --- | --- | --- |
| `SQL_INTERACTIVE_SCAN_LIMIT` | `2000000` | Interactive `/sql` queries that would scan a single **unfiltered** collection larger than this return a "add a WHERE/LIMIT or use Export" error. Export has no such guard. |

## Maintenance

Generated CSVs accumulate under `backend/exports/` (git-ignored). Add a periodic
cleanup (e.g. delete files / `SqlExport` docs older than N days) when this goes
to production.
