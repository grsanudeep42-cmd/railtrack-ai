import os
import resend

FRONTEND_URL = os.getenv("FRONTEND_URL", "http://localhost:3000")

def send_invite_email(to_email: str, to_name: str, role: str, section: str):
    resend.api_key = os.getenv("RESEND_API_KEY")
    
    if not resend.api_key:
        raise Exception("RESEND_API_KEY not set in environment")
    
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
    
    resend.Emails.send({
        "from": "RailTrack AI <onboarding@resend.dev>",
        "to": to_email,
        "subject": "You've been invited to RailTrack AI",
        "html": html_body,
    })