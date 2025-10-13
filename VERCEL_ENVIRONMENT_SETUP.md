# Vercel Environment Variables Setup

## 🚨 CRITICAL: Database Connection Issue

The backend is currently showing "database":"Disconnected" because the environment variables are not properly configured on Vercel.

## Required Environment Variables

You need to set these environment variables in your Vercel dashboard:

### 1. Database Configuration
```
MONGODB_URI=mongodb+srv://yussefmakhloufiti_db_user:Yussef12345@cluster0.pgy8qei.mongodb.net/ahcp_database?retryWrites=true&w=majority&appName=Cluster0
```

### 2. JWT Configuration
```
JWT_SECRET=ahcp_super_secret_key_2024_development_only_change_in_production_123456789
JWT_EXPIRES_IN=7d
```

### 3. API Configuration
```
NODE_ENV=production
API_DOCS_ENABLED=false
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### 4. CORS Configuration
```
CORS_ORIGIN=https://your-frontend-domain.vercel.app
```

## How to Set Environment Variables in Vercel

1. Go to your Vercel dashboard
2. Select your project (ahcp-backend)
3. Go to Settings → Environment Variables
4. Add each variable with its value
5. Make sure to set them for "Production" environment
6. Redeploy your application

## Quick Fix Commands

If you have Vercel CLI installed:

```bash
# Set environment variables via CLI
vercel env add MONGODB_URI
vercel env add JWT_SECRET
vercel env add NODE_ENV
vercel env add CORS_ORIGIN

# Redeploy
vercel --prod
```

## Verification

After setting the environment variables and redeploying, test the health endpoint:

```bash
curl https://ahcp-backend.vercel.app/health
```

You should see:
```json
{
  "status": "OK",
  "database": "Connected"
}
```

## Current Status

- ✅ Backend is deployed and running
- ❌ Database connection is missing
- ❌ Environment variables not configured
- ❌ API routes returning 500 errors

## Next Steps

1. Set the environment variables in Vercel dashboard
2. Redeploy the application
3. Test the API endpoints
4. Verify database connection
