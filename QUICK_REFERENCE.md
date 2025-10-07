# AHCP Auth System - Quick Reference Card

## 🔑 Test Credentials

```
Super Admin:
  Email: admin@ahcp.gov.sa
  Password: admin123
  Access: ALL sections

Mobile Clinic Supervisor:
  Email: clinic@ahcp.gov.sa
  Password: password123
  Access: Mobile Clinic only

Vaccination Supervisor:
  Email: vaccination@ahcp.gov.sa
  Password: password123
  Access: Vaccination only

Parasite Control Supervisor:
  Email: parasite@ahcp.gov.sa
  Password: password123
  Access: Parasite Control only

Equine Health Supervisor:
  Email: equine@ahcp.gov.sa
  Password: password123
  Access: Equine Health only

Laboratory Supervisor:
  Email: laboratory@ahcp.gov.sa
  Password: password123
  Access: Laboratory only
```

## 🚀 Quick Start

```bash
# 1. Seed database (if not done)
node seed-supervisors.js

# 2. Start server
npm start

# 3. Test authentication
node test-auth.js
```

## 📡 Login Example

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ahcp.gov.sa","password":"admin123"}'

# Response includes token:
{
  "success": true,
  "data": {
    "user": { ... },
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
  }
}

# Use token in requests
curl -X GET http://localhost:3001/api/mobile-clinics \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

## 🛡️ Middleware Usage

### Server-Level (Already Applied)
```javascript
// In server.js - protects ALL routes in the router
app.use('/api/parasite-control', 
  authMiddleware, 
  authorizeSection('Parasite Control'), 
  parasiteControlRoutes
);
```

### Route-Level
```javascript
const { auth, authorize, authorizeSection } = require('../middleware/auth');

// Basic auth
router.get('/', auth, handler);

// Role-based
router.delete('/:id', auth, authorize('super_admin'), handler);

// Section-based
router.get('/data', auth, authorizeSection('Vaccination'), handler);

// Multiple roles
router.post('/', auth, authorize('super_admin', 'section_supervisor'), handler);
```

## 🎯 Access Rules

| Endpoint | Required | Who Can Access |
|----------|----------|----------------|
| `/api/mobile-clinics/*` | Auth + Section | Mobile Clinic supervisor OR super_admin |
| `/api/vaccination/*` | Auth + Section | Vaccination supervisor OR super_admin |
| `/api/parasite-control/*` | Auth + Section | Parasite Control supervisor OR super_admin |
| `/api/equine-health/*` | Auth + Section | Equine Health supervisor OR super_admin |
| `/api/laboratories/*` | Auth + Section | Laboratory supervisor OR super_admin |
| `/api/clients/*` | Auth only | Any authenticated user |
| `/api/reports/*` | Auth only | Any authenticated user |
| `/api/upload/*` | Auth only | Any authenticated user |

## 🔍 Using req.user

```javascript
router.post('/create', auth, async (req, res) => {
  // Available properties:
  req.user._id        // User ID
  req.user.name       // "Dr. Ahmed Hassan"
  req.user.email      // "clinic@ahcp.gov.sa"
  req.user.role       // "section_supervisor"
  req.user.section    // "Mobile Clinic"
  req.user.isActive   // true
  req.user.lastLogin  // Date
  
  // Use in your code:
  const record = new Record({
    ...req.body,
    createdBy: req.user._id,
    section: req.user.section
  });
  await record.save();
});
```

## ⚠️ Common Errors

### 401 - No Token
```json
{
  "success": false,
  "message": "Access denied. No token provided.",
  "error": "MISSING_TOKEN"
}
```
**Fix:** Add `Authorization: Bearer <token>` header

### 401 - Invalid Token
```json
{
  "success": false,
  "message": "Invalid token.",
  "error": "INVALID_TOKEN"
}
```
**Fix:** Login again to get a new token

### 403 - Wrong Section
```json
{
  "success": false,
  "message": "Access denied. This endpoint is only accessible to Vaccination section or super admin.",
  "error": "SECTION_ACCESS_DENIED",
  "requiredSection": "Vaccination",
  "userSection": "Mobile Clinic"
}
```
**Fix:** Use correct user for the section OR use super_admin

### 403 - Insufficient Permissions
```json
{
  "success": false,
  "message": "Access denied. Insufficient permissions.",
  "error": "INSUFFICIENT_PERMISSIONS",
  "requiredRoles": ["super_admin"],
  "userRole": "section_supervisor"
}
```
**Fix:** Use user with required role

## 📚 Documentation Files

- `AUTH_SYSTEM_GUIDE.md` - Complete system documentation
- `MIDDLEWARE_USAGE_EXAMPLES.md` - Code examples
- `IMPLEMENTATION_SUMMARY.md` - What was implemented
- `QUICK_REFERENCE.md` - This file

## 🧪 Testing

```bash
# Automated tests
node test-auth.js

# Manual test with curl
# 1. Login
TOKEN=$(curl -s -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"admin@ahcp.gov.sa","password":"admin123"}' \
  | jq -r '.data.token')

# 2. Use token
curl -X GET http://localhost:3001/api/mobile-clinics \
  -H "Authorization: Bearer $TOKEN"
```

## 🎨 Postman Collection

Import: `AHCP-API-Collection.postman_collection.json`

1. Login via `/api/auth/login`
2. Copy token from response
3. Set as Bearer token in Authorization tab
4. Test protected endpoints

## ✅ Checklist

- [x] User model updated with section enum
- [x] JWT includes role and section
- [x] Section authorization middleware created
- [x] Server.js updated with section protection
- [x] Seed script created and run
- [x] Test script created
- [x] Documentation completed
- [x] Example routes updated
- [ ] Change default passwords (IMPORTANT!)
- [ ] Test with your frontend
- [ ] Deploy to production

## 🔐 Security Reminders

1. ⚠️ **Change default passwords before production!**
2. Use strong JWT_SECRET (64+ characters)
3. Enable HTTPS in production
4. Set appropriate token expiration
5. Implement rate limiting
6. Add audit logging
7. Monitor failed login attempts

## 💡 Pro Tips

1. **Super admin bypasses all section checks** - Use for testing
2. **Server-level auth is already applied** - Don't add auth twice
3. **req.user is always available** in protected routes
4. **Filter data by section** for non-super_admin users
5. **Use optionalAuth** for public endpoints with personalization

---

**Need Help?** Check the full documentation in `AUTH_SYSTEM_GUIDE.md`
