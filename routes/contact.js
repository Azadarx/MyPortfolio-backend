// routes/contact.js
import express from 'express';
import nodemailer from 'nodemailer';
import { executeQuery } from '../server/db.js';
import dotenv from 'dotenv';

dotenv.config();

const router = express.Router();

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const adminEmailTemplate = ({ name, email, subject, message }) => `...`; // keep original markup
const adminEmailTemplate = ({ name, email, subject, message }) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); color: white; padding: 20px; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 20px; border: 1px solid #e5e7eb; }
    .info-row { margin: 10px 0; padding: 10px; background: white; border-radius: 4px; }
    .label { font-weight: bold; color: #14b8a6; }
    .message-box { background: white; padding: 15px; border-left: 4px solid #14b8a6; margin-top: 15px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h2>🔔 New Contact Form Submission</h2>
    </div>
    <div class="content">
      <div class="info-row">
        <span class="label">From:</span> ${name}
      </div>
      <div class="info-row">
        <span class="label">Email:</span> ${email}
      </div>
      <div class="info-row">
        <span class="label">Subject:</span> ${subject}
      </div>
      <div class="message-box">
        <p class="label">Message:</p>
        <p>${message.replace(/\n/g, '<br>')}</p>
      </div>
    </div>
  </div>
</body>
</html>
`;

const userEmailTemplate = ({ name }) => `
<!DOCTYPE html>
<html>
<head>
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #14b8a6 0%, #06b6d4 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
    .content { background: #f9fafb; padding: 30px; border: 1px solid #e5e7eb; border-top: none; }
    .footer { background: #1f2937; color: #9ca3af; padding: 20px; text-align: center; border-radius: 0 0 8px 8px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>✅ Message Received!</h1>
    </div>
    <div class="content">
      <p>Hi ${name},</p>
      <p>Thank you for reaching out! I've received your message and will get back to you as soon as possible.</p>
      <p>I typically respond within 24-48 hours on business days.</p>
      <p>Best regards,<br><strong>Syed Azadar Hussayn</strong></p>
    </div>
    <div class="footer">
      <p>📧 syedazadarhussayn@gmail.com</p>
      <p>📍 Hyderabad, Telangana</p>
    </div>
  </div>
</body>
</html>
`;

transporter.verify(function (error, success) {
  if (error) {
    console.error('❌ Email configuration error:', error);
  } else {
    console.log('✅ Email server is ready to send messages');
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, email, subject, message } = req.body;

    if (!name || name.trim().length < 2) return res.status(400).json({ message: 'Name must be at least 2 characters' });
    if (!email || !isValidEmail(email)) return res.status(400).json({ message: 'Valid email is required' });
    if (!subject || subject.trim().length < 3) return res.status(400).json({ message: 'Subject must be at least 3 characters' });
    if (!message || message.trim().length < 10) return res.status(400).json({ message: 'Message must be at least 10 characters' });

    const insertSql = `
      INSERT INTO contact_messages (name, email, subject, message, createdAt)
      VALUES ($1, $2, $3, $4, CURRENT_TIMESTAMP)
      RETURNING id
    `;
    const rows = await executeQuery(insertSql, [name.trim(), email.trim(), subject.trim(), message.trim()]);
    const insertedId = rows[0]?.id;

    const mailOptionsAdmin = {
      from: `"Portfolio Contact" <${process.env.EMAIL_USER}>`,
      to: process.env.ADMIN_EMAIL,
      subject: `New Contact Form Submission: ${subject}`,
      html: adminEmailTemplate({ name, email, subject, message }),
    };

    const mailOptionsUser = {
      from: `"Syed Azadar Hussayn" <${process.env.EMAIL_USER}>`,
      to: email,
      subject: 'Thank You for Contacting Me!',
      html: userEmailTemplate({ name }),
    };

    await Promise.all([
      transporter.sendMail(mailOptionsAdmin),
      transporter.sendMail(mailOptionsUser),
    ]);

    res.status(200).json({ message: 'Message sent successfully and stored in database', id: insertedId });
  } catch (error) {
    console.error('Error processing contact form:', error);
    res.status(500).json({ message: 'Server error while processing contact form', error: error.message });
  }
});

export default router;
