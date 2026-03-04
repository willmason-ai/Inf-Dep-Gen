// ============================================================================
// Infrastructure Deployment Generator — Excel Import API
// ============================================================================
// POST /api/import/preview  — Upload .xlsx, parse, return diff report
// POST /api/import/apply    — Accept confirmed changes, update Cosmos DB
// ============================================================================

import { Router } from 'express';
import multer from 'multer';
import { v4 as uuidv4 } from 'uuid';
import { parseExcelFile } from '../services/excel-parser.js';
import { compareSpecs, applyChangesToSpec } from '../services/spec-comparator.js';
import { getContainer } from '../config/cosmos.js';
import config from '../config/index.js';

const router = Router();

// Multer — memory storage, single .xlsx file, max 10MB
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = [
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'application/vnd.ms-excel',
    ];
    if (allowed.includes(file.mimetype) || file.originalname.endsWith('.xlsx') || file.originalname.endsWith('.xls')) {
      cb(null, true);
    } else {
      cb(new Error('Only .xlsx and .xls files are accepted'));
    }
  },
});

// ---------------------------------------------------------------------------
// Load all current specs from Cosmos DB (or fallback to file parser)
// ---------------------------------------------------------------------------
async function loadCurrentSpecs() {
  const container = getContainer(config.cosmos.containers.serverSpecs);
  if (container) {
    try {
      const { resources } = await container.items
        .query('SELECT * FROM c')
        .fetchAll();
      return resources;
    } catch (err) {
      console.warn('[Import] Failed to query Cosmos DB:', err.message);
    }
  }

  // Fallback to file-based parsing
  const { parseAllSpecs } = await import('../services/spec-parser.js');
  return parseAllSpecs();
}

// ---------------------------------------------------------------------------
// POST /api/import/preview — Upload and preview changes
// ---------------------------------------------------------------------------
router.post('/preview', upload.single('file'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No file uploaded. Please select an .xlsx file.',
      });
    }

    console.log(`[Import] Parsing uploaded file: ${req.file.originalname} (${req.file.size} bytes)`);

    // Parse the Excel file
    const parsed = parseExcelFile(req.file.buffer);
    console.log(`[Import] Parsed ${parsed.serverCount} servers from Excel`);

    if (parsed.serverCount === 0) {
      return res.status(400).json({
        error: 'Parse Error',
        message: 'No servers found in the uploaded Excel file. Ensure it contains Compute and Storage BOM sheets.',
        sheetNames: parsed.sheetNames,
      });
    }

    // Load current specs
    const currentSpecs = await loadCurrentSpecs();
    console.log(`[Import] Loaded ${currentSpecs.length} current specs for comparison`);

    // Compare
    const report = compareSpecs(parsed.servers, currentSpecs);

    res.json({
      fileName: req.file.originalname,
      fileSize: req.file.size,
      sheetsFound: parsed.sheetNames,
      parseWarnings: parsed.parseWarnings,
      report,
    });
  } catch (err) {
    if (err.message?.includes('Only .xlsx')) {
      return res.status(400).json({ error: 'Bad Request', message: err.message });
    }
    next(err);
  }
});

// ---------------------------------------------------------------------------
// POST /api/import/apply — Apply confirmed changes
// ---------------------------------------------------------------------------
router.post('/apply', async (req, res, next) => {
  try {
    const { changes } = req.body;

    if (!changes || !Array.isArray(changes) || changes.length === 0) {
      return res.status(400).json({
        error: 'Bad Request',
        message: 'No changes provided. Send an array of { hostname, changes } objects.',
      });
    }

    const container = getContainer(config.cosmos.containers.serverSpecs);
    if (!container) {
      return res.status(503).json({
        error: 'Service Unavailable',
        message: 'Cosmos DB is not available. Cannot apply changes.',
      });
    }

    const results = [];
    const auditContainer = getContainer(config.cosmos.containers.auditLog);

    for (const serverChange of changes) {
      const { hostname, changes: fieldChanges } = serverChange;
      if (!hostname || !fieldChanges || fieldChanges.length === 0) continue;

      try {
        // Load current spec
        const { resource: currentSpec } = await container.item(hostname, hostname).read();
        if (!currentSpec) {
          results.push({ hostname, status: 'error', message: 'Server spec not found' });
          continue;
        }

        // Apply changes
        const updatedSpec = applyChangesToSpec(currentSpec, fieldChanges);
        await container.items.upsert(updatedSpec);

        results.push({
          hostname,
          status: 'updated',
          changesApplied: fieldChanges.length,
        });

        // Audit log
        if (auditContainer) {
          try {
            await auditContainer.items.create({
              id: uuidv4(),
              date: new Date().toISOString().split('T')[0],
              timestamp: new Date().toISOString(),
              method: 'IMPORT',
              path: '/api/import/apply',
              fullUrl: '/api/import/apply',
              statusCode: 200,
              duration: '0ms',
              environment: config.environment,
              requestSummary: {
                action: 'excel_import',
                hostname,
                changesApplied: fieldChanges.length,
                fields: fieldChanges.map(c => c.field),
                user: req.user?.username || 'unknown',
              },
            });
          } catch (err) {
            console.warn('[Import] Failed to write audit log:', err.message);
          }
        }
      } catch (err) {
        results.push({ hostname, status: 'error', message: err.message });
      }
    }

    res.json({
      message: 'Import complete',
      results,
      totalUpdated: results.filter(r => r.status === 'updated').length,
      totalErrors: results.filter(r => r.status === 'error').length,
    });
  } catch (err) {
    next(err);
  }
});

export default router;
