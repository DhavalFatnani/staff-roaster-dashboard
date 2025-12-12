-- Supabase Database Schema
-- Run this in your Supabase SQL editor

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Roles table
CREATE TABLE IF NOT EXISTS roles (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL UNIQUE,
  description TEXT,
  permissions TEXT[] NOT NULL DEFAULT '{}',
  default_task_preferences TEXT[],
  default_experience_level VARCHAR(50),
  default_pp_type VARCHAR(50),
  is_editable BOOLEAN NOT NULL DEFAULT true,
  is_system_role BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_by UUID
);

-- Stores table
CREATE TABLE IF NOT EXISTS stores (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  address TEXT,
  phone VARCHAR(50),
  email VARCHAR(255),
  timezone VARCHAR(100) NOT NULL DEFAULT 'UTC',
  settings JSONB NOT NULL DEFAULT '{}',
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Users table (extends Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  employee_id VARCHAR(255) NOT NULL UNIQUE,
  first_name VARCHAR(255) NOT NULL,
  last_name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  phone VARCHAR(50),
  role_id UUID NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  experience_level VARCHAR(50) NOT NULL,
  pp_type VARCHAR(50),
  week_offs INTEGER[] NOT NULL DEFAULT '{}',
  default_shift_preference VARCHAR(50),
  is_active BOOLEAN NOT NULL DEFAULT true,
  last_login_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL,
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_by UUID,
  deleted_at TIMESTAMP WITH TIME ZONE,
  deleted_by UUID,
  deletion_reason TEXT,
  CONSTRAINT check_experience_level CHECK (experience_level IN ('experienced', 'fresher')),
  CONSTRAINT check_pp_type CHECK (pp_type IS NULL OR pp_type IN ('warehouse', 'adHoc'))
);

-- Shift definitions table
CREATE TABLE IF NOT EXISTS shift_definitions (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  shift_type VARCHAR(50) NOT NULL,
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  duration_hours INTEGER NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE(store_id, shift_type)
);

-- Tasks table
CREATE TABLE IF NOT EXISTS tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  name VARCHAR(255) NOT NULL,
  description TEXT,
  category VARCHAR(100) NOT NULL,
  required_experience VARCHAR(50),
  estimated_duration INTEGER,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Rosters table
CREATE TABLE IF NOT EXISTS rosters (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  shift_type VARCHAR(50) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  coverage JSONB NOT NULL DEFAULT '{}',
  published_at TIMESTAMP WITH TIME ZONE,
  published_by UUID REFERENCES users(id),
  template_id UUID,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  created_by UUID NOT NULL REFERENCES users(id),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  updated_by UUID REFERENCES users(id),
  UNIQUE(store_id, date, shift_type),
  CONSTRAINT check_status CHECK (status IN ('draft', 'published', 'archived'))
);

-- Roster slots table
CREATE TABLE IF NOT EXISTS roster_slots (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  roster_id UUID NOT NULL REFERENCES rosters(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id),
  shift_type VARCHAR(50) NOT NULL,
  date DATE NOT NULL,
  assigned_tasks TEXT[] NOT NULL DEFAULT '{}',
  start_time VARCHAR(10) NOT NULL,
  end_time VARCHAR(10) NOT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'draft',
  notes TEXT,
  CONSTRAINT check_slot_status CHECK (status IN ('draft', 'published', 'cancelled'))
);

-- Audit logs table
CREATE TABLE IF NOT EXISTS audit_logs (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  store_id UUID NOT NULL REFERENCES stores(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES users(id),
  action VARCHAR(100) NOT NULL,
  entity_type VARCHAR(100) NOT NULL,
  entity_id UUID NOT NULL,
  entity_name VARCHAR(255),
  changes JSONB,
  metadata JSONB,
  ip_address VARCHAR(50),
  user_agent TEXT,
  timestamp TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_store_id ON users(store_id);
CREATE INDEX IF NOT EXISTS idx_users_role_id ON users(role_id);
CREATE INDEX IF NOT EXISTS idx_users_employee_id ON users(employee_id);
CREATE INDEX IF NOT EXISTS idx_users_email ON users(email);
CREATE INDEX IF NOT EXISTS idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_roster_slots_roster_id ON roster_slots(roster_id);
CREATE INDEX IF NOT EXISTS idx_roster_slots_user_id ON roster_slots(user_id);
CREATE INDEX IF NOT EXISTS idx_roster_slots_date ON roster_slots(date);

CREATE INDEX IF NOT EXISTS idx_rosters_store_date ON rosters(store_id, date);
CREATE INDEX IF NOT EXISTS idx_rosters_status ON rosters(status);

CREATE INDEX IF NOT EXISTS idx_audit_logs_store_id ON audit_logs(store_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_logs_timestamp ON audit_logs(timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_audit_logs_entity ON audit_logs(entity_type, entity_id);

-- Function to validate week_offs array
CREATE OR REPLACE FUNCTION validate_week_offs(week_offs_array INTEGER[])
RETURNS BOOLEAN AS $$
BEGIN
  -- If array is empty or null, it's valid
  IF week_offs_array IS NULL OR array_length(week_offs_array, 1) IS NULL THEN
    RETURN TRUE;
  END IF;
  
  -- Check if all elements are between 0 and 6
  RETURN NOT EXISTS (
    SELECT 1 FROM unnest(week_offs_array) AS elem
    WHERE elem < 0 OR elem > 6
  );
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Function to update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to validate week_offs before insert/update
CREATE OR REPLACE FUNCTION validate_user_week_offs()
RETURNS TRIGGER AS $$
BEGIN
  IF NOT validate_week_offs(NEW.week_offs) THEN
    RAISE EXCEPTION 'Invalid week_offs: all values must be between 0 (Sunday) and 6 (Saturday)';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Apply the validation trigger
CREATE TRIGGER validate_users_week_offs
  BEFORE INSERT OR UPDATE OF week_offs ON users
  FOR EACH ROW
  EXECUTE FUNCTION validate_user_week_offs();

-- Triggers for updated_at
CREATE TRIGGER update_roles_updated_at BEFORE UPDATE ON roles
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_stores_updated_at BEFORE UPDATE ON stores
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_rosters_updated_at BEFORE UPDATE ON rosters
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_tasks_updated_at BEFORE UPDATE ON tasks
  FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Row Level Security (RLS) Policies
ALTER TABLE roles ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE stores ENABLE ROW LEVEL SECURITY;
ALTER TABLE rosters ENABLE ROW LEVEL SECURITY;
ALTER TABLE roster_slots ENABLE ROW LEVEL SECURITY;
ALTER TABLE audit_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE shift_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE tasks ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view their own data
CREATE POLICY "Users can view own data" ON users
  FOR SELECT USING (auth.uid() = id);

-- Policy: Users can view users in their store
CREATE POLICY "Users can view store users" ON users
  FOR SELECT USING (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- Policy: Store Managers can do everything
CREATE POLICY "Store Managers full access" ON users
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid()
      AND r.name = 'Store Manager'
    )
  );

-- RLS Policies for shift_definitions
-- Users can view shift definitions for their store
CREATE POLICY "Users can view store shift definitions" ON shift_definitions
  FOR SELECT USING (
    store_id IN (
      SELECT store_id FROM users WHERE id = auth.uid()
    )
  );

-- Store Managers can manage shift definitions
CREATE POLICY "Store Managers manage shift definitions" ON shift_definitions
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid()
      AND r.name = 'Store Manager'
      AND u.store_id = shift_definitions.store_id
    )
  );

-- Shift In Charge can view shift definitions for their store
CREATE POLICY "SI can view shift definitions" ON shift_definitions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid()
      AND (r.name = 'Shift In Charge' OR r.name = 'Store Manager')
      AND u.store_id = shift_definitions.store_id
    )
  );

-- RLS Policies for tasks
-- All authenticated users can view active tasks
CREATE POLICY "Users can view active tasks" ON tasks
  FOR SELECT USING (is_active = true);

-- Store Managers can manage all tasks
CREATE POLICY "Store Managers manage tasks" ON tasks
  FOR ALL USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid()
      AND r.name = 'Store Manager'
    )
  );

-- Shift In Charge can view all tasks (including inactive)
CREATE POLICY "SI can view all tasks" ON tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM users u
      JOIN roles r ON u.role_id = r.id
      WHERE u.id = auth.uid()
      AND (r.name = 'Shift In Charge' OR r.name = 'Store Manager')
    )
  );
