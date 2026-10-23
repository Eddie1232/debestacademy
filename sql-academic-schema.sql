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
