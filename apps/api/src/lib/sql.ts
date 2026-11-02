import { sql, type SQL } from "drizzle-orm";

/**
 * A fully qualified column reference, for use inside correlated subqueries.
 *
 * Drizzle renders a bare column as `"dept_id"` with no table prefix. Inside a
 * subquery that reads another table, the unqualified name binds to the subquery's
 * own table, so a correlation like "tasks belonging to this project" silently
 * compares a column to itself and counts everything. Writing the table name
 * explicitly is the only way to say which table is meant.
 */
export function cref(table: string, column: string): SQL {
  return sql`${sql.identifier(table)}.${sql.identifier(column)}`;
}

/** The table name as an identifier, for `from` clauses inside a raw fragment. */
export function tref(table: string): SQL {
  return sql`${sql.identifier(table)}`;
}

/**
 * A correlated count. Kept as one helper because this pattern appears in almost
 * every list query, and getting it wrong is invisible: the query succeeds and the
 * number is zero.
 */
export function countWhere(
  countTable: string,
  alias: string,
  matchColumns: { inner: string; outer: string },
  extra?: SQL,
): SQL<number> {
  const match = sql`${cref(alias, matchColumns.inner)} = ${cref(countTable, matchColumns.outer)}`;
  return sql<number>`(
    select count(*)::int from ${sql.identifier(alias)}
    where ${match}${extra ? sql` and ${extra}` : sql``}
  )`;
}
