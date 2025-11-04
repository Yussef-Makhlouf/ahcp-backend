const nodemailer = require('nodemailer');
const logger = require('./logger');
// Create transporter
const createTransporter = () => {
  // For development, use a test account or Gmail
  if (process.env.NODE_ENV === 'development') {
    return nodemailer.createTransporter({
      service: 'gmail',
      auth: {
        user: process.env.EMAIL_USER || 'your-email@gmail.com',
        pass: process.env.EMAIL_PASS || 'your-app-password'
      }
    });
  }

  // For production, use your SMTP settings
  return nodemailer.createTransporter({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || 587,
    secure: process.env.SMTP_SECURE === 'true', // true for 465, false for other ports
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS
    }
  });
};

// Email templates
const emailTemplates = {
  passwordReset: (resetUrl, userName) => ({
    subject: 'إعادة تعيين كلمة المرور - مشروع صحة الحيوان',
    html: `
      <!DOCTYPE html>
      <html dir="rtl" lang="ar">
      <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>إعادة تعيين كلمة المرور</title>
        <style>
          body {
            font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;
            line-height: 1.6;
            color: #333;
            max-width: 600px;
            margin: 0 auto;
            padding: 20px;
            background-color: #f4f4f4;
          }
          .container {
            background: white;
            padding: 30px;
            border-radius: 10px;
            box-shadow: 0 0 20px rgba(0,0,0,0.1);
          }
          .header {
            text-align: center;
            margin-bottom: 30px;
            padding-bottom: 20px;
            border-bottom: 2px solid #e0e0e0;
          }
          .logo {
            font-size: 24px;
            font-weight: bold;
            color: #2c3e50;
            margin-bottom: 10px;
          }
          .title {
            font-size: 20px;
            color: #34495e;
            margin-bottom: 20px;
          }
          .content {
            margin-bottom: 30px;
          }
          .button {
            display: inline-block;
            background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            color: white;
            padding: 15px 30px;
            text-decoration: none;
            border-radius: 5px;
            font-weight: bold;
            margin: 20px 0;
            text-align: center;
          }
          .button:hover {
            background: linear-gradient(135deg, #5a6fd8 0%, #6a4190 100%);
          }
          .footer {
            margin-top: 30px;
            padding-top: 20px;
            border-top: 1px solid #e0e0e0;
            font-size: 14px;
            color: #666;
            text-align: center;
          }
          .warning {
            background: #fff3cd;
            border: 1px solid #ffeaa7;
            color: #856404;
            padding: 15px;
            border-radius: 5px;
            margin: 20px 0;
          }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <div class="logo">🏥 AHCP - مشروع صحة الحيوان</div>
            <div class="title">إعادة تعيين كلمة المرور</div>
          </div>
          
          <div class="content">
            <p>مرحباً ${userName || 'عزيزي المستخدم'}،</p>
            
            <p>تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في نظام مشروع صحة الحيوان.</p>
            
            <p>إذا كنت قد طلبت هذا التغيير، يرجى النقر على الزر أدناه لإعادة تعيين كلمة المرور:</p>
            
            <div style="text-align: center;">
              <a href="${resetUrl}" class="button">إعادة تعيين كلمة المرور</a>
            </div>
            
            <div class="warning">
              <strong>تنبيه مهم:</strong>
              <ul>
                <li>هذا الرابط صالح لمدة 15 دقيقة فقط</li>
                <li>إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد</li>
                <li>لأغراض الأمان، لا تشارك هذا الرابط مع أي شخص آخر</li>
              </ul>
            </div>
            
            <p>إذا لم يعمل الزر أعلاه، يمكنك نسخ ولصق الرابط التالي في متصفحك:</p>
            <p style="word-break: break-all; background: #f8f9fa; padding: 10px; border-radius: 5px; font-family: monospace;">
              ${resetUrl}
            </p>
          </div>
          
          <div class="footer">
            <p>هذا البريد الإلكتروني تم إرساله تلقائياً من نظام مشروع صحة الحيوان</p>
            <p>© 2025 AHCP - جميع الحقوق محفوظة</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
      إعادة تعيين كلمة المرور - مشروع صحة الحيوان
      
      مرحباً ${userName || 'عزيزي المستخدم'}،
      
      تلقينا طلباً لإعادة تعيين كلمة المرور الخاصة بحسابك في نظام مشروع صحة الحيوان.
      
      إذا كنت قد طلبت هذا التغيير، يرجى النقر على الرابط التالي لإعادة تعيين كلمة المرور:
      ${resetUrl}
      
      تنبيه مهم:
      - هذا الرابط صالح لمدة 15 دقيقة فقط
      - إذا لم تطلب إعادة تعيين كلمة المرور، يرجى تجاهل هذا البريد
      - لأغراض الأمان، لا تشارك هذا الرابط مع أي شخص آخر
      
      هذا البريد الإلكتروني تم إرساله تلقائياً من نظام مشروع صحة الحيوان
      © 2025 ARTAT System - جميع الحقوق محفوظة
    `
  })
};

// Send email function
const sendEmail = async (to, template, data) => {
  try {
    const transporter = createTransporter();
    const emailTemplate = emailTemplates[template](...data);
    
    const mailOptions = {
      from: process.env.EMAIL_FROM || process.env.EMAIL_USER || 'noreply@ahcp.gov.sa',
      to: to,
      subject: emailTemplate.subject,
      html: emailTemplate.html,
      text: emailTemplate.text
    };

    const result = await transporter.sendMail(mailOptions);
    logger.info('Email sent successfully:', { data: result.messageId });
    return { success: true, messageId: result.messageId };
  } catch (error) {
    logger.error('Email sending failed:', { error: error });
    return { success: false, error: error.message };
  }
};

// Send password reset email
const sendPasswordResetEmail = async (email, resetUrl, userName) => {
  return await sendEmail(email, 'passwordReset', [resetUrl, userName]);
};

module.exports = {
  sendEmail,
  sendPasswordResetEmail,
  emailTemplates
};
