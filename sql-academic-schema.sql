-- Run against the Debest Academy PostgreSQL database before using academic tools.
CREATE TABLE IF NOT EXISTS academic_students (
  student_id VARCHAR(80) PRIMARY KEY,
  full_name VARCHAR(160) NOT NULL,
  school_section VARCHAR(20) NOT NULL CHECK (school_section IN ('KG','Primary','JHS')),
  class_name VARCHAR(80),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS academic_import_batches (
  id BIGSERIAL PRIMARY KEY,
  imported_by VARCHAR(120) NOT NULL,
  file_name VARCHAR(200) NOT NULL,
  school_section VARCHAR(20) NOT NULL CHECK (school_section IN ('KG','Primary','JHS')),
  academic_year VARCHAR(20) NOT NULL,
  term VARCHAR(20) NOT NULL CHECK (term IN ('Term 1','Term 2','Term 3')),
  row_count INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'processing' CHECK (status IN ('processing','completed','failed')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS academic_results (
  id BIGSERIAL PRIMARY KEY,
  student_id VARCHAR(80) NOT NULL REFERENCES academic_students(student_id) ON UPDATE CASCADE,
  school_section VARCHAR(20) NOT NULL CHECK (school_section IN ('KG','Primary','JHS')),
  class_name VARCHAR(80),
  academic_year VARCHAR(20) NOT NULL,
  term VARCHAR(20) NOT NULL CHECK (term IN ('Term 1','Term 2','Term 3')),
  subject VARCHAR(120) NOT NULL,
  score NUMERIC(7,2) NOT NULL CHECK (score >= 0),
  max_score NUMERIC(7,2) NOT NULL CHECK (max_score > 0 AND score <= max_score),
  import_batch_id BIGINT REFERENCES academic_import_batches(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (student_id, academic_year, term, subject)
);
CREATE INDEX IF NOT EXISTS idx_academic_results_comparison
  ON academic_results (school_section, academic_year, term, subject);
CREATE INDEX IF NOT EXISTS idx_academic_results_student
  ON academic_results (student_id, academic_year, term);

-- Student profile extensions (safe to run repeatedly).
ALTER TABLE academic_students ADD COLUMN IF NOT EXISTS admission_date DATE;
ALTER TABLE academic_students ADD COLUMN IF NOT EXISTS guardian_name VARCHAR(160);
ALTER TABLE academic_students ADD COLUMN IF NOT EXISTS guardian_phone VARCHAR(40);
ALTER TABLE academic_students ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active'
  CHECK (status IN ('active','inactive','graduated','transferred'));

CREATE TABLE IF NOT EXISTS attendance_sessions (
  id BIGSERIAL PRIMARY KEY,
  session_date DATE NOT NULL,
  school_section VARCHAR(20) NOT NULL CHECK (school_section IN ('KG','Primary','JHS')),
  class_name VARCHAR(80) NOT NULL,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_date, school_section, class_name)
);
CREATE TABLE IF NOT EXISTS attendance_marks (
  id BIGSERIAL PRIMARY KEY,
  session_id BIGINT NOT NULL REFERENCES attendance_sessions(id) ON DELETE CASCADE,
  student_id VARCHAR(80) NOT NULL REFERENCES academic_students(student_id) ON UPDATE CASCADE,
  status VARCHAR(20) NOT NULL CHECK (status IN ('present','absent','late','excused')),
  note VARCHAR(300),
  marked_by VARCHAR(120) NOT NULL,
  marked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (session_id, student_id)
);
CREATE INDEX IF NOT EXISTS idx_attendance_session_date ON attendance_sessions(session_date, school_section, class_name);
CREATE INDEX IF NOT EXISTS idx_attendance_student ON attendance_marks(student_id, session_id);

CREATE TABLE IF NOT EXISTS fee_invoices (
  id BIGSERIAL PRIMARY KEY,
  invoice_number VARCHAR(40) NOT NULL UNIQUE,
  student_id VARCHAR(80) NOT NULL REFERENCES academic_students(student_id) ON UPDATE CASCADE,
  academic_year VARCHAR(20) NOT NULL,
  term VARCHAR(20) NOT NULL CHECK (term IN ('Term 1','Term 2','Term 3')),
  description VARCHAR(200) NOT NULL,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  due_date DATE,
  created_by VARCHAR(120) NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS fee_payments (
  id BIGSERIAL PRIMARY KEY,
  invoice_id BIGINT NOT NULL REFERENCES fee_invoices(id),
  receipt_number VARCHAR(40) NOT NULL UNIQUE,
  amount NUMERIC(12,2) NOT NULL CHECK (amount > 0),
  payment_method VARCHAR(30) NOT NULL CHECK (payment_method IN ('cash','mobile_money','bank_transfer','cheque','other')),
  reference VARCHAR(100),
  received_by VARCHAR(120) NOT NULL,
  received_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_fee_invoice_student ON fee_invoices(student_id, academic_year, term);
CREATE INDEX IF NOT EXISTS idx_fee_payments_invoice ON fee_payments(invoice_id, received_at);
