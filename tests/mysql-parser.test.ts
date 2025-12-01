import { describe, it, expect } from 'vitest';
import { isSelectQuery } from '../src/mysql-parser';

describe('MySQL Parser', () => {
  describe('isSelectQuery', () => {
    it.each([
      // Basic SELECT queries
      ['SELECT * FROM users', true, 'simple SELECT query'],
      ['SELECT id, name FROM users', true, 'SELECT with specific columns'],
      ['SELECT * FROM users WHERE id = 1', true, 'SELECT with WHERE clause'],
      ['SELECT * FROM users ORDER BY name', true, 'SELECT with ORDER BY'],
      ['SELECT * FROM users LIMIT 10', true, 'SELECT with LIMIT'],
      [
        'SELECT * FROM users WHERE active = 1 ORDER BY name LIMIT 10',
        true,
        'SELECT with multiple clauses',
      ],
      ['select * from users', true, 'lowercase SELECT'],
      ['SeLeCt * FrOm UsErS', true, 'mixed case SELECT'],
      ['SELECT * FROM USERS', true, 'uppercase SELECT'],
      ['  SELECT   *   FROM   users   ', true, 'queries with extra whitespace'],
      ['SELECT *\nFROM users\nWHERE id = 1', true, 'queries with newlines'],
      ['SELECT\t*\tFROM\tusers', true, 'queries with tabs'],
      [
        'SELECT * FROM users -- This is a comment',
        true,
        'SELECT with single-line comment',
      ],
      [
        'SELECT * FROM users /* This is a comment */',
        true,
        'SELECT with multi-line comment',
      ],
      // Complex SELECT queries
      [
        'SELECT u.id, u.name FROM users u JOIN orders o ON u.id = o.user_id',
        true,
        'SELECT with JOIN',
      ],
      [
        'SELECT * FROM users u LEFT JOIN orders o ON u.id = o.user_id',
        true,
        'SELECT with LEFT JOIN',
      ],
      [
        'SELECT * FROM users WHERE id IN (SELECT user_id FROM orders)',
        true,
        'SELECT with subquery',
      ],
      [
        'SELECT COUNT(*) FROM users GROUP BY status',
        true,
        'SELECT with GROUP BY',
      ],
      [
        'SELECT status, COUNT(*) FROM users GROUP BY status HAVING COUNT(*) > 10',
        true,
        'SELECT with HAVING',
      ],
      [
        'SELECT * FROM users UNION SELECT * FROM admins',
        true,
        'SELECT with UNION',
      ],
      ['SELECT DISTINCT status FROM users', true, 'SELECT with DISTINCT'],
      [
        'SELECT AVG(price), MAX(price), MIN(price) FROM products',
        true,
        'SELECT with aggregate functions',
      ],

      // Non-SELECT queries
      [
        'INSERT INTO users (name, email) VALUES ("John", "john@example.com")',
        false,
        'INSERT query',
      ],
      ['UPDATE users SET name = "John" WHERE id = 1', false, 'UPDATE query'],
      ['DELETE FROM users WHERE id = 1', false, 'DELETE query'],
      [
        'CREATE TABLE users (id INT PRIMARY KEY, name VARCHAR(255))',
        false,
        'CREATE TABLE query',
      ],
      ['DROP TABLE users', false, 'DROP TABLE query'],
      [
        'ALTER TABLE users ADD COLUMN email VARCHAR(255)',
        false,
        'ALTER TABLE query',
      ],
      ['TRUNCATE TABLE users', false, 'TRUNCATE query'],
      [
        'REPLACE INTO users (id, name) VALUES (1, "John")',
        false,
        'REPLACE query',
      ],

      // Multiple statements
      [
        'SELECT * FROM users; SELECT * FROM orders',
        true,
        'multiple SELECT statements',
      ],
      [
        'SELECT * FROM users; INSERT INTO logs VALUES (1)',
        false,
        'mixed statements starting with SELECT',
      ],
      [
        'INSERT INTO users VALUES (1); SELECT * FROM users',
        false,
        'mixed statements starting with non-SELECT',
      ],
      [
        'INSERT INTO users VALUES (1); UPDATE users SET name = "John"',
        false,
        'multiple non-SELECT statements',
      ],
    ])('should return %s for %s', (sql, expected) => {
      expect(isSelectQuery(sql)).toBe(expected);
    });
  });
});
