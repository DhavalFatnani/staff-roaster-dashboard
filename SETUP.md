# Setup Guide - Staff Roster Dashboard

## Prerequisites

- Node.js 18.x or higher
- npm or yarn
- A Supabase account (free tier works)

## Step 1: Install Dependencies

```bash
npm install
```

## Step 2: Set Up Supabase

1. Go to [supabase.com](https://supabase.com) and create a new project
2. Once your project is created, go to Settings > API
3. Copy your Project URL and anon/public key
4. Also copy your service_role key (keep this secret!)

## Step 3: Run Database Schema

1. In your Supabase dashboard, go to SQL Editor
2. Open the file `src/lib/supabase-schema.sql`
3. Copy and paste the entire SQL script into the SQL Editor
4. Run the script to create all tables, indexes, and triggers

## Step 4: Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Supabase Configuration
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=your-publishable-key
SUPABASE_SECRET_KEY=your-secret-key
```

**Where to find these keys:**
1. Go to your Supabase project → Settings → API
2. **Project URL**: Copy the URL (e.g., `https://xxxxx.supabase.co`)
3. **Publishable key**: Under "Publishable and secret API keys" → Copy the publishable key (starts with `sb_publishable_`)
4. **Secret key**: Under "Secret keys" → Copy the secret key (starts with `sb_secret_`) ⚠️ Keep this secret!

See `ENV_SETUP.md` for detailed instructions.

## Step 5: Create Default Tasks

**Important**: Create the 5 default tasks that are common to each shift.

1. In Supabase SQL Editor, open the file `src/lib/create-default-tasks.sql`
2. Copy and paste the entire SQL script
3. Run the script

This will create:
- ✅ Order Processing
- ✅ Growth Team Escalations
- ✅ Inwarding
- ✅ Return Processing
- ✅ Audit

These tasks will be available for all shifts and can be assigned to staff in the roster builder.

## Step 6: Create Default Roles (Including PP Roles)

**Important**: Before creating users, you need to create the default roles.

1. In your Supabase dashboard, go to SQL Editor
2. Open the file `src/lib/create-default-roles.sql`
3. Copy and paste the entire SQL script into the SQL Editor
4. Run the script

This will create:
- Store Manager
- Shift In Charge
- Inventory Executive
- **Picker Packer (Warehouse)** ← PP role
- **Picker Packer (Ad-Hoc)** ← PP role
- Picker Packer (generic)

**Note**: The script is safe to run multiple times - it only creates roles that don't already exist.

## Step 8: Seed Initial Data (Optional)

You can manually insert additional seed data using the Supabase SQL Editor. The seed data structure is in `seed.cursor`.

Example seed data for roles (if you didn't use the script above):

```sql
-- Insert default roles
INSERT INTO roles (id, name, description, permissions, is_editable, is_system_role, created_by)
VALUES 
  (gen_random_uuid(), 'Store Manager', 'Full administrative access', ARRAY[]::text[], false, true, 'system'),
  (gen_random_uuid(), 'Shift In Charge', 'Elevated user with staff management', ARRAY[]::text[], true, true, 'system'),
  (gen_random_uuid(), 'Inventory Executive', 'Manages inventory', ARRAY[]::text[], true, false, 'system'),
  (gen_random_uuid(), 'Picker Packer (Warehouse)', 'In-store picking and packing', ARRAY[]::text[], true, false, 'system'),
  (gen_random_uuid(), 'Picker Packer (Ad-Hoc)', 'Temporary picking and packing', ARRAY[]::text[], true, false, 'system');
```

## Step 8: Set Up Authentication

1. In Supabase, go to Authentication > Settings
2. Enable Email provider
3. Configure email templates if needed

## Step 10: Create Your First User

1. **Create user in Supabase Authentication:**
   - Go to Authentication > Users
   - Click "Add user" and create a user with email/password
   - **Important**: Note down the user's email (you'll need it for the SQL script)

2. **Run the complete setup script:**
   - Open `src/lib/create-first-user-complete.sql` in your editor
   - Replace `'dhaval@knotnow.co'` with your actual email (appears in 3 places)
   - Copy the entire script and run it in Supabase SQL Editor
   - This script will:
     - ✅ Create all default roles if they don't exist
     - ✅ Create a default store if it doesn't exist
     - ✅ Create your user record with proper role and store assignments
     - ✅ Show a verification query at the end

**What the script does:**
- Creates 5 default roles: Store Manager, Shift In Charge, Inventory Executive, Picker Packer (Warehouse), Picker Packer (Ad-Hoc)
- Creates a default "Main Store" with proper settings
- Links your auth user to the users table as a Store Manager
- Only creates things that don't already exist (safe to run multiple times)

**After running the script:**
- You should see a verification query result showing your user with role and store
- If you see an error, make sure:
  - Your email in the script matches the email in auth.users
  - The auth user exists in Authentication > Users
  - You've run the main schema script first (supabase-schema.sql)

**Note**: The `created_by` field uses your auth user's UUID automatically.

## Step 11: Run the Development Server

```bash
npm run dev
```

The application will be available at `http://localhost:3000`

## Step 12: Login

1. Navigate to `http://localhost:3000/login`
2. Use the email and password you created in Step 7
3. You should be redirected to the dashboard

## Project Structure

```
staff-roaster-dashboard/
├── src/
│   ├── app/              # Next.js app directory
│   │   ├── api/          # API routes
│   │   ├── dashboard/    # Dashboard pages
│   │   ├── login/        # Login page
│   │   └── layout.tsx    # Root layout
│   ├── components/       # React components
│   ├── lib/              # Utilities (Supabase client)
│   ├── types/            # TypeScript types
│   └── utils/            # Helper functions
├── package.json
├── tailwind.config.js
└── tsconfig.json
```

## Features Implemented

✅ User Management (CRUD)
✅ Role Management (CRUD)
✅ Authentication with Supabase
✅ API routes with Supabase integration
✅ Responsive UI with Tailwind CSS
✅ Form validation
✅ Permission-based access control

## Next Steps

1. **Complete Roster Builder**: Implement the roster creation and assignment UI
2. **Add Export Functionality**: Wire up the CSV/PDF export utilities
3. **Implement Audit Logging**: Add audit log creation on user actions
4. **Add Email/Slack Integration**: Configure notifications
5. **Add More Validation**: Enhance business rule validation
6. **Add Tests**: Write unit and E2E tests

## Troubleshooting

### Database Connection Issues
- Verify your Supabase URL and keys are correct
- Check that the schema has been created
- Ensure Row Level Security (RLS) policies allow your operations

### Authentication Issues
- Verify email provider is enabled in Supabase
- Check that users table has corresponding auth.users records
- Ensure user IDs match between auth.users and users table

### Build Errors
- Run `npm install` again
- Clear `.next` folder and rebuild
- Check TypeScript errors with `npm run type-check`

## Support

For issues, refer to:
- Supabase Documentation: https://supabase.com/docs
- Next.js Documentation: https://nextjs.org/docs
- The `.cursor` files for implementation details
