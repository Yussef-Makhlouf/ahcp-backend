# AHCP Authentication & Authorization System

## Overview

This document describes the complete authentication and authorization system for the Animal Health Care Program (AHCP) backend API.

## System Architecture

### User Roles

The system supports three user roles:

1. **`super_admin`** - Full access to all sections and all APIs
2. **`section_supervisor`** - Access only to their assigned section
3. **`field_worker`** - Basic field worker access

### Sections

The system manages 5 main sections plus administration:

1. **Mobile Clinic**
2. **Vaccination**
3. **Parasite Control**
4. **Equine Health**
5. **Laboratory**
6. **Administration** (for super_admin only)

## Authentication Flow

### 1. User Registration

**Endpoint:** `POST /api/auth/register`

**Request Body:**
```json
{
  "name": "Dr. Ahmed Hassan",
  "email": "ahmed@ahcp.gov.sa",
  "password": "password123",
  "role": "section_supervisor",
  "section": "Mobile Clinic"
}
```

**Response:**
```json
{
  "success": true,
  "message": "User registered successfully",
  "data": {
    "user": {
      "id": "68e41b9c96e9269b06f48cd7",
      "name": "Dr. Ahmed Hassan",
      "email": "ahmed@ahcp.gov.sa",
      "role": "section_supervisor",
      "section": "Mobile Clinic",
      "isActive": true
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 2. User Login

**Endpoint:** `POST /api/auth/login`

**Request Body:**
```json
{
  "email": "ahmed@ahcp.gov.sa",
  "password": "password123"
}
```

**Response:**
```json
{
  "success": true,
  "message": "Login successful",
  "data": {
    "user": {
      "id": "68e41b9c96e9269b06f48cd7",
      "name": "Dr. Ahmed Hassan",
      "email": "ahmed@ahcp.gov.sa",
      "role": "section_supervisor",
      "section": "Mobile Clinic",
      "isActive": true,
      "lastLogin": "2025-10-06T20:23:36.000Z"
    },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}
```

### 3. JWT Token Structure

The JWT token includes:
```json
{
  "id": "68e41b9c96e9269b06f48cd7",
  "role": "section_supervisor",
  "section": "Mobile Clinic",
  "iat": 1728244416,
  "exp": 1728330816
}
```

## Authorization Rules

### Section-Based Access Control

Each section API endpoint is protected by section-based authorization:

| Endpoint | Required Section | Allowed Roles |
|----------|-----------------|---------------|
| `/api/mobile-clinics/*` | Mobile Clinic | section_supervisor, super_admin |
| `/api/vaccination/*` | Vaccination | section_supervisor, super_admin |
| `/api/parasite-control/*` | Parasite Control | section_supervisor, super_admin |
| `/api/equine-health/*` | Equine Health | section_supervisor, super_admin |
| `/api/laboratories/*` | Laboratory | section_supervisor, super_admin |
| `/api/clients/*` | Any | All authenticated users |
| `/api/reports/*` | Any | All authenticated users |
| `/api/upload/*` | Any | All authenticated users |

### Access Examples

#### ✅ Allowed Access

- **Super Admin** can access ALL sections
- **Mobile Clinic Supervisor** can access `/api/mobile-clinics/*`
- **Vaccination Supervisor** can access `/api/vaccination/*`

#### ❌ Denied Access

- **Mobile Clinic Supervisor** CANNOT access `/api/vaccination/*`
- **Vaccination Supervisor** CANNOT access `/api/equine-health/*`

## API Endpoints

### Authentication Endpoints

#### Register User
```http
POST /api/auth/register
Content-Type: application/json

{
  "name": "string",
  "email": "string",
  "password": "string",
  "role": "super_admin|section_supervisor|field_worker",
  "section": "Mobile Clinic|Vaccination|Parasite Control|Equine Health|Laboratory|Administration"
}
```

#### Login
```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "string",
  "password": "string"
}
```

#### Get Current User Profile
```http
GET /api/auth/me
Authorization: Bearer <token>
```

#### Update Profile
```http
PUT /api/auth/update-profile
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "string",
  "email": "string",
  "section": "string"
}
```

#### Change Password
```http
PUT /api/auth/change-password
Authorization: Bearer <token>
Content-Type: application/json

{
  "currentPassword": "string",
  "newPassword": "string"
}
```

#### Get All Supervisors
```http
GET /api/auth/supervisors
Authorization: Bearer <token> (optional)
```

#### Get Supervisors by Section
```http
GET /api/auth/supervisors/by-section/:section
Authorization: Bearer <token> (optional)
```

#### Get All Users (Admin Only)
```http
GET /api/auth/users?page=1&limit=10&role=section_supervisor
Authorization: Bearer <token>
```

#### Toggle User Status (Super Admin Only)
```http
PUT /api/auth/users/:id/toggle-status
Authorization: Bearer <token>
```

## Middleware

### 1. `auth` - Authentication Middleware

Verifies JWT token and attaches user to request object.

```javascript
const { auth } = require('./middleware/auth');

router.get('/protected', auth, (req, res) => {
  // req.user is available here
  res.json({ user: req.user });
});
```

### 2. `authorize` - Role-Based Authorization

Restricts access based on user roles.

```javascript
const { auth, authorize } = require('./middleware/auth');

router.get('/admin-only', 
  auth, 
  authorize('super_admin'), 
  (req, res) => {
    res.json({ message: 'Admin access granted' });
  }
);
```

### 3. `authorizeSection` - Section-Based Authorization

Restricts access based on user's section. Super admins bypass this check.

```javascript
const { auth, authorizeSection } = require('./middleware/auth');

router.get('/mobile-clinic-data', 
  auth, 
  authorizeSection('Mobile Clinic'), 
  (req, res) => {
    res.json({ message: 'Mobile Clinic data' });
  }
);
```

### 4. `authorizeRoleAndSection` - Combined Authorization

Combines role and section checks.

```javascript
const { auth, authorizeRoleAndSection } = require('./middleware/auth');

router.post('/create-record', 
  auth, 
  authorizeRoleAndSection(['super_admin', 'section_supervisor'], 'Vaccination'), 
  (req, res) => {
    res.json({ message: 'Record created' });
  }
);
```

## Error Responses

### 401 Unauthorized

**Missing Token:**
```json
{
  "success": false,
  "message": "Access denied. No token provided.",
  "error": "MISSING_TOKEN"
}
```

**Invalid Token:**
```json
{
  "success": false,
  "message": "Invalid token.",
  "error": "INVALID_TOKEN"
}
```

**Token Expired:**
```json
{
  "success": false,
  "message": "Token expired.",
  "error": "TOKEN_EXPIRED"
}
```

### 403 Forbidden

**Insufficient Permissions:**
```json
{
  "success": false,
  "message": "Access denied. Insufficient permissions.",
  "error": "INSUFFICIENT_PERMISSIONS",
  "requiredRoles": ["super_admin"],
  "userRole": "section_supervisor"
}
```

**Section Access Denied:**
```json
{
  "success": false,
  "message": "Access denied. This endpoint is only accessible to Vaccination section or super admin.",
  "error": "SECTION_ACCESS_DENIED",
  "requiredSection": "Vaccination",
  "userSection": "Mobile Clinic",
  "userRole": "section_supervisor"
}
```

## Setup Instructions

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment Variables

Create a `.env` file with:

```env
JWT_SECRET=your-secret-key-here
JWT_EXPIRES_IN=24h
BCRYPT_ROUNDS=12
MONGODB_URI=mongodb://localhost:27017/ahcp_database
```

### 3. Seed Initial Supervisors

Run the seed script to create initial supervisor accounts:

```bash
node seed-supervisors.js
```

This creates:
- 1 Super Admin
- 5 Section Supervisors (one for each section)

### 4. Start the Server

```bash
npm start
```

## Default Accounts (After Seeding)

| Name | Email | Password | Role | Section |
|------|-------|----------|------|---------|
| System Admin | admin@ahcp.gov.sa | admin123 | super_admin | Administration |
| Dr. Ahmed Hassan | clinic@ahcp.gov.sa | password123 | section_supervisor | Mobile Clinic |
| Dr. Khaled Ibrahim | equine@ahcp.gov.sa | password123 | section_supervisor | Equine Health |
| Dr. Sarah Mahmoud | vaccination@ahcp.gov.sa | password123 | section_supervisor | Vaccination |
| Dr. Fatimah AlQahtani | laboratory@ahcp.gov.sa | password123 | section_supervisor | Laboratory |
| Dr. Mohammed AlAhmad | parasite@ahcp.gov.sa | password123 | section_supervisor | Parasite Control |

**⚠️ IMPORTANT:** Change these passwords in production!

## Testing the System

### 1. Login as Super Admin

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@ahcp.gov.sa",
    "password": "admin123"
  }'
```

### 2. Access Any Section (Should Work)

```bash
curl -X GET http://localhost:3001/api/mobile-clinics \
  -H "Authorization: Bearer <super_admin_token>"
```

### 3. Login as Section Supervisor

```bash
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "clinic@ahcp.gov.sa",
    "password": "password123"
  }'
```

### 4. Access Own Section (Should Work)

```bash
curl -X GET http://localhost:3001/api/mobile-clinics \
  -H "Authorization: Bearer <mobile_clinic_supervisor_token>"
```

### 5. Access Different Section (Should Fail with 403)

```bash
curl -X GET http://localhost:3001/api/vaccination \
  -H "Authorization: Bearer <mobile_clinic_supervisor_token>"
```

Expected response:
```json
{
  "success": false,
  "message": "Access denied. This endpoint is only accessible to Vaccination section or super admin.",
  "error": "SECTION_ACCESS_DENIED",
  "requiredSection": "Vaccination",
  "userSection": "Mobile Clinic",
  "userRole": "section_supervisor"
}
```

## Security Best Practices

1. **Use Strong JWT Secrets** - Generate a strong random secret for production
2. **HTTPS Only** - Always use HTTPS in production
3. **Token Expiration** - Set appropriate token expiration times
4. **Password Complexity** - Enforce strong password requirements
5. **Rate Limiting** - Implement rate limiting on auth endpoints
6. **Account Lockout** - Consider implementing account lockout after failed attempts
7. **Audit Logging** - Log all authentication and authorization events

## Troubleshooting

### Issue: Token Invalid

**Solution:** Ensure the JWT_SECRET in your `.env` matches the one used to sign tokens.

### Issue: Section Access Denied

**Solution:** Verify the user's section matches the required section for the endpoint.

### Issue: User Not Found

**Solution:** Run the seed script to create initial users or register new users.

## Support

For issues or questions, contact the AHCP Development Team.
