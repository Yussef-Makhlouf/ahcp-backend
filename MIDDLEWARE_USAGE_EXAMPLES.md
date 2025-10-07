# Authentication & Authorization Middleware Usage Examples

This document provides practical examples of how to use the authentication and authorization middleware in your routes.

## Available Middleware

### 1. `auth` - Basic Authentication
Verifies JWT token and attaches user to `req.user`.

### 2. `authorize(...roles)` - Role-Based Authorization
Restricts access to specific roles.

### 3. `authorizeSection(sectionName)` - Section-Based Authorization
Restricts access to a specific section (super_admin bypasses this).

### 4. `authorizeRoleAndSection(roles, section)` - Combined Authorization
Combines role and section checks.

### 5. `optionalAuth` - Optional Authentication
Adds user to request if token is provided, but doesn't require it.

---

## Method 1: Server-Level Authorization (Recommended for Section Routes)

**Applied in `server.js`** - All routes in the router are automatically protected.

```javascript
// server.js
const { auth: authMiddleware, authorizeSection } = require('./middleware/auth');

// All parasite control routes require authentication AND Parasite Control section access
app.use('/api/parasite-control', 
  authMiddleware, 
  authorizeSection('Parasite Control'), 
  parasiteControlRoutes
);
```

**Then in your route file:**

```javascript
// src/routes/parasiteControl.js
const express = require('express');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

// ✅ No need to add auth middleware here - already applied at server level
router.get('/', asyncHandler(async (req, res) => {
  // req.user is automatically available
  // User is guaranteed to be from "Parasite Control" section or super_admin
  
  console.log('Current user:', req.user.name);
  console.log('User section:', req.user.section);
  console.log('User role:', req.user.role);
  
  res.json({ message: 'Parasite Control data' });
}));

router.post('/', asyncHandler(async (req, res) => {
  // All POST, PUT, DELETE routes are also automatically protected
  // No need to add auth middleware to each route
  
  res.json({ message: 'Record created' });
}));

module.exports = router;
```

---

## Method 2: Route-Level Authorization

**Applied individually to each route** - More granular control.

```javascript
// src/routes/example.js
const express = require('express');
const { auth, authorize, authorizeSection } = require('../middleware/auth');
const { asyncHandler } = require('../middleware/errorHandler');
const router = express.Router();

// Public route - no authentication required
router.get('/public', asyncHandler(async (req, res) => {
  res.json({ message: 'Public data' });
}));

// Protected route - authentication required
router.get('/protected', 
  auth,  // ✅ Add auth middleware
  asyncHandler(async (req, res) => {
    // req.user is available here
    res.json({ 
      message: 'Protected data',
      user: req.user.name 
    });
  })
);

// Admin only route
router.get('/admin-only', 
  auth,  // ✅ First authenticate
  authorize('super_admin'),  // ✅ Then check role
  asyncHandler(async (req, res) => {
    res.json({ message: 'Admin only data' });
  })
);

// Section-specific route
router.get('/vaccination-data', 
  auth,  // ✅ First authenticate
  authorizeSection('Vaccination'),  // ✅ Then check section
  asyncHandler(async (req, res) => {
    res.json({ message: 'Vaccination section data' });
  })
);

// Multiple roles allowed
router.post('/create', 
  auth,
  authorize('super_admin', 'section_supervisor'),  // ✅ Allow multiple roles
  asyncHandler(async (req, res) => {
    res.json({ message: 'Record created' });
  })
);

module.exports = router;
```

---

## Method 3: Combined Role and Section Authorization

```javascript
const { auth, authorizeRoleAndSection } = require('../middleware/auth');

// Only section supervisors from Vaccination section can access
router.post('/vaccination/approve', 
  auth,
  authorizeRoleAndSection(['section_supervisor', 'super_admin'], 'Vaccination'),
  asyncHandler(async (req, res) => {
    res.json({ message: 'Vaccination record approved' });
  })
);

// Only super_admin can access (no section restriction)
router.delete('/vaccination/:id', 
  auth,
  authorizeRoleAndSection(['super_admin'], null),  // null = no section check
  asyncHandler(async (req, res) => {
    res.json({ message: 'Record deleted' });
  })
);
```

---

## Method 4: Optional Authentication

Useful for endpoints that work differently for authenticated vs unauthenticated users.

```javascript
const { optionalAuth } = require('../middleware/auth');

router.get('/public-data', 
  optionalAuth,  // ✅ User added to req if token provided, but not required
  asyncHandler(async (req, res) => {
    if (req.user) {
      // User is authenticated
      return res.json({ 
        message: 'Personalized data',
        user: req.user.name 
      });
    }
    
    // User is not authenticated
    res.json({ message: 'Public data' });
  })
);
```

---

## Real-World Examples

### Example 1: Parasite Control Routes (Current Implementation)

```javascript
// server.js - Section-level protection
app.use('/api/parasite-control', 
  authMiddleware, 
  authorizeSection('Parasite Control'), 
  parasiteControlRoutes
);

// src/routes/parasiteControl.js
router.get('/', asyncHandler(async (req, res) => {
  // ✅ Already protected by server-level middleware
  // ✅ User is guaranteed to be from Parasite Control section or super_admin
  
  const records = await ParasiteControl.find()
    .populate('client')
    .sort({ date: -1 });
    
  res.json({ success: true, data: records });
}));

router.post('/', asyncHandler(async (req, res) => {
  // ✅ Also protected - no need to add auth again
  
  const record = new ParasiteControl({
    ...req.body,
    createdBy: req.user._id  // ✅ req.user is available
  });
  
  await record.save();
  res.json({ success: true, data: record });
}));
```

