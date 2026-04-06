/**
 * SQL Parser - Node.js port of the Python SQLToMongoDBConverter
 * Handles CREATE TABLE and INSERT statements
 */

function mysqlToMongoType(mysqlType) {
  const typeMapping = {
    INT: 'Number (Int32)', BIGINT: 'Number (Int64)', TINYINT: 'Number (Int32)',
    SMALLINT: 'Number (Int32)', MEDIUMINT: 'Number (Int32)',
    DECIMAL: 'Number (Decimal128)', NUMERIC: 'Number (Decimal128)',
    FLOAT: 'Number (Double)', DOUBLE: 'Number (Double)',
    VARCHAR: 'String', CHAR: 'String', TEXT: 'String',
    MEDIUMTEXT: 'String', LONGTEXT: 'String', TINYTEXT: 'String',
    DATE: 'Date', DATETIME: 'Date', TIMESTAMP: 'Date', TIME: 'String', YEAR: 'Number (Int32)',
    BLOB: 'Binary', MEDIUMBLOB: 'Binary', LONGBLOB: 'Binary', TINYBLOB: 'Binary',
    ENUM: 'String', SET: 'Array', JSON: 'Object',
    BOOLEAN: 'Boolean', BOOL: 'Boolean',
  };
  return typeMapping[mysqlType.toUpperCase()] || 'Mixed';
}

function parseCreateTable(createStatement) {
  const tableNameMatch = createStatement.match(
    /CREATE TABLE\s+(?:IF NOT EXISTS\s+)?`?(\w+)`?\s*\(/i
  );
  if (!tableNameMatch) return { tableName: null, columns: [] };

  const tableName = tableNameMatch[1];
  const contentMatch = createStatement.match(/\((.*)\)\s*(?:ENGINE|;)/is);
  if (!contentMatch) return { tableName, columns: [] };

  const content = contentMatch[1];
  const columns = [];

  for (const line of content.split('\n')) {
    const trimmed = line.trim().replace(/,$/, '');
    if (!trimmed || /^\s*(PRIMARY|UNIQUE|KEY|CONSTRAINT|FOREIGN|INDEX)/i.test(trimmed)) continue;

    const colMatch = trimmed.match(/`?(\w+)`?\s+(\w+)(\([^)]+\))?\s*(.*)/);
    if (colMatch) {
      const colName = colMatch[1];
      const colType = colMatch[2];
      const colSize = colMatch[3] || '';
      const colAttrs = colMatch[4] || '';

      const notNull = /NOT NULL/i.test(colAttrs);

      let defaultVal = null;
      const defaultMatch = colAttrs.match(/DEFAULT\s+[']?([^',\s]+)[']?/i);
      if (defaultMatch) defaultVal = defaultMatch[1];

      columns.push({
        name: colName,
        mysql_type: `${colType}${colSize}`,
        mongo_type: mysqlToMongoType(colType),
        not_null: notNull,
        default: defaultVal,
        attributes: colAttrs.trim(),
      });
    }
  }

  return { tableName, columns };
}

function convertValue(value) {
  value = value.trim();

  if (value.toUpperCase() === 'NULL') return null;

  if (value.startsWith("'") && value.endsWith("'")) {
    let unquoted = value.slice(1, -1);
    unquoted = unquoted.replace(/\\'/g, "'");
    unquoted = unquoted.replace(/\\\\/g, '\\');
    unquoted = unquoted.replace(/\\r/g, '\r');
    unquoted = unquoted.replace(/\\n/g, '\n');
    unquoted = unquoted.replace(/\\t/g, '\t');
    return unquoted;
  }

  if (value !== '' && !isNaN(value)) {
    return value.includes('.') ? parseFloat(value) : parseInt(value, 10);
  }

  if (value.toUpperCase() === 'TRUE') return true;
  if (value.toUpperCase() === 'FALSE') return false;

  return value;
}

function parseValues(valueStr) {
  const values = [];
  let current = '';
  let inString = false;
  let escape = false;
  let depth = 0;

  for (const c of valueStr) {
    if (escape) {
      current += c;
      escape = false;
    } else if (c === '\\') {
      current += c;
      escape = true;
    } else if (c === "'" && depth === 0) {
      inString = !inString;
      current += c;
    } else if (c === '(' && !inString) {
      depth++;
      current += c;
    } else if (c === ')' && !inString) {
      depth--;
      current += c;
    } else if (c === ',' && !inString && depth === 0) {
      values.push(convertValue(current.trim()));
      current = '';
    } else {
      current += c;
    }
  }

  if (current.trim()) values.push(convertValue(current.trim()));

  return values;
}

function parseValueTuples(valuesSection, columns) {
  const documents = [];
  let i = 0;

  while (i < valuesSection.length) {
    while (i < valuesSection.length && ' \t\n\r,'.includes(valuesSection[i])) i++;
    if (i >= valuesSection.length) break;

    if (valuesSection[i] === '(') {
      let depth = 1;
      const start = i + 1;
      i++;
      let inString = false;
      let escape = false;

      while (i < valuesSection.length && depth > 0) {
        const c = valuesSection[i];
        if (escape) {
          escape = false;
        } else if (c === '\\') {
          escape = true;
        } else if (c === "'" && !escape) {
          inString = !inString;
        } else if (!inString) {
          if (c === '(') depth++;
          else if (c === ')') depth--;
        }
        i++;
      }

      const valueStr = valuesSection.slice(start, i - 1);
      const values = parseValues(valueStr);

      if (values.length === columns.length) {
        const doc = {};
        columns.forEach((col, idx) => { doc[col] = values[idx]; });
        documents.push(doc);
      }
    } else {
      i++;
    }
  }

  return documents;
}

function parseInsertStatement(statement) {
  const tableMatch = statement.match(/INSERT\s+(?:INTO\s+)?`?(\w+)`?\s*\(/i);
  if (!tableMatch) return { tableName: null, columns: null, documents: [] };

  const tableName = tableMatch[1];

  const columnsMatch = statement.match(/\(([^)]+)\)\s+VALUES/i);
  if (!columnsMatch) return { tableName, columns: null, documents: [] };

  const columns = columnsMatch[1].split(',').map(col => col.trim().replace(/`/g, ''));

  const valuesMatch = statement.match(/VALUES\s+(.+)/is);
  if (!valuesMatch) return { tableName, columns, documents: [] };

  const valuesSection = valuesMatch[1].replace(/;$/, '').trim();
  const documents = parseValueTuples(valuesSection, columns);

  return { tableName, columns, documents };
}

module.exports = { parseCreateTable, parseInsertStatement };
