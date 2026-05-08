// SQL fed to the parser or the postgres protocol handler may carry literal
// credentials (CREATE USER ... PASSWORD '...', ALTER USER ... IDENTIFIED BY ...).
// Mask them before they reach debug logs.
export function redactSql(sql: string | undefined): string {
  if (!sql) return '';
  return sql.replace(
    /\b(PASSWORD|IDENTIFIED\s+BY|IDENTIFIED\s+WITH\s+\S+\s+AS)\s+('([^']|'')*'|"([^"]|"")*"|\S+)/gi,
    '$1 ***'
  );
}
