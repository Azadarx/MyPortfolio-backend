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
const userEmailTemplate = ({ name }) => `...`; // keep original markup

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
