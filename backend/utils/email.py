import smtplib
import os
import logging
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart

logger = logging.getLogger(__name__)

GMAIL_USER = os.getenv("GMAIL_USER")
GMAIL_APP_PASSWORD = os.getenv("GMAIL_APP_PASSWORD")
FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

def send_invite_email(to_email: str, to_name: str, role: str, section: str):
    logger.info("[EMAIL] Sending invite to %s", to_email)

    if not GMAIL_USER or not GMAIL_APP_PASSWORD:
        logger.error("[EMAIL] Missing GMAIL_USER or GMAIL_APP_PASSWORD in .env — invite not sent.")
        return

    # Type assertions — we've already guarded above, these satisfy the type checker
    assert GMAIL_USER is not None
    assert GMAIL_APP_PASSWORD is not None
    
    subject = "You've been invited to RailTrack AI"
    setup_link = f"{FRONTEND_URL}/auth/setup?email={to_email}"
    
    html_body = f"""
    <div style="font-family: monospace; background: #0d0f14; color: #e8eaf0; padding: 40px; max-width: 520px; margin: auto; border-radius: 8px; border: 1px solid #1e2330;">
      <div style="color: #00e5ff; font-size: 20px; font-weight: bold; margin-bottom: 4px;">RAILTRACK AI</div>
      <div style="color: #6b7280; font-size: 12px; margin-bottom: 32px;">Intelligent Railway Management System</div>
      <div style="font-size: 18px; color: #e8eaf0; margin-bottom: 12px;">Hello {to_name},</div>
      <p style="color: #9ca3af; line-height: 1.6;">
        You've been invited to join <strong style="color:#00e5ff;">RailTrack AI</strong> as a 
        <strong style="color:#e8eaf0;">{role}</strong> for section <strong style="color:#e8eaf0;">{section}</strong>.
      </p>
      <a href="{setup_link}" style="display:inline-block; margin: 24px 0; background:#00e5ff; color:#0d0f14; padding: 12px 28px; border-radius: 6px; font-weight: bold; text-decoration: none; font-size: 14px;">
        Set Up Your Account →
      </a>
      <p style="color: #4b5563; font-size: 12px; margin-top: 24px;">If you weren't expecting this, ignore this email. Link expires in 48 hours.</p>
    </div>
    """
    
    msg = MIMEMultipart("alternative")
    msg["Subject"] = subject
    msg["From"] = f"RailTrack AI <{GMAIL_USER}>"
    msg["To"] = to_email
    msg.attach(MIMEText(html_body, "html"))
    
    try:
        logger.info("[EMAIL] Connecting to smtp.gmail.com:465...")
        with smtplib.SMTP_SSL("smtp.gmail.com", 465) as server:
            server.set_debuglevel(0)  # 0 = no verbose SMTP output in production
            server.login(GMAIL_USER, GMAIL_APP_PASSWORD)
            server.sendmail(GMAIL_USER, to_email, msg.as_string())
            logger.info("[EMAIL] Invite email sent successfully to %s", to_email)
    except smtplib.SMTPAuthenticationError as e:
        logger.error("[EMAIL] Auth failed — check GMAIL_USER and GMAIL_APP_PASSWORD: %s", e)
        raise
    except smtplib.SMTPException as e:
        logger.error("[EMAIL] SMTP error: %s", e)
        raise
    except Exception as e:
        logger.error("[EMAIL] Unexpected error: %s", e)
        raise
