const nodemailer = require('nodemailer')

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT),
    secure: false, // 587 = TLS, 465 = SSL
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
    family: 4 // принудительно использовать IPv4
})

async function sendMail(to, subject, html) {
    const info = await transporter.sendMail({
        from: `"OYU LearnKZ" <${process.env.SMTP_USER}>`,
        to,
        subject,
        html,
    })
    console.log('Email sent: %s', info.messageId)
}

module.exports = sendMail