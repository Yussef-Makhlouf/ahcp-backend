# AHCP Backend - Vercel Deployment Guide

This guide will help you deploy the AHCP Backend API to Vercel.

## Prerequisites

1. **Vercel Account**: Sign up at [vercel.com](https://vercel.com)
2. **MongoDB Atlas**: Set up a MongoDB Atlas cluster
3. **GitHub Repository**: Your code should be in a GitHub repository

## Step 1: Prepare Your Repository

The following files have been created for Vercel deployment:

- `vercel.json` - Vercel configuration
- `api/index.js` - Serverless function handler
- `vercel-env-example.txt` - Environment variables template

## Step 2: Deploy to Vercel

### Option A: Deploy via Vercel CLI

1. **Install Vercel CLI**:
   ```bash
   npm install -g vercel
   ```

2. **Login to Vercel**:
   ```bash
   vercel login
   ```

3. **Navigate to your backend directory**:
   ```bash
   cd ahcp-backend
   ```

4. **Deploy**:
   ```bash
   vercel
   ```

5. **Follow the prompts**:
   - Link to existing project? No
   - Project name: `ahcp-backend` (or your preferred name)
   - Directory: `./` (current directory)
   - Override settings? No

### Option B: Deploy via Vercel Dashboard

1. Go to [vercel.com/dashboard](https://vercel.com/dashboard)
2. Click "New Project"
3. Import your GitHub repository
4. Set the root directory to `ahcp-backend`
5. Click "Deploy"

## Step 3: Configure Environment Variables

After deployment, you need to set up environment variables in Vercel:

1. Go to your project dashboard on Vercel
2. Navigate to "Settings" → "Environment Variables"
3. Add the following variables:

### Required Variables:

```bash
NODE_ENV=production
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/ahcp_database?retryWrites=true&w=majority
JWT_SECRET=your_super_secure_jwt_secret_key_here
CORS_ORIGIN=https://your-frontend-domain.vercel.app
```

### Optional Variables:

```bash
API_DOCS_ENABLED=false
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
JWT_EXPIRES_IN=7d
FROM_EMAIL=noreply@ahcp.gov.sa
MAX_FILE_SIZE=10485760
BCRYPT_ROUNDS=12
```

## Step 4: Generate JWT Secret

Generate a secure JWT secret:

```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

Use the output as your `JWT_SECRET` value.

## Step 5: Update CORS Origin

Set `CORS_ORIGIN` to your frontend domain:
- If your frontend is also on Vercel: `https://your-frontend-app.vercel.app`
- For local development: `http://localhost:3000`

## Step 6: Test Your Deployment

1. **Health Check**: Visit `https://your-app.vercel.app/health`
2. **API Root**: Visit `https://your-app.vercel.app/`
3. **Test Authentication**: Try logging in through your frontend

## Step 7: Update Frontend Configuration

Update your frontend to use the new Vercel API URL:

```javascript
// In your frontend configuration
const API_BASE_URL = 'https://your-backend-app.vercel.app';
```

## Important Notes

### File Uploads
- Vercel has limitations with file uploads in serverless functions
- Consider using cloud storage (AWS S3, Cloudinary) for file uploads
- The current upload functionality may need modification

### Database Connection
- Ensure your MongoDB Atlas cluster allows connections from Vercel
- Add `0.0.0.0/0` to your IP whitelist in MongoDB Atlas

### Cold Starts
- Serverless functions may have cold start delays
- Consider upgrading to Vercel Pro for better performance

## Troubleshooting

### Common Issues:

1. **Database Connection Errors**:
   - Check MongoDB Atlas IP whitelist
   - Verify connection string format
   - Ensure database user has proper permissions

2. **CORS Errors**:
   - Update `CORS_ORIGIN` environment variable
   - Check frontend domain matches exactly

3. **Authentication Issues**:
   - Verify `JWT_SECRET` is set correctly
   - Check token expiration settings

4. **Build Errors**:
   - Ensure all dependencies are in `package.json`
   - Check Node.js version compatibility

### Debugging:

1. **Check Vercel Logs**:
   - Go to your project dashboard
   - Click on "Functions" tab
   - View function logs

2. **Test Locally**:
   ```bash
   vercel dev
   ```

## Production Checklist

- [ ] Environment variables configured
- [ ] MongoDB Atlas cluster accessible
- [ ] JWT secret generated and set
- [ ] CORS origin set to production frontend
- [ ] API documentation disabled (if desired)
- [ ] Rate limiting configured
- [ ] Health check endpoint working
- [ ] Frontend updated with new API URL

## Support

If you encounter issues:

1. Check Vercel documentation: [vercel.com/docs](https://vercel.com/docs)
2. Review function logs in Vercel dashboard
3. Test API endpoints individually
4. Verify environment variables are set correctly

## Next Steps

After successful deployment:

1. Update your frontend to use the new API URL
2. Test all API endpoints
3. Set up monitoring and alerts
4. Configure custom domain (optional)
5. Set up CI/CD for automatic deployments

---

**Deployment URL**: `https://your-app-name.vercel.app`
**Health Check**: `https://your-app-name.vercel.app/health`
**API Documentation**: `https://your-app-name.vercel.app/api-docs` (if enabled)
