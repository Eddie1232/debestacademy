'use strict';
const { randomUUID } = require('crypto');
const { getPool } = require('./academic-tools');
const SECTIONS = ['KG','Primary','JHS'];
const TERMS = ['Term 1','Term 2','Term 3'];
const text = (v,n=160) => typeof v === 'string' ? v.trim().slice(0,n) : '';
const staff = req => text(req.user && (req.user.username || req.user.sub) || 'staff',120);
const dateOK = v => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v));

function registerSchoolOperationsRoutes(app, deps) {
  const secure = [deps.authRequired,deps.adminIpAllowed,deps.schoolStaffRequired];
  const record = deps.roleRequired('Secretary','Manager','Headmaster');
  const manage = deps.roleRequired('Manager','Headmaster','Bursar');

  app.get('/api/school/students', ...secure, record, async (req,res) => {
    const q=text(req.query.q,100), section=text(req.query.section,20), status=text(req.query.status,20);
    if(section && !SECTIONS.includes(section)) return res.status(400).json({error:'Invalid section.'});
    if(status && !['active','inactive','graduated','transferred'].includes(status)) return res.status(400).json({error:'Invalid status.'});
    try {
      const r=await getPool().query("SELECT student_id,full_name,school_section,class_name,admission_date,guardian_name,guardian_phone,status,created_at FROM academic_students WHERE ($1='' OR school_section=$1) AND ($2='' OR status=$2) AND ($3='' OR student_id ILIKE '%'||$3||'%' OR full_name ILIKE '%'||$3||'%' OR COALESCE(class_name,'') ILIKE '%'||$3||'%') ORDER BY school_section,class_name,full_name LIMIT 500",[section,status,q]);
      return res.json({students:r.rows});
    } catch(e){return res.status(503).json({error:'Could not load students. Check database schema.'});}
  });

  app.post('/api/school/students', ...secure, record, async (req,res) => {
    const b=req.body||{}, id=text(b.studentId,80), name=text(b.fullName,160), section=text(b.section,20);
    if(!id||!name||!SECTIONS.includes(section)) return res.status(400).json({error:'Student ID, full name and valid section are required.'});
    if(b.admissionDate&&!dateOK(b.admissionDate)) return res.status(400).json({error:'Admission date must be YYYY-MM-DD.'});
    try {
      const r=await getPool().query("INSERT INTO academic_students(student_id,full_name,school_section,class_name,admission_date,guardian_name,guardian_phone,status) VALUES($1,$2,$3,$4,$5,$6,$7,'active') RETURNING *",[id,name,section,text(b.className,80)||null,b.admissionDate||null,text(b.guardianName,160)||null,text(b.guardianPhone,40)||null]);
      return res.status(201).json({student:r.rows[0]});
    } catch(e){return res.status(e.code==='23505'?409:503).json({error:e.code==='23505'?'Student ID already exists.':'Could not save student. Check database schema.'});}
  });

  app.patch('/api/school/students/:studentId', ...secure, record, async (req,res) => {
    const b=req.body||{}, id=text(req.params.studentId,80), name=text(b.fullName,160), section=text(b.section,20), status=text(b.status,20);
    if(!name||!SECTIONS.includes(section)||!['active','inactive','graduated','transferred'].includes(status)) return res.status(400).json({error:'Valid name, section and status are required.'});
    if(b.admissionDate&&!dateOK(b.admissionDate)) return res.status(400).json({error:'Admission date must be YYYY-MM-DD.'});
    try {
      const r=await getPool().query("UPDATE academic_students SET full_name=$2,school_section=$3,class_name=$4,admission_date=$5,guardian_name=$6,guardian_phone=$7,status=$8,updated_at=NOW() WHERE student_id=$1 RETURNING *",[id,name,section,text(b.className,80)||null,b.admissionDate||null,text(b.guardianName,160)||null,text(b.guardianPhone,40)||null,status]);
      if(!r.rowCount)return res.status(404).json({error:'Student not found.'});
      return res.json({student:r.rows[0]});
    }catch(e){return res.status(503).json({error:'Could not update student.'});}
  });

  app.get('/api/school/attendance', ...secure, record, async (req,res) => {
    const date=text(req.query.date,10), section=text(req.query.section,20), cls=text(req.query.className,80);
    if(!dateOK(date)||!SECTIONS.includes(section)||!cls)return res.status(400).json({error:'Provide date, section and class.'});
    try {
      const r=await getPool().query("SELECT s.student_id,s.full_name,s.class_name,m.status,m.note FROM academic_students s LEFT JOIN attendance_sessions a ON a.session_date=$1 AND a.school_section=$2 AND a.class_name=$3 LEFT JOIN attendance_marks m ON m.session_id=a.id AND m.student_id=s.student_id WHERE s.school_section=$2 AND s.class_name=$3 AND s.status='active' ORDER BY s.full_name",[date,section,cls]);
      return res.json({date,section,className:cls,students:r.rows});
    }catch(e){return res.status(503).json({error:'Could not load attendance. Check database schema.'});}
  });

  app.post('/api/school/attendance/mark', ...secure, record, async (req,res) => {
    const b=req.body||{}, date=text(b.date,10), section=text(b.section,20), cls=text(b.className,80), marks=b.marks;
    const statuses=['present','absent','late','excused'];
    if(!dateOK(date)||!SECTIONS.includes(section)||!cls||!Array.isArray(marks)||!marks.length||marks.length>500)return res.status(400).json({error:'Provide date, section, class and 1–500 marks.'});
    if(marks.some(m=>!text(m.studentId,80)||!statuses.includes(m.status))||new Set(marks.map(m=>text(m.studentId,80))).size!==marks.length)return res.status(400).json({error:'Marks must have unique student IDs and valid statuses.'});
    let client;
    try {
      client=await getPool().connect();
      await client.query('BEGIN');
      const s=await client.query("INSERT INTO attendance_sessions(session_date,school_section,class_name,created_by) VALUES($1,$2,$3,$4) ON CONFLICT(session_date,school_section,class_name) DO UPDATE SET created_by=EXCLUDED.created_by RETURNING id",[date,section,cls,staff(req)]);
      for(const m of marks){
        const id=text(m.studentId,80);
        const student=await client.query("SELECT 1 FROM academic_students WHERE student_id=$1 AND school_section=$2 AND class_name=$3 AND status='active'",[id,section,cls]);
        if(!student.rowCount)throw new Error('Student '+id+' is not active in the selected class.');
        await client.query("INSERT INTO attendance_marks(session_id,student_id,status,note,marked_by) VALUES($1,$2,$3,$4,$5) ON CONFLICT(session_id,student_id) DO UPDATE SET status=EXCLUDED.status,note=EXCLUDED.note,marked_by=EXCLUDED.marked_by,marked_at=NOW()",[s.rows[0].id,id,m.status,text(m.note,300)||null,staff(req)]);
      }
      await client.query('COMMIT'); return res.json({ok:true,sessionId:s.rows[0].id,marked:marks.length});
    }catch(e){if(client){try{await client.query('ROLLBACK');}catch(_){}}return res.status(e.statusCode||503).json({error:e.statusCode?e.message:'Attendance failed; no partial changes were saved.'});}
    finally{if(client)client.release();}
  });


  app.get('/api/school/fee-students', ...secure, manage, async (req,res) => {
    const q=text(req.query.q,100);
    try {
      const r=await getPool().query("SELECT student_id,full_name,school_section,class_name FROM academic_students WHERE status='active' AND ($1='' OR student_id ILIKE '%'||$1||'%' OR full_name ILIKE '%'||$1||'%') ORDER BY full_name LIMIT 100",[q]);
      return res.json({students:r.rows});
    } catch(e) { return res.status(503).json({error:'Could not load fee student list.'}); }
  });

  app.get('/api/school/fees', ...secure, manage, async (req,res) => {
    const q=text(req.query.q,100);
    try {
      const r=await getPool().query("SELECT i.id,i.invoice_number,i.student_id,s.full_name,s.school_section,s.class_name,i.academic_year,i.term,i.description,i.amount,i.due_date,i.created_at,COALESCE(SUM(p.amount),0)::numeric(12,2) AS paid,GREATEST(i.amount-COALESCE(SUM(p.amount),0),0)::numeric(12,2) AS balance FROM fee_invoices i JOIN academic_students s ON s.student_id=i.student_id LEFT JOIN fee_payments p ON p.invoice_id=i.id WHERE ($1='' OR i.invoice_number ILIKE '%'||$1||'%' OR i.student_id ILIKE '%'||$1||'%' OR s.full_name ILIKE '%'||$1||'%') GROUP BY i.id,s.student_id ORDER BY i.created_at DESC LIMIT 500",[q]);
      return res.json({invoices:r.rows});
    }catch(e){return res.status(503).json({error:'Could not load fees. Check database schema.'});}
  });

  app.post('/api/school/fees/invoices', ...secure, manage, async (req,res) => {
    const b=req.body||{}, studentId=text(b.studentId,80), year=text(b.academicYear,20), term=text(b.term,20), description=text(b.description,200), amount=Number(b.amount);
    if(!studentId||!year||!TERMS.includes(term)||!description||!Number.isFinite(amount)||amount<=0||amount>100000000)return res.status(400).json({error:'Student, year, term, description and positive amount are required.'});
    if(b.dueDate&&!dateOK(b.dueDate))return res.status(400).json({error:'Due date must be YYYY-MM-DD.'});
    try{
      const invoice='INV-'+Date.now().toString(36).toUpperCase()+'-'+randomUUID().slice(0,6).toUpperCase();
      const r=await getPool().query("INSERT INTO fee_invoices(invoice_number,student_id,academic_year,term,description,amount,due_date,created_by) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *",[invoice,studentId,year,term,description,amount,b.dueDate||null,staff(req)]);
      return res.status(201).json({invoice:r.rows[0]});
    }catch(e){return res.status(e.code==='23503'?404:503).json({error:e.code==='23503'?'Student not found.':'Could not create invoice.'});}
  });

  app.post('/api/school/fees/payments', ...secure, manage, async (req,res) => {
    const b=req.body||{}, invoiceId=Number(b.invoiceId), amount=Number(b.amount), method=text(b.method,30), reference=text(b.reference,100), methods=['cash','mobile_money','bank_transfer','cheque','other'];
    if(!Number.isInteger(invoiceId)||invoiceId<1||!Number.isFinite(amount)||amount<=0||!methods.includes(method))return res.status(400).json({error:'Valid invoice, positive amount and payment method are required.'});
    let client;
    try{
      client=await getPool().connect();
      await client.query('BEGIN');
      const inv=await client.query("SELECT i.id,i.amount,COALESCE((SELECT SUM(p.amount) FROM fee_payments p WHERE p.invoice_id=i.id),0) AS paid FROM fee_invoices i WHERE i.id=$1 FOR UPDATE",[invoiceId]);
      if(!inv.rowCount){await client.query('ROLLBACK');return res.status(404).json({error:'Invoice not found.'});}
      const balance=Number(inv.rows[0].amount)-Number(inv.rows[0].paid);
      if(amount>balance+0.00001){await client.query('ROLLBACK');return res.status(400).json({error:'Payment exceeds outstanding balance.',balance:Math.max(0,balance)});}
      const receipt='RCP-'+Date.now().toString(36).toUpperCase()+'-'+randomUUID().slice(0,6).toUpperCase();
      const p=await client.query("INSERT INTO fee_payments(invoice_id,receipt_number,amount,payment_method,reference,received_by) VALUES($1,$2,$3,$4,$5,$6) RETURNING *",[invoiceId,receipt,amount,method,reference||null,staff(req)]);
      await client.query('COMMIT');return res.status(201).json({payment:p.rows[0],balanceAfter:Number((balance-amount).toFixed(2))});
    }catch(e){if(client){try{await client.query('ROLLBACK');}catch(_){}}return res.status(503).json({error:'Payment recording failed; no partial payment was saved.'});}
    finally{if(client)client.release();}
  });


  app.get('/api/school/insights', ...secure, async (_req,res) => {
    try {
      const p = getPool();
      const [students, subjects, attendance, fees] = await Promise.all([
        p.query("SELECT school_section,COUNT(*)::int AS count FROM academic_students WHERE status='active' GROUP BY school_section"),
        p.query("SELECT subject,ROUND(AVG(score/NULLIF(max_score,0)*100)::numeric,2) AS average_percent,COUNT(*)::int AS assessments FROM academic_results GROUP BY subject ORDER BY average_percent ASC LIMIT 8"),
        p.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='present')::int AS present,COUNT(*) FILTER(WHERE status='late')::int AS late,COUNT(*) FILTER(WHERE status='absent')::int AS absent FROM attendance_marks"),
        p.query("SELECT COALESCE(SUM(i.amount),0)::numeric(12,2) AS invoiced,COALESCE(SUM(p.paid),0)::numeric(12,2) AS paid,COALESCE(SUM(i.amount-COALESCE(p.paid,0)),0)::numeric(12,2) AS outstanding FROM fee_invoices i LEFT JOIN (SELECT invoice_id,SUM(amount) paid FROM fee_payments GROUP BY invoice_id) p ON p.invoice_id=i.id")
      ]);
      const metrics = { students:students.rows, lowestSubjectAverages:subjects.rows, attendance:attendance.rows[0], fees:fees.rows[0] };
      const fallback = [];
      if (!students.rows.length) fallback.push('No active students are registered yet.');
      if (subjects.rows.length) {
        const lowest=subjects.rows[0];
        if (Number(lowest.average_percent)<50) fallback.push(lowest.subject+' has the lowest recorded average ('+lowest.average_percent+'%); review the results and plan targeted support.');
        else fallback.push('The lowest subject average is '+lowest.subject+' at '+lowest.average_percent+'%; review subject-level results for learners needing support.');
      } else fallback.push('No academic results are available for analysis yet.');
      const a=metrics.attendance;
      if(Number(a.total)>0) fallback.push('Attendance marks: '+a.present+' present, '+a.late+' late and '+a.absent+' absent out of '+a.total+' recorded marks.');
      else fallback.push('No attendance marks have been recorded yet.');
      fallback.push('Outstanding fees total GHS '+Number(metrics.fees.outstanding).toFixed(2)+'. Reconcile this with the bursar records before taking action.');
      let insight=fallback.join(' ');
      let source='rules';
      if(process.env.OPENAI_API_KEY && typeof globalThis.fetch==='function') {
        try {
          const response=await globalThis.fetch('https://api.openai.com/v1/responses',{
            method:'POST',
            headers:{Authorization:'Bearer '+process.env.OPENAI_API_KEY,'Content-Type':'application/json'},
            body:JSON.stringify({
              model:process.env.OPENAI_MODEL||'gpt-5.6-luna',
              max_output_tokens:500,
              input:[
                {role:'system',content:'You are DataPulse AI, an assistant for school leadership. Analyze only the aggregate metrics supplied. Do not infer individual student details, invent causes, or present correlation as causation. Give concise findings, risks, and practical next steps. Clearly state when data is limited. Financial figures are in Ghana cedis (GHS).'},
                {role:'user',content:'Prepare an academic and operations snapshot using these aggregate metrics only: '+JSON.stringify(metrics)}
              ]
            })
          });
          if(response.ok) {
            const data=await response.json();
            if(typeof data.output_text==='string'&&data.output_text.trim()){insight=data.output_text.trim();source='ai';}
          }
        } catch(e) { /* Use safe rules-based summary if AI is unavailable. */ }
      }
      return res.json({metrics,insight,source});
    } catch(e) { return res.status(503).json({error:'Could not generate school insights. Check the academic database schema.'}); }
  });

  app.get('/api/school/overview', ...secure, async (_req,res) => {
    try{
      const r=await getPool().query("SELECT (SELECT COUNT(*)::int FROM academic_students WHERE status='active') AS active_students,(SELECT COUNT(*)::int FROM academic_students WHERE status='active' AND school_section='KG') AS kg_students,(SELECT COUNT(*)::int FROM academic_students WHERE status='active' AND school_section='Primary') AS primary_students,(SELECT COUNT(*)::int FROM academic_students WHERE status='active' AND school_section='JHS') AS jhs_students,(SELECT COUNT(*)::int FROM academic_results) AS result_records,(SELECT COUNT(*)::int FROM attendance_sessions WHERE session_date=CURRENT_DATE) AS attendance_sessions_today,(SELECT COALESCE(SUM(i.amount-COALESCE(p.paid,0)),0)::numeric(12,2) FROM fee_invoices i LEFT JOIN (SELECT invoice_id,SUM(amount) paid FROM fee_payments GROUP BY invoice_id) p ON p.invoice_id=i.id) AS outstanding_fees");
      const overview=r.rows[0];
      if (!['Manager','Headmaster','Bursar'].includes(_req.user?.role)) delete overview.outstanding_fees;
      return res.json({overview});
    }catch(e){return res.status(503).json({error:'Could not load school overview. Check database schema.'});}
  });
}
module.exports = { registerSchoolOperationsRoutes };
