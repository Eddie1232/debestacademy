'use strict';

const MAX_CSV_BYTES = 2 * 1024 * 1024;
const SECTIONS = new Set(['KG', 'Primary', 'JHS']);
const TERMS = new Set(['Term 1', 'Term 2', 'Term 3']);
let pool;

function getPool() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is not configured. Set it in .env and run sql-academic-schema.sql.');
  if (!pool) {
    let Pool;
    try { ({ Pool } = require('pg')); } catch (_) { throw new Error('PostgreSQL driver is missing. Run npm install.'); }
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  }
  return pool;
}

function parseCsv(input) {
  const rows = []; let row = []; let field = ''; let quoted = false;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (quoted) {
      if (ch === '"' && input[i + 1] === '"') { field += '"'; i++; }
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"' && field.length === 0) quoted = true;
    else if (ch === ',') { row.push(field.trim()); field = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && input[i + 1] === '\n') i++;
      row.push(field.trim()); field = '';
      if (row.some((v) => v !== '')) rows.push(row);
      row = [];
    } else field += ch;
  }
  if (quoted) throw new Error('CSV contains an unclosed quoted field.');
  if (field.length || row.length) { row.push(field.trim()); if (row.some((v) => v !== '')) rows.push(row); }
  if (rows.length < 2) throw new Error('CSV must contain a header and at least one data row.');
  const headers = rows.shift().map((v) => v.toLowerCase().replace(/[\s-]+/g, '_'));
  if (new Set(headers).size !== headers.length) throw new Error('CSV contains duplicate column names.');
  return rows.map((values, i) => {
    const out = {};
    headers.forEach((h, j) => { out[h] = (values[j] || '').trim(); });
    out.__row = i + 2;
    return out;
  });
}


