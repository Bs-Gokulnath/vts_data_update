const express = require('express');
const multer = require('multer');
const cors = require('cors');
const path = require('path');
const fs = require('fs');
const readline = require('readline');
const { MongoClient } = require('mongodb');
const { parseCreateTable, parseInsertStatement } = require('./sqlParser');

require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 3001;
const MONGO_URI = process.env.MONGO_URI;
const DB_NAME = process.env.DB_NAME || 'vts2020';

app.use(cors());
app.use(express.json());

// Uploads temp folder
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) fs.mkdirSync(uploadDir, { recursive: true });

const storage = multer.diskStorage({
  destination: uploadDir,
  filename: (req, file, cb) => {
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(null, `${unique}-${file.originalname}`);
  },
});

const upload = multer({
  storage,
  fileFilter: (req, file, cb) => {
    if (file.originalname.toLowerCase().endsWith('.sql')) cb(null, true);
    else cb(new Error('Only .sql files are allowed'));
  },
});

// In-memory job store
const jobs = new Map();

// POST /api/upload — save files, return job IDs
app.post('/api/upload', upload.array('files'), (req, res) => {
  if (!req.files || req.files.length === 0) {
    return res.status(400).json({ error: 'No files uploaded' });
  }

  const result = req.files.map(file => {
    const jobId = `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    jobs.set(jobId, {
      status: 'pending',
      fileName: file.originalname,
      filePath: file.path,
      fileSize: file.size,
    });
    return { jobId, fileName: file.originalname, fileSize: file.size };
  });

  res.json({ jobs: result });
});

// GET /api/process/:jobId — SSE stream for live processing
app.get('/api/process/:jobId', async (req, res) => {
  const { jobId } = req.params;
  const job = jobs.get(jobId);

  if (!job) return res.status(404).json({ error: 'Job not found' });
  if (job.status === 'processing') {
    return res.status(409).json({ error: 'Job already running' });
  }

  // SSE setup
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();

  const send = (type, data) => {
    res.write(`data: ${JSON.stringify({ type, ...data })}\n\n`);
  };

  job.status = 'processing';

  try {
    send('log', { message: `Starting: ${job.fileName}`, level: 'info' });
    send('log', { message: `Connecting to MongoDB...`, level: 'info' });

    const client = new MongoClient(MONGO_URI);
    await client.connect();
    const db = client.db(DB_NAME);

    send('log', { message: `Connected to MongoDB`, level: 'success' });
    send('log', { message: `Database: ${DB_NAME}`, level: 'success' });

    const schemas = {};
    let lineCount = 0;
    let tableCount = 0;
    let insertCount = 0;
    let totalDocs = 0;
    let currentStatement = '';
    let statementType = null;

    const rl = readline.createInterface({
      input: fs.createReadStream(job.filePath, { encoding: 'utf8' }),
      crlfDelay: Infinity,
    });

    for await (const line of rl) {
      lineCount++;

      if (lineCount % 50000 === 0) {
        send('progress', { lineCount, tableCount, insertCount, totalDocs });
        send('log', {
          message: `Line ${lineCount.toLocaleString()} — Tables: ${tableCount}, Docs: ${totalDocs.toLocaleString()}`,
          level: 'info',
        });
      }

      const stripped = line.trim();

      // Skip comments and empty lines
      if (
        !stripped ||
        stripped.startsWith('--') ||
        stripped.startsWith('/*') ||
        stripped.startsWith('*') ||
        stripped.startsWith('/*!') ||
        stripped.startsWith('#')
      ) {
        continue;
      }

      if (statementType === null) {
        if (/^CREATE TABLE/i.test(stripped)) {
          statementType = 'CREATE';
          currentStatement = line + '\n';
        } else if (/^INSERT/i.test(stripped)) {
          statementType = 'INSERT';
          currentStatement = line + '\n';
        }
      } else {
        currentStatement += line + '\n';
      }

      if (line.includes(';')) {
        if (statementType === 'CREATE') {
          const { tableName, columns } = parseCreateTable(currentStatement);
          if (tableName && columns.length > 0) {
            schemas[tableName] = { columns, document_count: 0 };
            tableCount++;
            send('log', {
              message: `Schema: ${tableName} (${columns.length} fields)`,
              level: 'success',
            });
          }
        } else if (statementType === 'INSERT') {
          const { tableName, documents } = parseInsertStatement(currentStatement);
          if (tableName && documents.length > 0) {
            try {
              await db.collection(tableName).insertMany(documents, { ordered: false });
              if (schemas[tableName]) schemas[tableName].document_count += documents.length;
              insertCount++;
              totalDocs += documents.length;
              const total = schemas[tableName]?.document_count || documents.length;
              send('log', {
                message: `${tableName}: +${documents.length} docs (total: ${total.toLocaleString()})`,
                level: 'success',
              });
            } catch (err) {
              const msg = err.message || '';
              // Ignore bulk write partial errors (duplicate keys etc), still count written
              if (err.result) {
                const inserted = err.result.nInserted || 0;
                if (schemas[tableName]) schemas[tableName].document_count += inserted;
                totalDocs += inserted;
              }
              send('log', {
                message: `Warning ${tableName}: ${msg.slice(0, 120)}`,
                level: 'warn',
              });
            }
          }
        }

        currentStatement = '';
        statementType = null;
      }
    }

    const summary = {
      fileName: job.fileName,
      lineCount,
      tableCount,
      totalDocs,
      insertCount,
      database: DB_NAME,
      collections: Object.entries(schemas).map(([name, s]) => ({
        name,
        fields: s.columns.length,
        documents: s.document_count,
      })),
    };

    job.status = 'completed';
    job.summary = summary;

    send('log', { message: `Processed ${lineCount.toLocaleString()} lines`, level: 'success' });
    send('log', { message: `Created/updated ${tableCount} collections`, level: 'success' });
    send('log', { message: `Inserted ${totalDocs.toLocaleString()} total documents`, level: 'success' });
    send('complete', { summary });

    await client.close();
  } catch (err) {
    job.status = 'error';
    send('log', { message: `Error: ${err.message}`, level: 'error' });
    send('error', { message: err.message });
  } finally {
    // Cleanup temp file
    if (job.filePath && fs.existsSync(job.filePath)) {
      fs.unlink(job.filePath, () => {});
    }
    res.end();
  }
});

// GET /api/health
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', db: DB_NAME });
});

app.listen(PORT, () => {
  console.log(`VTS Data Update Server running on http://localhost:${PORT}`);
  console.log(`MongoDB: ${MONGO_URI}`);
  console.log(`Database: ${DB_NAME}`);
});
