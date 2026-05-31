import smtplib

from email.mime.multipart import MIMEMultipart

from email.mime.text import MIMEText

from app.core.config import settings


# =========================================
# BASE EMAIL SENDER
# =========================================

def send_email(
    receiver_email: str,
    subject: str,
    html_body: str,
    text_body: str | None = None,
) -> bool:
    """Send email via SMTP.

    Returns True if sent, False otherwise.
    NEVER raises exceptions so email delivery can't crash registration.
    """

    try:
        # If SMTP isn't configured, skip silently.
        if (
            not getattr(settings, "EMAIL_ENABLED", True)
            or not getattr(settings, "smtp_host", None)
            or not getattr(settings, "smtp_user", None)
            or not getattr(settings, "SMTP_PASSWORD", None)
            or not getattr(settings, "email_from", None)
        ):
            print(
                f"[EMAIL SKIPPED] SMTP not configured. "
                f"to={receiver_email} subject={subject}"
            )
            return False

        msg = MIMEMultipart("alternative")
        msg["From"] = settings.email_from
        msg["To"] = receiver_email
        msg["Subject"] = subject

        if text_body:
            msg.attach(MIMEText(text_body, "plain"))

        msg.attach(MIMEText(html_body, "html"))

        with smtplib.SMTP(
            settings.smtp_host,
            int(settings.SMTP_PORT),
            timeout=10,
        ) as server:
            # Use EHLO to ensure server extensions are available.
            server.ehlo()
            server.starttls()
            server.ehlo()

            server.login(
                settings.smtp_user,
                settings.SMTP_PASSWORD,
            )

            server.sendmail(
                settings.email_from,
                receiver_email,
                msg.as_string(),
            )

        print(f"[EMAIL SENT] to={receiver_email} subject={subject}")
        return True

    except Exception as e:
        # Includes socket.gaierror (hostname resolution), connect errors, etc.
        print(
            f"[EMAIL ERROR] Could not send email to {receiver_email}. "
            f"subject={subject} error={e}"
        )
        return False


# =========================================
# EMAIL TEMPLATE
# =========================================

def workflowos_email_template(
    title: str,
    intro: str,
    details: list[tuple[str, str]],
    cta: str,
):
    detail_rows = "".join(
        f"""
        <tr>
          <td style="padding:8px 0;color:#64748b;font-size:14px;">
            {label}
          </td>

          <td style="
            padding:8px 0;
            color:#0f172a;
            font-size:14px;
            font-weight:700;
            text-align:right;
          ">
            {value}
          </td>
        </tr>
        """
        for label, value in details
    )

    return f"""
    <html>

      <body style="
        margin:0;
        background:#f8fafc;
        font-family:Arial,sans-serif;
        color:#0f172a;
      ">

        <div style="
          max-width:640px;
          margin:0 auto;
          padding:32px 18px;
        ">

          <div style="
            background:#ffffff;
            border:1px solid #e2e8f0;
            border-radius:14px;
            overflow:hidden;
          ">

            <div style="
              background:#0f172a;
              padding:22px 26px;
              color:#ffffff;
            ">

              <div style="
                font-size:13px;
                letter-spacing:.08em;
                text-transform:uppercase;
                color:#cbd5e1;
              ">

                WorkflowOS Intelligence

              </div>

              <h1 style="
                margin:10px 0 0;
                font-size:24px;
              ">

                {title}

              </h1>

            </div>


            <div style="padding:26px;">

              <p style="
                margin:0 0 18px;
                font-size:16px;
                line-height:1.6;
                color:#334155;
              ">

                {intro}

              </p>


              <div style="
                border:1px solid #e2e8f0;
                border-radius:12px;
                padding:14px 18px;
                margin:20px 0;
                background:#f8fafc;
              ">

                <table style="
                  width:100%;
                  border-collapse:collapse;
                ">

                  {detail_rows}

                </table>

              </div>


              <p style="
                margin:0;
                font-size:15px;
                line-height:1.6;
                color:#475569;
              ">

                {cta}

              </p>

            </div>

          </div>

        </div>

      </body>

    </html>
    """


# =========================================
# DEADLINE EMAIL
# =========================================

def send_deadline_email(
    receiver_email: str,
    project_name: str,
    remaining_time: str,
    deadline: str,
    project_status: str,
):
    subject = f"Critical deadline alert: {project_name}"
    intro = (
        f"Your project deadline is approaching "
        f"in less than 12 hours."
    )

    details = [
        ("Project", project_name),
        ("Remaining time", remaining_time),
        ("Deadline", deadline),
        ("Status", project_status),
    ]

    html_body = workflowos_email_template(
        title="Project deadline approaching",
        intro=intro,
        details=details,
        cta="Open WorkflowOS and review delivery progress immediately.",
    )

    text_body = (
        f"Project: {project_name}\n"
        f"Remaining time: {remaining_time}\n"
        f"Deadline: {deadline}\n"
        f"Status: {project_status}"
    )

    send_email(
        receiver_email=receiver_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )


