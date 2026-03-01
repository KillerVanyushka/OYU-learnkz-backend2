const Mailjet = require('node-mailjet')
const mailjet = Mailjet.apiConnect(
    process.env.MAILJET_API_KEY,
    process.env.MAILJET_SECRET_KEY
)

async function sendMail(to, subject, html) {
    try {
        const request = await mailjet.post('send', { version: 'v3.1' }).request({
            Messages: [
                {
                    From: {
                        Email: process.env.MAILJET_FROM_EMAIL,
                        Name: process.env.MAILJET_FROM_NAME,
                    },
                    To: [{ Email: to }],
                    Subject: subject,
                    HTMLPart: html,
                },
            ],
        })

        console.log('Email sent:', request.body.Messages[0].Status)
    } catch (err) {
        console.error('Mailjet error:', err.statusCode, err.message)
    }
}

module.exports = sendMail