function decodeXml(value) {
  return String(value || '').replace(/&amp;/g,'&').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&apos;/g,"'");
}
function xlsxEntries(buffer) {
  const zlib = require('zlib');
  const signature = Buffer.from([0x50,0x4b,0x05,0x06]);
  const eocd = buffer.lastIndexOf(signature);
  if (eocd < 0 || eocd + 22 > buffer.length) throw new Error('Invalid XLSX workbook.');
  const count = buffer.readUInt16LE(eocd + 10);
  let offset = buffer.readUInt32LE(eocd + 16);
  const entries = {};
  for (let i=0; i<count; i++) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error('Invalid XLSX directory.');
    const method=buffer.readUInt16LE(offset+10), compressed=buffer.readUInt32LE(offset+20);
    const nameLen=buffer.readUInt16LE(offset+28), extraLen=buffer.readUInt16LE(offset+30), commentLen=buffer.readUInt16LE(offset+32);
    const localOffset=buffer.readUInt32LE(offset+42);
    const name=buffer.toString('utf8',offset+46,offset+46+nameLen);
    const localName=buffer.readUInt16LE(localOffset+26), localExtra=buffer.readUInt16LE(localOffset+28);
    const dataStart=localOffset+30+localName+localExtra;
    const compressedData=buffer.subarray(dataStart,dataStart+compressed);
    if (method===0) entries[name]=Buffer.from(compressedData);
    else if (method===8) entries[name]=zlib.inflateRawSync(compressedData);
    else throw new Error('XLSX uses an unsupported compression method.');
    offset += 46+nameLen+extraLen+commentLen;
  }
  return entries;
}
function parseXlsxBase64(encoded) {
  if (typeof encoded!=='string' || !encoded || encoded.length>Math.ceil(MAX_CSV_BYTES*4/3)+16) throw new Error('XLSX file must be no larger than 2 MB.');
  const buffer=Buffer.from(encoded,'base64');
  if (buffer.length>MAX_CSV_BYTES) throw new Error('XLSX file must be no larger than 2 MB.');
  const entries=xlsxEntries(buffer);
  const sheet=entries['xl/worksheets/sheet1.xml'];
  if (!sheet) throw new Error('Could not find the first worksheet in this Excel workbook.');
  let shared=[];
  if(entries['xl/sharedStrings.xml']) {
    const xml=entries['xl/sharedStrings.xml'].toString('utf8');
    shared=[...xml.matchAll(/<si(?:\s[^>]*)?>([\s\S]*?)<\/si>/g)].map(m=>[...m[1].matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>decodeXml(t[1])).join(''));
  }
  const xml=sheet.toString('utf8'), grid=[];
  const colIndex=ref=>{const letters=(ref.match(/^[A-Z]+/)||['A'])[0];let n=0;for(const c of letters)n=n*26+c.charCodeAt(0)-64;return n-1;};
  for(const rm of xml.matchAll(/<row(?:\s[^>]*)?>([\s\S]*?)<\/row>/g)) {
    const row=[];
    for(const cm of rm[1].matchAll(/<c\b([^>]*)>([\s\S]*?)<\/c>/g)) {
      const attrs=cm[1], body=cm[2], ref=(attrs.match(/\br="([^"]+)"/)||[])[1]||'A1';
      const type=(attrs.match(/\bt="([^"]+)"/)||[])[1]||'';
      const vm=(body.match(/<v(?:\s[^>]*)?>([\s\S]*?)<\/v>/)||[])[1];
      let value='';
      if(type==='s' && vm!==undefined) value=shared[Number(vm)]||'';
      else if(type==='inlineStr') value=[...body.matchAll(/<t(?:\s[^>]*)?>([\s\S]*?)<\/t>/g)].map(t=>decodeXml(t[1])).join('');
      else if(vm!==undefined) value=decodeXml(vm);
      row[colIndex(ref)]=String(value);
    }
    grid.push(row.map(v=>v===undefined?'':v));
  }
  while(grid.length && grid[grid.length-1].every(v=>!String(v).trim())) grid.pop();
  if(grid.length<2) throw new Error('Excel worksheet must contain a header and at least one data row.');
  const csvEscape=v=>{const value=String(v??'');return /[",\r\n]/.test(value)?'"'+value.replace(/"/g,'""')+'"':value;};
  return parseCsv(grid.map(row=>row.map(csvEscape).join(',')).join('\n'));
}
function uploadedRows(body) {
  if (body.fileType==='xlsx') return parseXlsxBase64(body.xlsxBase64);
  const csv=typeof body.csv==='string'?body.csv:'';
  if(!csv || Buffer.byteLength(csv,'utf8')>MAX_CSV_BYTES) throw new Error('Provide a CSV file no larger than 2 MB.');
  return parseCsv(csv);
}

function validateRows(rows, defaults) {
  const valid = []; const errors = []; const seen = new Set();
  for (const r of rows) {
    const section = r.school_section || r.section || defaults.section;
    const term = r.term || defaults.term;
    const year = r.academic_year || r.year || defaults.academicYear;
    const score = Number(r.score);
    const maxScore = r.max_score === undefined || r.max_score === '' ? 100 : Number(r.max_score);
    const missing = ['student_id', 'student_name', 'subject', 'score'].filter((k) => !r[k]);
    let message = '';
    if (missing.length) message = 'Missing required value(s): ' + missing.join(', ');
    else if (!SECTIONS.has(section)) message = 'school_section must be KG, Primary, or JHS.';
    else if (!TERMS.has(term)) message = 'term must be Term 1, Term 2, or Term 3.';
    else if (!year || year.length > 20) message = 'academic_year is required and must be at most 20 characters.';
    else if (section !== defaults.section || term !== defaults.term || year !== defaults.academicYear) message = 'Row section, term, and academic year must match the selected import settings.';
    else if (!Number.isFinite(score) || !Number.isFinite(maxScore) || maxScore <= 0 || score < 0 || score > maxScore) message = 'score must be between 0 and max_score.';
    if (!message) {
      const key = [r.student_id.trim().toLowerCase(), year, term, r.subject.trim().toLowerCase()].join('|');
      if (seen.has(key)) message = 'Duplicate student, year, term, and subject combination.';
      else seen.add(key);
    }
    if (message) errors.push({ row: r.__row, message });
    else valid.push({
      studentId: r.student_id.slice(0, 80), studentName: r.student_name.slice(0, 160),
      section, className: (r.class_name || r.class || '').slice(0, 80),
      academicYear: year, term, subject: r.subject.slice(0, 120), score, maxScore
    });
  }
  return { valid, errors };
}

function registerAcademicRoutes(app, { authRequired, adminIpAllowed, schoolStaffRequired, roleRequired }) {
  const secure = [authRequired, adminIpAllowed, schoolStaffRequired];

  app.get('/api/academic/status', ...secure, async (_req, res) => {
    try { await getPool().query('SELECT 1'); return res.json({ configured: true, connected: true }); }
    catch (e) { return res.status(503).json({ configured: Boolean(process.env.DATABASE_URL), connected: false, error: e.message }); }
  });


  app.post('/api/academic/preview-import', ...secure, roleRequired('Manager', 'Headmaster'), async (req,res) => {
    const body=req.body||{};
    const defaults={section:body.section,term:body.term,academicYear:body.academicYear};
    if(!SECTIONS.has(defaults.section)||!TERMS.has(defaults.term)||!defaults.academicYear) return res.status(400).json({error:'Select a valid section, term, and academic year.'});
    try {
      const rows=uploadedRows(body);
      const checked=validateRows(rows,defaults);
      return res.json({rowCount:rows.length,validRows:checked.valid.length,errors:checked.errors,preview:checked.valid.slice(0,10)});
    } catch(e) { return res.status(400).json({error:e.message}); }
  });

  app.post('/api/academic/import-csv', ...secure, roleRequired('Manager', 'Headmaster'), async (req, res) => {
    const body = req.body || {};
    const csv = typeof body.csv === 'string' ? body.csv : '';
    if (body.fileType !== 'xlsx' && (!csv || Buffer.byteLength(csv, 'utf8') > MAX_CSV_BYTES)) return res.status(400).json({ error: 'Provide a CSV file no larger than 2 MB.' });
    const defaults = { section: body.section, term: body.term, academicYear: body.academicYear };
    if (!SECTIONS.has(defaults.section) || !TERMS.has(defaults.term) || !defaults.academicYear) return res.status(400).json({ error: 'Select a valid section, term, and academic year.' });
    let rows;
    try { rows = uploadedRows(body); } catch (e) { return res.status(400).json({ error: e.message }); }
    const { valid, errors } = validateRows(rows, defaults);
    if (errors.length) return res.status(422).json({ error: 'Validation failed; no records were imported.', errors, validRows: valid.length });
    let client;
    try {
      client = await getPool().connect();
      await client.query('BEGIN');
      const batch = await client.query(
        `INSERT INTO academic_import_batches (imported_by,file_name,school_section,academic_year,term,row_count,status)
         VALUES ($1,$2,$3,$4,$5,$6,'processing') RETURNING id`,
        [String(req.user.username || req.user.sub || 'staff').slice(0,120), String(body.fileName || 'uploaded.csv').slice(0,200), defaults.section, defaults.academicYear, defaults.term, valid.length]
      );
      const batchId = batch.rows[0].id;
      for (const r of valid) {
        await client.query(
          `INSERT INTO academic_students (student_id,full_name,school_section,class_name) VALUES ($1,$2,$3,$4)
           ON CONFLICT (student_id) DO UPDATE SET full_name=EXCLUDED.full_name, school_section=EXCLUDED.school_section, class_name=EXCLUDED.class_name, updated_at=NOW()`,
          [r.studentId, r.studentName, r.section, r.className || null]
        );
        await client.query(
          `INSERT INTO academic_results (student_id,school_section,class_name,academic_year,term,subject,score,max_score,import_batch_id)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
           ON CONFLICT (student_id,academic_year,term,subject) DO UPDATE SET school_section=EXCLUDED.school_section, class_name=EXCLUDED.class_name, score=EXCLUDED.score, max_score=EXCLUDED.max_score, import_batch_id=EXCLUDED.import_batch_id, updated_at=NOW()`,
          [r.studentId,r.section,r.className || null,r.academicYear,r.term,r.subject,r.score,r.maxScore,batchId]
        );
      }
      await client.query("UPDATE academic_import_batches SET status='completed' WHERE id=$1", [batchId]);
      await client.query('COMMIT');
      return res.status(201).json({ ok: true, batchId, importedRows: valid.length, errors: [] });
    } catch (e) {
      if (client) { try { await client.query('ROLLBACK'); } catch (_) {} }
      return res.status(503).json({ error: 'Import failed; no partial results were committed.', detail: process.env.NODE_ENV === 'production' ? undefined : e.message });
    } finally { if (client) client.release(); }
  });


  app.get('/api/academic/report-card', ...secure, async (req,res) => {
    const studentId = String(req.query.studentId || '').trim().slice(0,80);
    const academicYear = String(req.query.academicYear || '').trim().slice(0,20);
    const term = String(req.query.term || '').trim();
    if (!studentId || !academicYear || !TERMS.has(term)) return res.status(400).json({error:'Provide studentId, academicYear, and a valid term.'});
    try {
      const student = await getPool().query('SELECT student_id,full_name,school_section,class_name,status FROM academic_students WHERE student_id=$1',[studentId]);
      if (!student.rowCount) return res.status(404).json({error:'Student not found.'});
      const result = await getPool().query(
        "SELECT subject,score,max_score,ROUND((score/NULLIF(max_score,0)*100)::numeric,2) AS percentage FROM academic_results WHERE student_id=$1 AND academic_year=$2 AND term=$3 ORDER BY subject",
        [studentId,academicYear,term]
      );
      const rows = result.rows;
      const avg = rows.length ? Number((rows.reduce((sum,r)=>sum+Number(r.percentage),0)/rows.length).toFixed(2)) : null;
      const pass = rows.length ? Number((rows.filter(r=>Number(r.percentage)>=50).length/rows.length*100).toFixed(2)) : null;
      return res.json({student:student.rows[0],academicYear,term,subjects:rows,summary:{subjectCount:rows.length,averagePercent:avg,passRate:pass},gradingNote:'Percentages are calculated from recorded scores. The pass-rate summary uses a provisional 50% threshold; apply the school-approved grading policy for official report cards.'});
    } catch(e) { return res.status(503).json({error:'Could not generate report card. Check the academic schema.'}); }
  });

  app.get('/api/academic/import-history', ...secure, async (_req, res) => {
    try {
      const result = await getPool().query('SELECT id,imported_by,file_name,school_section,academic_year,term,row_count,status,created_at FROM academic_import_batches ORDER BY created_at DESC LIMIT 50');
      return res.json({ batches: result.rows });
    } catch (e) { return res.status(503).json({ error: e.message }); }
  });

  app.get('/api/academic/kpi-comparison', ...secure, async (req, res) => {
    const { section = 'JHS', academicYear, termA = 'Term 1', termB = 'Term 2' } = req.query;
    if (!SECTIONS.has(section) || !TERMS.has(termA) || !TERMS.has(termB) || termA === termB || !academicYear) {
      return res.status(400).json({ error: 'Provide a section, academicYear, and two different valid terms.' });
    }
    try {
      const result = await getPool().query(
        `SELECT term,subject,COUNT(*)::int AS assessment_count,
          ROUND(AVG(score / NULLIF(max_score,0) * 100)::numeric,2) AS average_percent,
          ROUND((COUNT(*) FILTER (WHERE score / NULLIF(max_score,0) >= 0.5)::numeric / NULLIF(COUNT(*),0))*100,2) AS pass_rate
         FROM academic_results WHERE school_section=$1 AND academic_year=$2 AND term=ANY($3::text[])
         GROUP BY term,subject ORDER BY subject,term`,
        [section, academicYear, [termA, termB]]
      );
      const subjects = new Map();
      for (const row of result.rows) {
        if (!subjects.has(row.subject)) subjects.set(row.subject, { subject: row.subject, termA: null, termB: null });
        subjects.get(row.subject)[row.term === termA ? 'termA' : 'termB'] = {
          average: Number(row.average_percent), passRate: Number(row.pass_rate), assessments: row.assessment_count
        };
      }
      const data = [...subjects.values()].map((x) => ({
        ...x,
        averageChange: x.termA && x.termB ? Number((x.termB.average - x.termA.average).toFixed(2)) : null,
        passRateChange: x.termA && x.termB ? Number((x.termB.passRate - x.termA.passRate).toFixed(2)) : null
      }));
      const means = (key, metric) => {
        const values = data.map((x) => x[key]?.[metric]).filter(Number.isFinite);
        return values.length ? Number((values.reduce((a,b)=>a+b,0)/values.length).toFixed(2)) : null;
      };
      return res.json({
        section, academicYear, termA, termB, subjects: data,
        summary: {
          termAAverage: means('termA','average'), termBAverage: means('termB','average'),
          termAPassRate: means('termA','passRate'), termBPassRate: means('termB','passRate'),
          averageChange: means('termA','average') !== null && means('termB','average') !== null ? Number((means('termB','average') - means('termA','average')).toFixed(2)) : null,
          passRateChange: means('termA','passRate') !== null && means('termB','passRate') !== null ? Number((means('termB','passRate') - means('termA','passRate')).toFixed(2)) : null
        }
      });
    } catch (e) { return res.status(503).json({ error: e.message }); }
  });
}

module.exports = { parseCsv, parseXlsxBase64, uploadedRows, validateRows, registerAcademicRoutes, getPool };