# =========================================
# PROJECT ALERT EMAIL
# =========================================

def send_project_alert_email(
    receiver_email: str,
    project_name: str,
    alert_title: str,
    alert_message: str,
    deadline: str,
    project_status: str,
):
    subject = f"WorkflowOS Alert: {alert_title}"

    html_body = workflowos_email_template(
        title=alert_title,
        intro=alert_message,
        details=[
            ("Project", project_name),
            ("Deadline", deadline),
            ("Status", project_status),
        ],
        cta="Open WorkflowOS to review project risks and next actions.",
    )

    send_email(
        receiver_email=receiver_email,
        subject=subject,
        html_body=html_body,
        text_body=alert_message,
    )


# =========================================
# OTP EMAIL
# =========================================

def send_otp_email(
    receiver_email: str,
    otp: str,
):
    send_email(
        receiver_email=receiver_email,
        subject="WorkflowOS Password Reset OTP",
        html_body=f"""
        <p>
            Your WorkflowOS OTP code is:
        </p>

        <h2>
            {otp}
        </h2>

        <p>
            This code expires in 10 minutes.
        </p>

        """,
        text_body=f"Your OTP code is: {otp}",
    )


def send_verification_email(
    receiver_email: str,
    otp: str,
) -> bool:
    html_body = workflowos_email_template(
        title="Verify your WorkflowOS email",
        intro=(
            "Use this one-time code to finish creating "
            "your WorkflowOS account."
        ),
        details=[
            ("Verification code", otp),
            ("Expires in", "10 minutes"),
        ],
        cta=(
            "If you did not create a WorkflowOS account, "
            "you can safely ignore this email."
        ),
    )

    return send_email(
        receiver_email=receiver_email,
        subject="Verify your WorkflowOS email",
        html_body=html_body,
        text_body=(
            f"Your WorkflowOS verification code is {otp}. "
            "It expires in 10 minutes."
        ),
    )


def send_mfa_email(
    receiver_email: str,
    otp: str,
):
    html_body = workflowos_email_template(
        title="WorkflowOS login verification",
        intro=(
            "A sign-in attempt needs your second factor. "
            "Use this one-time code to continue."
        ),
        details=[
            ("Login code", otp),
            ("Expires in", "10 minutes"),
        ],
        cta=(
            "If this was not you, change your password "
            "and review account access immediately."
        ),
    )

    send_email(
        receiver_email=receiver_email,
        subject="WorkflowOS login verification code",
        html_body=html_body,
        text_body=(
            f"Your WorkflowOS login code is {otp}. "
            "It expires in 10 minutes."
        ),
    )


# =========================================
# INVITATION EMAIL
# =========================================

def send_invitation_email(
    to_email: str,
    project_name: str,
    inviter_name: str,
    role: str,
    invitation_token: str,
):
    invite_link = (
        f"http://localhost:5173/accept-invitation/{invitation_token}"
    )

    subject = f"You were invited to collaborate on {project_name}"

    html_body = f"""

    <html>

      <body style="
        font-family:Arial;
        background:#f8fafc;
        padding:40px;
      ">

        <div style="
          max-width:600px;
          margin:auto;
          background:white;
          border-radius:16px;
          padding:40px;
          border:1px solid #e2e8f0;
        ">

          <h1 style="color:#0f172a;">

            WorkflowOS Invitation

          </h1>


          <p style="
            font-size:16px;
            color:#475569;
          ">

            <strong>{inviter_name}</strong>

            invited you to collaborate on:

          </p>


          <h2 style="
            color:#2563eb;
          ">

            {project_name}

          </h2>


          <p style="
            font-size:16px;
            color:#334155;
          ">

            Assigned Role:
            <strong>{role}</strong>

          </p>


          <a
            href="{invite_link}"
            style="
              display:inline-block;
              margin-top:24px;
              background:#2563eb;
              color:white;
              padding:14px 24px;
              text-decoration:none;
              border-radius:10px;
              font-weight:600;
            "
          >

            Accept Invitation

          </a>


          <p style="
            margin-top:30px;
            color:#94a3b8;
            font-size:14px;
          ">

            This invitation expires in 7 days.

          </p>

        </div>

      </body>

    </html>
    """

    text_body = (
        f"{inviter_name} invited you to collaborate on {project_name} as {role}.\n\n"
        f"Invitation Link:\n{invite_link}"
    )

    send_email(
        receiver_email=to_email,
        subject=subject,
        html_body=html_body,
        text_body=text_body,
    )