### Example 2: Mixed Access Routes

```javascript
// Some routes need different authorization levels
const router = express.Router();

// List all records - any authenticated user
router.get('/', 
  auth,
  asyncHandler(async (req, res) => {
    const records = await Record.find();
    res.json({ success: true, data: records });
  })
);

// Create record - only supervisors from this section
router.post('/', 
  auth,
  authorize('section_supervisor', 'super_admin'),
  asyncHandler(async (req, res) => {
    const record = new Record({
      ...req.body,
      createdBy: req.user._id
    });
    await record.save();
    res.json({ success: true, data: record });
  })
);

// Delete record - only super_admin
router.delete('/:id', 
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    await Record.findByIdAndDelete(req.params.id);
    res.json({ success: true, message: 'Record deleted' });
  })
);
```

### Example 3: Cross-Section Access (Reports)

```javascript
// Reports can be accessed by any authenticated user
// But filtered based on their section

router.get('/reports', 
  auth,  // ✅ Only authentication required, no section restriction
  asyncHandler(async (req, res) => {
    let filter = {};
    
    // Super admin sees all reports
    if (req.user.role !== 'super_admin') {
      // Section supervisors only see their section's reports
      filter.section = req.user.section;
    }
    
    const reports = await Report.find(filter);
    res.json({ success: true, data: reports });
  })
);
```

### Example 4: User Management Routes

```javascript
// Get all users - only admins and supervisors
router.get('/users', 
  auth,
  authorize('super_admin', 'section_supervisor'),
  asyncHandler(async (req, res) => {
    let filter = {};
    
    // Section supervisors only see users from their section
    if (req.user.role === 'section_supervisor') {
      filter.section = req.user.section;
    }
    
    const users = await User.find(filter);
    res.json({ success: true, data: users });
  })
);

// Toggle user status - only super_admin
router.put('/users/:id/toggle-status', 
  auth,
  authorize('super_admin'),
  asyncHandler(async (req, res) => {
    const user = await User.findById(req.params.id);
    user.isActive = !user.isActive;
    await user.save();
    res.json({ success: true, data: user });
  })
);
```

---

## Accessing User Information in Routes

Once authenticated, you can access user information via `req.user`:

```javascript
router.post('/create-record', auth, asyncHandler(async (req, res) => {
  // Available user properties:
  console.log(req.user._id);        // User ID
  console.log(req.user.name);       // User name
  console.log(req.user.email);      // User email
  console.log(req.user.role);       // User role (super_admin, section_supervisor, etc.)
  console.log(req.user.section);    // User section (Mobile Clinic, Vaccination, etc.)
  console.log(req.user.isActive);   // Account status
  console.log(req.user.lastLogin);  // Last login timestamp
  
  // Use user info in your logic
  const record = new Record({
    ...req.body,
    createdBy: req.user._id,
    section: req.user.section
  });
  
  await record.save();
  res.json({ success: true, data: record });
}));
```

---

## Error Responses

### 401 Unauthorized (No Token)
```json
{
  "success": false,
  "message": "Access denied. No token provided.",
  "error": "MISSING_TOKEN"
}
```

### 401 Unauthorized (Invalid Token)
```json
{
  "success": false,
  "message": "Invalid token.",
  "error": "INVALID_TOKEN"
}
```

### 403 Forbidden (Insufficient Role)
```json
{
  "success": false,
  "message": "Access denied. Insufficient permissions.",
  "error": "INSUFFICIENT_PERMISSIONS",
  "requiredRoles": ["super_admin"],
  "userRole": "section_supervisor"
}
```

### 403 Forbidden (Wrong Section)
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

---

## Best Practices

### ✅ DO:
- Apply section authorization at server level for entire section routes
- Use `auth` middleware before any authorization middleware
- Check `req.user` to filter data based on user's section/role
- Use `authorize()` for role-based restrictions
- Use `authorizeSection()` for section-based restrictions
- Log user actions for audit trails

### ❌ DON'T:
- Don't apply auth middleware twice (server + route level)
- Don't forget to check user permissions in business logic
- Don't expose sensitive data without proper authorization
- Don't hardcode user IDs or sections in code

---

## Testing Your Routes

Use the provided test script:

```bash
# 1. Seed the database with initial users
node seed-supervisors.js

# 2. Start the server
npm start

# 3. Run the test script
node test-auth.js
```

Or test manually with curl:

```bash
# Login
curl -X POST http://localhost:3001/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"clinic@ahcp.gov.sa","password":"password123"}'

# Use the token
curl -X GET http://localhost:3001/api/mobile-clinics \
  -H "Authorization: Bearer YOUR_TOKEN_HERE"
```

---

## Summary

| Scenario | Middleware to Use | Example |
|----------|------------------|---------|
| Entire section needs protection | Server-level: `auth + authorizeSection()` | Mobile Clinic, Vaccination routes |
| Single route needs auth | Route-level: `auth` | Individual protected endpoints |
| Admin-only route | `auth + authorize('super_admin')` | Delete operations |
| Section-specific route | `auth + authorizeSection('Section')` | Section data access |
| Multiple roles allowed | `auth + authorize('role1', 'role2')` | Create/Update operations |
| Optional authentication | `optionalAuth` | Public data with personalization |
| Cross-section access | `auth` only, filter in code | Reports, clients |

