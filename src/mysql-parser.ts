import { Parser } from 'node-sql-parser';

const parser = new Parser();
export function isSelectQuery(sql: string): boolean {
  const ast = parser.astify(sql);

  // only return true if the entire query is a select
  if (Array.isArray(ast)) {
    return ast.every((ast) => ast.type === 'select');
  }

  return ast.type === 'select';
}
